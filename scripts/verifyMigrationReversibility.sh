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

PROJECT_ID="$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' supabase/config.toml)"
if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: supabase/config.toml has no project_id."
    exit 1
fi
EXPECTED_CONTAINER="supabase_db_${PROJECT_ID}"
CANDIDATES="$(docker ps --filter "name=^/${EXPECTED_CONTAINER}$" --format '{{.Names}}')"
CANDIDATE_COUNT="$(printf '%s\n' "$CANDIDATES" | sed '/^$/d' | wc -l | tr -d ' ')"

if [ "$CANDIDATE_COUNT" -ne 1 ]; then
    echo "ERROR: expected exactly one repository-specific local database container ${EXPECTED_CONTAINER}; found ${CANDIDATE_COUNT}."
    exit 1
fi
CONTAINER="$CANDIDATES"
if [ "$CONTAINER" != "$EXPECTED_CONTAINER" ]; then
    echo "ERROR: resolved container identity does not match this repository."
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
# The down scripts are deliberately ordinary SQL and never falsify migration
# history. In this disposable local proof, clear that local-only history before
# asking the CLI to replay; otherwise `db reset` can retain "applied" records
# for objects the verification-only down scripts just removed.
q "truncate table supabase_migrations.schema_migrations"
supabase db reset >/dev/null

TABLES_AFTER="$(q "select count(*) from pg_tables where schemaname='public'")"
if [ "$TABLES_AFTER" != "$TABLES_BEFORE" ]; then
    echo "ERROR: re-applying produced $TABLES_AFTER public tables, expected $TABLES_BEFORE."
    exit 1
fi

echo "   public tables after re-apply: $TABLES_AFTER"

LEDGER_TABLES_AFTER="$(q "select count(*) from pg_tables where schemaname='public' and tablename in ('outcome_decision_snapshots','outcome_snapshot_provenance','outcome_positions','outcome_position_events')")"
LEDGER_RPCS_AFTER="$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_outcome_position','append_outcome_position_event')")"
LEDGER_POLICIES_AFTER="$(q "select count(*) from pg_policies where schemaname='public' and tablename in ('outcome_decision_snapshots','outcome_snapshot_provenance','outcome_positions','outcome_position_events')")"
LEDGER_UNFORCED_AFTER="$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('outcome_decision_snapshots','outcome_snapshot_provenance','outcome_positions','outcome_position_events') and (not c.relrowsecurity or not c.relforcerowsecurity)")"
LEDGER_UNSAFE_GRANTS_AFTER="$(q "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('outcome_decision_snapshots','outcome_snapshot_provenance','outcome_positions','outcome_position_events') and (grantee in ('anon','service_role') or (grantee='authenticated' and privilege_type <> 'SELECT'))")"
LEDGER_BAD_EXECUTE_AFTER="$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values ('anon'),('service_role')) r(role_name) where n.nspname='public' and p.proname in ('create_outcome_position','append_outcome_position_event') and has_function_privilege(r.role_name,p.oid,'EXECUTE')")"

if [ "$LEDGER_TABLES_AFTER" != 4 ] || [ "$LEDGER_RPCS_AFTER" != 2 ] || \
   [ "$LEDGER_POLICIES_AFTER" != 4 ] || [ "$LEDGER_UNFORCED_AFTER" != 0 ] || \
   [ "$LEDGER_UNSAFE_GRANTS_AFTER" != 0 ] || [ "$LEDGER_BAD_EXECUTE_AFTER" != 0 ]; then
    echo "ERROR: migration 004 did not return with its exact security contract."
    exit 1
fi
echo "   migration 004 restored: 4 tables, 2 RPCs, 4 owner policies, forced RLS, least privilege"
echo ""
echo "REVERSIBILITY CHECK PASSED"
