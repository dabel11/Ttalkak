#!/usr/bin/env bash
# Verify backup/restore using the disposable ttalkak-ci Docker Compose database ONLY.
# Never point this script at Railway, production, or a user-supplied host.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${TTALKAK_CI_RESTORE_DRILL:-}" != "1" ]]; then
  echo "Refusing to run: disposable CI-only restore drill."
  exit 2
fi

cd "$(dirname "$0")/.."
compose=(docker compose -p ttalkak-ci -f docker/compose.ci.yml)
original_db=ttalkak_ci
restore_db=ttalkak_ci_restore
scratch="$(mktemp -d)"
umask 077
trap 'rm -rf "$scratch"' EXIT

# Public fixture password from docker/compose.ci.yml; NEVER production credentials.
dbexec=("${compose[@]}" exec -T -e MYSQL_PWD=ci-only-password mysql)
"${dbexec[@]}" mysqldump --user=root --single-transaction --quick \
  --no-tablespaces --set-gtid-purged=OFF "$original_db" > "$scratch/backup.sql"
[[ -s "$scratch/backup.sql" ]] || { echo "FAIL: empty CI backup"; exit 1; }

# Create a separate database in the disposable container; never overwrite source.
"${dbexec[@]}" mysql --user=root -e \
  "CREATE DATABASE $restore_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
"${dbexec[@]}" mysql --user=root "$restore_db" < "$scratch/backup.sql"

get_tables() {
  "${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='$1' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;" |
    tr -d '\r'
}

source_tables="$(get_tables "$original_db")"
restored_tables="$(get_tables "$restore_db")"
[[ -n "$source_tables" && "$source_tables" == "$restored_tables" ]] || {
  echo "FAIL: restored schema/table list differs from CI source"
  exit 1
}

# Check that restored column definitions and indexes match, not merely row
# counts. Results contain only schema metadata from disposable fixture databases.
# Exclude schema-qualified values from the comparison by selecting explicit fields.
get_schema_columns() {
  "${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT, '<NULL>'), EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$1' ORDER BY TABLE_NAME, ORDINAL_POSITION;" |
    tr -d '\r'
}
get_schema_indexes() {
  "${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, IFNULL(COLUMN_NAME, '<NULL>'), IFNULL(SUB_PART, -1), INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='$1' ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;" |
    tr -d '\r'
}
get_schema_constraints() {
  "${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='$1' ORDER BY TABLE_NAME, CONSTRAINT_NAME;" |
    tr -d '\r'
}
get_schema_foreign_keys() {
  "${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, ORDINAL_POSITION, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='$1' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;" |
    tr -d '\r'
}
for metadata in columns indexes constraints foreign_keys; do
  getter="get_schema_$metadata"
  original="$("$getter" "$original_db")"
  restored="$("$getter" "$restore_db")"
  [[ "$original" == "$restored" ]] || {
    echo "FAIL: restored MySQL $metadata metadata differs from disposable source"
    exit 1
  }
  echo "PASS: restored MySQL $metadata metadata matches"
done

# Compare deterministic table contents as well as counts. A restored table
# with altered values can have identical row counts. Use disposable CI fixture
# data only and never print row values or SQL dumps.
# SQL table names are validated before interpolation.
compare_table_data() {
  local table="$1"
  local source_digest restored_digest
  source_digest="$("${dbexec[@]}" mysqldump --user=root --no-create-info \
    --skip-comments --skip-dump-date --skip-extended-insert --skip-add-locks \
    --skip-disable-keys --skip-set-charset --skip-tz-utc \
    "$original_db" "$table" | sha256sum | awk '{print $1}')"
  restored_digest="$("${dbexec[@]}" mysqldump --user=root --no-create-info \
    --skip-comments --skip-dump-date --skip-extended-insert --skip-add-locks \
    --skip-disable-keys --skip-set-charset --skip-tz-utc \
    "$restore_db" "$table" | sha256sum | awk '{print $1}')"
  [[ "$source_digest" == "$restored_digest" ]] || {
    echo "FAIL: restored table content differs: $table"
    exit 1
  }
}

# Compare real counts, not estimates from information_schema.TABLE_ROWS.
required_tables=(members guest_usage member_token_usage prompt_posts prompt_saves)
for table in "${required_tables[@]}"; do
  if ! grep -Fxq "$table" <<< "$source_tables"; then
    echo "FAIL: missing expected CI table: $table"
    exit 1
  fi
done
# Compare every table's exact row count, including tables added in future.
# Names originate from information_schema, not user input.
while IFS= read -r table; do
  [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || {
    echo "FAIL: unexpected CI table identifier"
    exit 1
  }
  source_count="$("${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT COUNT(*) FROM $original_db.$table;" | tr -d '\r')"
  restored_count="$("${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT COUNT(*) FROM $restore_db.$table;" | tr -d '\r')"
  [[ "$source_count" == "$restored_count" ]] || {
    echo "FAIL: restored row count mismatch: $table"
    exit 1
  }
  compare_table_data "$table"
  echo "PASS: restored $table row count and content digest match"
done <<< "$source_tables"

echo "PASS: disposable MySQL backup and isolated restore; source database unmodified"
