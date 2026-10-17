#!/usr/bin/env bash
# Testes de RLS: cria um Postgres descartável, aplica as migrações e roda supabase/tests/rls.sql.
# Requer os binários do PostgreSQL (initdb, pg_ctl, psql). Nunca aponte para o banco real.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}
DIR=$(mktemp -d)
PORT=${PG_PORT:-5498}
trap '"$BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$BIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=("$BIN/psql" -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/bootstrap.sql >/dev/null
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f" >/dev/null 2>&1 || { echo "Migração falhou: $f"; "${PSQL[@]}" -f "$f"; exit 1; }; done
echo "Migrações aplicadas."
"${PSQL[@]}" -f supabase/tests/rls.sql
