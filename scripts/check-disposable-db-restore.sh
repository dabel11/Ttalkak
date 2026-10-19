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

# Compare real counts, not estimates from information_schema.TABLE_ROWS.
required_tables=(members guest_usage member_token_usage prompt_posts prompt_saves)
for table in "${required_tables[@]}"; do
  if ! grep -Fxq "$table" <<< "$source_tables"; then
    echo "FAIL: missing expected CI table: $table"
    exit 1
  fi
  source_count="$("${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT COUNT(*) FROM $original_db.$table;" | tr -d '\r')"
  restored_count="$("${dbexec[@]}" mysql --user=root -N -B -e \
    "SELECT COUNT(*) FROM $restore_db.$table;" | tr -d '\r')"
  [[ "$source_count" == "$restored_count" ]] || {
    echo "FAIL: restored row count mismatch: $table"
    exit 1
  }
  echo "PASS: restored $table row count matches ($source_count)"
done

echo "PASS: disposable MySQL backup and isolated restore; source database unmodified"
