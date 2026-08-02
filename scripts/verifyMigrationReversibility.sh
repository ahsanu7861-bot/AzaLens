#!/usr/bin/env bash

set -Eeuo pipefail

# ==================================================================
# Proves the migrations reverse cleanly.
#
# "The schema is empty" is the wrong assertion - a Supabase database
# always contains auth, storage, realtime, graphql, vault and
# extensions. This checks what we actually mean: after the down
# scripts run in reverse order, no AzaLens-owned object remains, and
# Supabase's own schemas are left alone apart from the one trigger we
# deliberately attach to auth.users.
#
# Down scripts are never run automatically anywhere else. This is a
# local and CI tool for proving they are well-formed.
# ==================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CONTAINER="$(docker ps --filter name=supabase_db_ --format '{{.Names}}' | head -1)"

if [ -z "$CONTAINER" ]; then
    echo "ERROR: no supabase_db_* container is running. Run 'supabase start'."
    exit 1
fi

q() {
    docker exec -i "$CONTAINER" psql -U postgres -d postgres -tAqc "$1"
}

run_file() {
    docker exec -i "$CONTAINER" \
        psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < "$1"
}

MANAGED_SNAPSHOT_SQL="
  select n.nspname || '.' || c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('auth','storage','realtime','graphql','vault','extensions')
  union all
  select 'trigger:' || t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' and not t.tgisinternal
   order by 1
"

echo "== 1. confirm the schema is present before reversing =="
TABLES_BEFORE="$(q "select count(*) from pg_tables where schemaname='public'")"
if [ "$TABLES_BEFORE" -eq 0 ]; then
    echo "ERROR: public schema is already empty - nothing to reverse."
    exit 1
fi
echo "   public tables before: $TABLES_BEFORE"

MANAGED_BEFORE="$(q "$MANAGED_SNAPSHOT_SQL")"

echo "== 2. run down migrations in reverse order =="
for file in $(ls -1 db/down-migrations/*.sql | sort -r); do
    echo "   applying $file"
    run_file "$file"
done

echo "== 3. assert no AzaLens-owned object remains in public =="
FAILURES=0

assert_empty() {
    local label="$1" result="$2"
    if [ -n "$result" ]; then
        echo "   FAIL: $label still present:"
        echo "$result" | sed 's/^/     - /'
        FAILURES=$((FAILURES + 1))
    else
        echo "   ok: no $label remain"
    fi
}

assert_empty "tables"    "$(q "select tablename from pg_tables where schemaname='public' order by 1")"
assert_empty "policies"  "$(q "select tablename||'.'||policyname from pg_policies where schemaname='public' order by 1")"
assert_empty "functions" "$(q "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1")"
assert_empty "indexes"   "$(q "select indexname from pg_indexes where schemaname='public' order by 1")"
assert_empty "triggers"  "$(q "select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by 1")"

echo "== 4. assert Supabase-managed schemas are untouched =="
MANAGED_AFTER="$(q "$MANAGED_SNAPSHOT_SQL")"

# The only permitted difference is our own auth.users trigger going away.
DIFF="$(diff <(echo "$MANAGED_BEFORE") <(echo "$MANAGED_AFTER") | grep '^[<>]' || true)"
UNEXPECTED="$(echo "$DIFF" | grep -v 'trigger:on_auth_user_created' | grep '^[<>]' || true)"

if [ -n "$UNEXPECTED" ]; then
    echo "   FAIL: managed schemas changed beyond our own trigger:"
    echo "$UNEXPECTED" | sed 's/^/     /'
    FAILURES=$((FAILURES + 1))
else
    echo "   ok: only on_auth_user_created was removed"
fi

if [ "$FAILURES" -gt 0 ]; then
    echo ""
    echo "REVERSIBILITY CHECK FAILED ($FAILURES problem(s))."
    exit 1
fi

echo "== 5. re-apply every migration from empty =="
supabase db reset >/dev/null

TABLES_AFTER="$(q "select count(*) from pg_tables where schemaname='public'")"
if [ "$TABLES_AFTER" != "$TABLES_BEFORE" ]; then
    echo "ERROR: re-applying produced $TABLES_AFTER public tables, expected $TABLES_BEFORE."
    exit 1
fi

echo "   public tables after re-apply: $TABLES_AFTER"
echo ""
echo "REVERSIBILITY CHECK PASSED"
