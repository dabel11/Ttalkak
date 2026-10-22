#!/usr/bin/env bash
# Disposable CI-only MySQL 9 compatibility rehearsal.
# This validates a schema bootstrapped by the same application, NOT Railway's existing schema.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${TTALKAK_MYSQL9_VALIDATE_CI:-}" != "1" ]]; then
  echo "Refusing to run outside explicitly authorized disposable GitHub CI."
  exit 2
fi
unset DB_URL DB_USERNAME DB_PASSWORD MYSQL_URL DATABASE_URL
cd "$(dirname "$0")/.."
compose=(docker compose -p ttalkak-mysql9-validate-ci -f docker/compose.mysql9-validate.ci.yml)
cleanup() { JPA_DDL_AUTO=none "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
JPA_DDL_AUTO=update "${compose[@]}" up -d --wait mysql
# The mysql-only up command does not build the backend image.
JPA_DDL_AUTO=update "${compose[@]}" build backend
# Start the app twice against the SAME disposable database. First it creates
# the disposable schema; then validate must accept it without doing DDL.
for mode in update validate; do
  cid="$(JPA_DDL_AUTO="$mode" "${compose[@]}" run -d --no-deps --name "ttalkak-mysql9-validate-${mode}" backend)"
  passed=0
  for attempt in $(seq 1 120); do
    if docker logs "$cid" 2>&1 | grep -Eq 'Started [[:alnum:]_.]+ in [0-9.]+ seconds'; then
      passed=1
      break
    fi
    state="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)"
    if [[ "$state" != "true" ]]; then break; fi
    sleep 2
  done
  if [[ "$passed" != "1" ]]; then
    echo "FAIL: disposable backend did not start with ddl-auto=$mode"
    # Avoid uploading raw application logs; they may include configuration or PII.
  fi
  docker stop "$cid" >/dev/null 2>&1 || true
  docker rm "$cid" >/dev/null 2>&1 || true
  if [[ "$passed" != "1" ]]; then exit 1; fi
  echo "PASS: disposable MySQL 9 backend boot with ddl-auto=$mode"
done
echo "IMPORTANT: This does not validate or restore Railway's existing schema."
