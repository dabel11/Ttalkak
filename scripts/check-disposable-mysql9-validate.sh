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
JPA_DDL_AUTO=update "${compose[@]}" up --build -d --wait mysql
# Start the app twice against the SAME disposable database. First it creates
# the disposable schema; then validate must accept it without doing DDL.
for mode in update validate; do
  cid="$(JPA_DDL_AUTO="$mode" "${compose[@]}" run -d --no-deps backend)"
  passed=0
  for attempt in $(seq 1 120); do
    if docker logs "$cid" 2>&1 | grep -q 'Started .* in .* seconds'; then
      passed=1
      break
    fi
    state="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)"
    if [[ "$state" != "true" ]]; then break; fi
    sleep 2
  done
  docker stop "$cid" >/dev/null 2>&1 || true
  docker rm "$cid" >/dev/null 2>&1 || true
  if [[ "$passed" != "1" ]]; then
    echo "FAIL: disposable backend did not start with ddl-auto=$mode"
    exit 1
  fi
  echo "PASS: disposable MySQL 9 backend boot with ddl-auto=$mode"
done
echo "IMPORTANT: This does not validate or restore Railway's existing schema."
