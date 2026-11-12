#!/usr/bin/env bash
# Sobe um Postgres temporário, aplica as migrations (menos a de cron, que depende de extensões do Supabase)
# e roda os testes de banco. Uso: npm run test:db
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="$(dirname "$(ls /usr/lib/postgresql/*/bin/initdb | tail -1)")"
work="$(mktemp -d)"; port="${PGTEST_PORT:-54329}"
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$work"
trap 'run "$bin/pg_ctl -D $work/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
run "$bin/initdb -D $work/data -U postgres -A trust" >/dev/null
run "$bin/pg_ctl -D $work/data -o \"-p $port -c listen_addresses=localhost -k $work\" -l $work/log -w start" >/dev/null
q() { psql -X -q -v ON_ERROR_STOP=1 -h localhost -p "$port" -U postgres "$@"; }
q -f "$here/00_auth_stub.sql"
for f in "$here"/../migrations/*.sql; do
  case "$f" in *_cron.sql|*_cron_5min.sql) continue;; esac
  q -f "$f"
done
if [ -n "${PGTEST_KEEP:-}" ]; then trap - EXIT; echo "Postgres de teste em localhost:$port (dados em $work)"; exit 0; fi
q -o /dev/null -f "$here/10_tests.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
