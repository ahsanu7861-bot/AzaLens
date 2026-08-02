# Database migrations

Canonical locations, and why they are split.

| Purpose | Location | Executed by |
|---|---|---|
| Up migrations | `supabase/migrations/` | Supabase CLI — `db reset`, `db push` |
| Down migrations | `db/down-migrations/` | **a human, manually, never automatically** |
| Conventions | this file | — |

## Why up migrations live under `supabase/`

The Supabase CLI cannot be pointed at another directory. Verified against
CLI 2.111.0:

- `supabase/config.toml` exposes only `[db.migrations].enabled` and
  `[db.migrations].schema_paths`. `schema_paths` describes *declarative* schema
  files, not versioned migrations.
- `supabase migration new` has no local flags at all.
- `supabase db reset` offers `--db-url`, `--linked`, `--local`, `--no-seed`,
  `--sql-paths`, `--version`, `--last`. `--sql-paths` overrides `[db.seed]`
  only. There is no migrations-path flag.
- The only path-like global is `--workdir`, which moves the project root, not
  the migrations folder inside it.

The CLI does expose path configuration wherever it supports it — seeds,
declarative schema, storage objects, signing keys, email templates. Its
pointed absence for versioned migrations is the answer.

## Why down migrations live outside `supabase/`

Anything inside `supabase/` is one CLI feature away from being globbed and
executed. The entire value of a down-script is that it runs only when a person
means it. `db/down-migrations/` cannot be reached by any CLI operation.

## Naming

`YYYYMMDDHHMMSS_description.sql`, lowercase, enforced by
`backend/scripts/checkMigrations.js`.

Every up migration has **exactly one** down-script whose filename matches
byte-for-byte. `backend/scripts/checkDownMigrations.js` enforces the pairing,
matching timestamps, reverse ordering and the absence of orphans. A missing or
mismatched down-script fails the build.

Keep this README out of `supabase/migrations/` — that directory should contain
only migration files.

## Rules

- **A trigger is created after every table it writes to.** Creating it earlier
  makes correctness depend on nobody using the system mid-deploy, which is not
  a property we can assert. Down-scripts drop in the exact reverse order.
- **Down-scripts are never run automatically** — not in deploy, not in
  `postinstall`, not on a schedule. CI runs them only to prove they are
  well-formed.
- **Production rollback is a forward corrective migration.** "Undo the last
  migration" against a live database usually means "delete a column users have
  already filled in".
- **Destructive changes use expand / backfill / contract.** Add the new thing,
  move the data, and remove the old thing only in a later release once nothing
  reads it. Never in one step.
- **No schema change is ever made by clicking in the Supabase dashboard.** If it
  is not in a migration file, it does not exist.
