#!/usr/bin/env bash
# Audit ONLY the disposable CI MySQL stack; no Railway access or PII output.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${TTALKAK_CI_WITHDRAWAL_AUDIT:-}" != "1" ]]; then
  echo "Refusing to run: disposable CI-only withdrawal inventory."
  exit 2
fi

cd "$(dirname "$0")/.."
compose=(docker compose -p ttalkak-ci -f docker/compose.ci.yml)
sql=backend/db/manual/withdrawal-retention-inventory.sql
[[ -f "$sql" ]] || { echo "FAIL: aggregate SQL missing"; exit 1; }

# SET TRANSACTION READ ONLY protects against accidental DML in future edits.
# Credentials refer exclusively to public Docker Compose test fixtures.
{
  printf 'SET TRANSACTION READ ONLY;\nSTART TRANSACTION;\n'
  cat "$sql"
  printf '\nROLLBACK;\n'
} | "${compose[@]}" exec -T -e MYSQL_PWD=ci-only-password mysql \
      mysql --user=root --database=ttalkak_ci --batch --skip-column-names \
    | python3 scripts/check-withdrawal-inventory-output.py --ci-zero-risk

echo "PASS: disposable CI withdrawn-account aggregate audit only"
