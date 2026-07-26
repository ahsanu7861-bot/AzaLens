# Database migrations

Future migrations must be additive, backward-compatible during staged rollout,
and named `YYYYMMDDHHMMSS_description.sql` or `.js`. Destructive schema changes
require a separate expand/backfill/contract release sequence and a documented
rollback.
