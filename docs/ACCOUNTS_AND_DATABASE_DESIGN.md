# Accounts, database and authentication — design

Status: **Design only. No code written. No migrations written. Nothing built.**
Revision 3 — incorporates 15 review corrections, 4 refinements, and 4 final-review
fixes. See the change log at the end.
Covers roadmap item 3.3, plus the part of the parked durable-storage work
(`WHAT_TO_DO_NEXT.md` lines 63 and 70) that is not blocked on provider terms.
Date: 2026-08-02. Uncommitted.

---

## Part 0 — The outcome we are designing for

Today AzaLens has one shared watchlist file, one shared portfolio file, and one
token ledger file sitting on the Render disk. They belong to nobody. Anyone who
gets past the demo code sees everyone's data, and every deploy can wipe all of it.

After this work:

1. **Every person has their own data.** Ahsan's watchlist is Ahsan's. A reviewer's
   portfolio is theirs. Nobody can see anyone else's, and this is enforced by the
   database itself — not by backend code that could have a bug.
2. **Token accounting survives restarts and multiple servers.** The ledger moves
   off the Render disk into Postgres. Two requests at the same moment cannot both
   slip past the budget check. Today's file lock only works on one machine; the
   new one works no matter how many servers run.
3. **The closed demo stays closed.** Accounts are added by invitation only. There
   is no public "Sign up" button anywhere.
4. **Shariah screening stays free.** Structurally, not just by promise — the
   screening code path never reads the tier column at all.

### What revision 2 removed from this list, and why

Revision 1 promised a durable Shariah cache that survives Render spin-downs. That
promise is **withdrawn from this bucket.** Storing Halal Terminal results in our
database — raw *or* normalised — is only permissible if the provider's terms allow
it, and nobody has read those terms yet. Part 0.1 makes that a blocking
prerequisite.

Concretely: the Shariah cache stays in memory and keeps dying on every spin-down
until the terms question is answered in writing. That is a real, ongoing cost in
paid tokens, and it is the honest position. We do not get to fix it by assuming
permission we have not confirmed.

What we are **not** building: payments, a Pro tier UI, multiple named watchlists,
team accounts, social login, or saved analyses. All parked deliberately.

---

## Part 0.1 — Blocking prerequisite: provider terms

**Nothing in this document that stores Halal Terminal output in Postgres may be
built, migrated, or deployed until the following five questions are answered in
writing.**

1. Is server-side caching of screening results permitted at all?
2. Is the intended TTL (currently 24 hours) permitted?
3. Is retaining the raw provider payload permitted?
4. Is reusing one cached result across *different users* permitted?
5. Is storing provider-derived content inside user-owned records permitted?

Question 4 matters more than it looks. A cache that serves one user's screening
result to a second user is redistribution, which many data agreements treat
differently from caching for the requester.

**Normalised is not a loophole.** Revision 1 proposed storing "only the minimum
normalised fields" while terms were unconfirmed. That has been rejected on review
and the reasoning is sound: a verdict derived from provider data is still provider
data wearing a different shape. If the contract restricts retention, extracting
the conclusion and discarding the wrapper does not escape the restriction.

Therefore `shariah_screenings` is **not created, not migrated, and not deployed**
in this bucket. Its schema is documented in Appendix A as *conditional*, ready to
build the day confirmation arrives, and not before.

**Owner.** This is not new work. `docs/PROVIDER_DEPENDENCY_AUDIT.md:152-163`
already records that no provider licence review has been done, and already
assigns commercial-terms review to Tahir Khan sahib before unrestricted public
access. This prerequisite folds into that existing Track B assignment rather than
creating a new one — it just adds these five specific questions to his brief and
makes the durable cache depend on the answers.

Question 5 is also why `saved_analyses` is deferred out of this bucket entirely
(Part 8).

---

## Part 1 — The one big decision, in plain language

There are two normal ways to use Supabase, and the choice shapes everything else.

**Option A — the browser talks to Supabase directly for data.** Fast to build.
But every rule about who sees what lives entirely in database policies, any
mistake is directly exposed to the internet, and our existing Express backend
(rate limits, cost guards, closed-demo gate, provider adapters) gets bypassed.

**Option B — everything goes through our Express backend.** More work, but the
backend stays the single choke point the audit asked for.

**Chosen: a hybrid, and it is the important decision in this document.**

- The **browser** talks to Supabase for one thing only: logging in and holding
  the session. It uses the *anon key*, which is designed to be public and can
  read nothing on its own.
- The browser sends its login token to **our Express backend** on every API call.
- The backend does all data reads and writes — but using **the logged-in person's
  own token**, not an admin key. So Postgres applies that person's row-level rules
  to every query the backend makes.

Why this matters in plain terms: it gives us **two independent locks on the same
door.** The backend checks who you are, and the database independently refuses to
return rows that aren't yours. If I write a bug in the backend and forget a
`where user_id = ...` filter, the database still returns nothing. One mistake is
not enough to leak data.

The powerful admin key (`service_role`) bypasses all row rules. It lives in
exactly one place — the backend's environment — and is used by exactly three
things: creating invited users, reserving tokens, and the one-off legacy import
script. Never anywhere near the browser. Part 7.5 has a test that proves it.

### 1.1 One Supabase client per request — never a shared one

This is the single most dangerous implementation detail in the whole design, so
it is specified rather than left to judgement.

The obvious implementation is one module-level Supabase client whose
`Authorization` header gets reassigned on each request. **That is forbidden.**
Node handles requests concurrently. Request A sets the header, awaits a query,
and while it is waiting request B overwrites the header with B's token. A's query
then executes as B — or B's as A. The database faithfully applies row-level
security to *the wrong person*, and both locks in Part 1 open at once. It fails
silently, only under concurrent load, and produces exactly the cross-user leak
this entire design exists to prevent.

Required shape — a fresh client constructed inside the auth middleware, for that
request only:

```js
// per request, inside requireUser — never module-level, never cached, never reused
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,      // no shared session state between requests
    autoRefreshToken: false,    // the browser owns refresh, not the server
    detectSessionInUrl: false,
  },
  global: {
    headers: { Authorization: `Bearer ${requestToken}` },
  },
});
```

Rules, stated so a reviewer can check them mechanically:

- The client is created per request and discarded when the response ends.
- No module-level or app-level user client exists anywhere in the codebase.
- `supabase.auth.setSession()` is never called on the backend. It mutates shared
  state, which is the same bug in a different costume.
- The request's Bearer token is passed to that one client and to nothing else.
- The `service_role` client is a separate module, never mixed with this one.

**The cost objection, answered.** Creating a client per request looks wasteful. It
is not: the Supabase JS client is a stateless HTTP wrapper, not a database
connection pool. There is no handshake and no socket. Construction is a few object
allocations.

**Rejected alternative.** A shared `pg` connection pool with
`set local request.jwt.claims` per transaction would also be correct and would use
fewer HTTP hops. Rejected because it means writing custom claim-injection code in
the exact place where a bug is unrecoverable, and because it bypasses PostgREST's
own enforcement. More control, more ways to be wrong.

Proof that it works is test 7.3, which fires interleaved A and B requests and
asserts no crossover in either direction.

### 1.2 How the request actually flows

```
Browser
  │  1. demo cookie (existing HttpOnly cookie, unchanged)
  │  2. Authorization: Bearer <supabase access token>
  ▼
Express backend
  │  closedDemoGate      → 401 CLOSED_DEMO_ACCESS_REQUIRED   (cheapest check first)
  │  requireUser         → 401 AUTH_REQUIRED / AUTH_TOKEN_INVALID
  │                        builds a fresh per-request client (1.1)
  │  entitlements        → attaches tier; never blocks Shariah
  ▼
Supabase Postgres, queried *as that user*
  │  row-level security decides what exists
  ▼
Response
```

### 1.3 What the demo gate does and does not protect — corrected

Revision 1 claimed that an unauthenticated stranger "never reaches Postgres at
all" because the demo gate runs first. **That was wrong**, and the correction
matters because it changes where brute-force protection comes from.

The browser authenticates against Supabase directly, at
`https://<project-ref>.supabase.co/auth/v1/token`. That endpoint is on Supabase's
infrastructure, not ours. It is publicly reachable, our Express demo gate is not
in front of it, and it cannot be.

Stated accurately:

| What | Protected by | Not protected by |
|---|---|---|
| AzaLens backend and product routes | the closed-demo cookie, then `requireUser` | — |
| Supabase login endpoint | Supabase's own rate limiting, which **we must configure deliberately** | the Express demo gate |
| Account creation | `enable_signup = false` at the Supabase project level | the Express demo gate |

What makes the login endpoint's public reachability acceptable is not the demo
gate — it is that **public signup is disabled**, so an attacker at that endpoint
can only guess passwords for accounts we personally created, against Supabase's
rate limits. We must set those limits deliberately in the project's auth
configuration rather than accepting whatever the default happens to be, and record
the chosen values.

The demo gate still runs before `requireUser` on our own routes, so a valid token
without a demo cookie is refused. Test 7.2 asserts that ordering.

---

## Part 2 — Tables

**Seven tables ship in this bucket.** An eighth (`shariah_screenings`) is designed
in Appendix A and blocked on Part 0.1.

| Table | Owned by | Purpose |
|---|---|---|
| `profiles` | user | display name, one row per person |
| `user_entitlements` | system-written, user-readable | the tier column |
| `watchlists` | user | replaces `storage/watchlists.json` |
| `portfolio_holdings` | user | replaces `storage/portfolios.json` |
| `user_preferences` | user | settings |
| `provider_token_ledger` | system only | monthly token totals |
| `provider_token_reservations` | system only | one row per reservation, audit trail |
| ~~`shariah_screenings`~~ | — | **conditional — Appendix A, blocked on Part 0.1** |
| ~~`saved_analyses`~~ | — | **deferred to a later bucket — Part 8** |

Revision 1 proposed nine. Two are gone: one blocked on provider terms, one
deferred as out of scope. Fewer tables shipped means fewer policies to prove.

### Why `user_entitlements` is a separate table from `profiles`

A small decision with a real security consequence. Users must be able to edit
their own profile (display name). If `tier` lived in that same row, a user could
send an update setting `tier = 'pro'` and grant themselves a paid tier.

Keeping `tier` in its own table with **no write policy at all** means there is no
way for a logged-in person to change it — the ability does not exist. Only the
backend's admin key can. That is stronger than remembering to filter a column, and
it is verifiable by reading the policy list.

### Shared conventions

Applied to every table below, so they are stated once:

```sql
-- symbols: uppercase, bounded, no free text
check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$')

-- one shared trigger function, so freshness never depends on a route remembering
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- attached to every table that has updated_at:
create trigger <table>_set_updated_at
  before update on public.<table>
  for each row execute function public.set_updated_at();
```

JSONB columns are size-bounded with `octet_length(col::text)` rather than
`pg_column_size`. `pg_column_size` reports the *compressed* stored size, so a
highly compressible 10 MB payload could slip under a limit set that way.
`octet_length` bounds what the user actually sent, which is the thing we mean to
limit.

**Timestamps and identifiers are immutable to users.** `created_at`, `added_at`,
`opened_at`, `updated_at`, `id` and `user_id` are never included in an update
grant. This is enforced by column-level grants in Part 3, not by trusting routes
— see §3.0.1 for why RLS alone does not cover it.

### 2.1 `profiles`

```sql
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

### 2.2 `user_entitlements`

```sql
create table public.user_entitlements (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  tier       text not null default 'free' check (tier in ('free', 'pro')),
  granted_by text check (char_length(granted_by) <= 64),
  updated_at timestamptz not null default now()
);
```

`tier` exists so we never need a painful migration later. Today every row is
`'free'`, no server code branches on it, and no UI reads it. **The Shariah
screening path must never reference this table.** Test 7.7 greps for exactly that.

### 2.3 `watchlists`

One flat watchlist per person, matching what the app does today.

```sql
create table public.watchlists (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  symbol   text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$'),
  note     text check (char_length(note) <= 280),
  added_at timestamptz not null default now(),
  unique (user_id, symbol)
);
create index watchlists_user_id_idx on public.watchlists (user_id);
```

Trade-off: multiple *named* watchlists would be nicer, but it needs two tables and
more complex policies, and it is a Pro-shaped feature with no user. If we want it
later it is additive — a nullable `list_id` column and a `watchlist_groups` table.
Nothing gets rewritten.

### 2.4 `portfolio_holdings`

```sql
create table public.portfolio_holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  symbol        text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$'),
  shares        numeric(20, 8) not null check (shares > 0),
  average_price numeric(20, 8) not null check (average_price >= 0),
  currency      text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  opened_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, symbol)
);
create index portfolio_holdings_user_id_idx on public.portfolio_holdings (user_id);
```

`numeric`, not floating point — money must not drift. The currency pattern
enforces uppercase and three letters in one check. `unique (user_id, symbol)`
matches today's behaviour where adding an existing symbol errors and points you at
the update endpoint.

### 2.5 `user_preferences`

```sql
create table public.user_preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  theme          text not null default 'system' check (theme in ('system', 'light', 'dark')),
  default_market text not null default 'US'
                 check (default_market = upper(default_market) and char_length(default_market) <= 8),
  settings       jsonb not null default '{}'::jsonb
                 check (octet_length(settings::text) <= 8192),
  updated_at     timestamptz not null default now()
);
```

Trade-off: things we already know about get real columns, so the database rejects
nonsense values. Everything we have not thought of goes in `settings`, so adding a
small preference later needs no migration. The middle path between "a column for
everything" (constant migrations) and "one big blob" (no validation).

The row is created by the signup trigger and never by the user — see §3.5 for why
that changed in revision 2.

### 2.6 `provider_token_ledger` and `provider_token_reservations`

```sql
create table public.provider_token_ledger (
  provider              text not null check (char_length(provider) <= 64),
  utc_month             text not null check (utc_month ~ '^\d{4}-\d{2}$'),
  estimated_tokens_used bigint not null default 0 check (estimated_tokens_used >= 0),
  request_count         bigint not null default 0 check (request_count >= 0),
  updated_at            timestamptz not null default now(),
  primary key (provider, utc_month)
);

create table public.provider_token_reservations (
  id             bigint generated always as identity primary key,
  provider       text not null check (char_length(provider) <= 64),
  utc_month      text not null check (utc_month ~ '^\d{4}-\d{2}$'),
  symbol         text check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$'),
  estimated_cost bigint not null check (estimated_cost > 0 and estimated_cost <= 10000),
  user_id        uuid references auth.users (id) on delete set null,
  reserved_at    timestamptz not null default now()
);
create index provider_token_reservations_month_idx
  on public.provider_token_reservations (provider, utc_month, reserved_at desc);
```

Totals are `bigint`, not `integer`. An `integer` caps at about 2.1 billion, which
is fine today and is exactly the sort of limit that becomes an outage years later
when nobody remembers choosing it. `bigint` costs nothing here.

One ledger row per provider per UTC month. The month is part of the key, so
rollover is automatic and spend can never carry across months or reset early.

The reservations table is the audit trail, and it is what settles roadmap item
3.4 — the "5 tokens per screening" figure is currently a **single sample**. With a
row per call we can count real screenings in a month and reconcile against the
Halal Terminal dashboard. Retention: rows beyond 24 months are pruned by a
documented manual script in this bucket; `pg_cron` automation is named as later
work rather than pretended.

The naming from `SHARIAH_COST_SAFETY.md` is preserved exactly: our numbers stay
labelled `locallyEstimated*`, and the provider dashboard stays authoritative.

---

## Part 3 — Row-level security, table by table

Two rules applied everywhere:

- `enable row level security` turns the rules on.
- `force row level security` makes them apply to the table's owner too. Without
  it, a connection that happens to own the table silently sees everything.

Neither affects `service_role`, which bypasses row security by design. That key's
safety comes entirely from never leaving the backend (§1.1, test 7.5).

A note on how RLS behaves, because it surprises people: a blocked `SELECT` returns
**zero rows, not an error**. User B asking for user A's watchlist gets an empty
list, as if the data does not exist. That is correct and better — it leaks
nothing, not even whether a row exists.

`(select auth.uid())` is wrapped in a sub-select on purpose. Postgres then
evaluates it once per query instead of once per row.

### 3.0 Default privileges — close the door before opening it

In migration 001, before any table exists:

```sql
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
```

Postgres grants `EXECUTE` on new functions to `PUBLIC` by default, and Supabase
grants schema usage to `anon` and `authenticated`. Without this line, every
function we ever add is callable by any logged-in user — and by anyone holding the
public anon key — until someone remembers to revoke it. This makes the safe state
the default state. Test 7.5 asserts no `public` function is executable by `anon` or
`authenticated` outside an explicit allowlist.

### 3.0.1 Column-level update grants — the gap RLS does not close

Row-level security answers "**whose** row is this?" It does not answer "**which
fields** may you change?" A table-level `grant update` lets a user rewrite every
column of a row they legitimately own — including `created_at`, `added_at`,
`opened_at`, and `updated_at`.

That is not a cross-user leak, and it is still a real problem. A user could
backdate `opened_at` on a holding and make the portfolio's own history dishonest,
or set `added_at` in the future. For a product whose entire claim is honest
analysis, self-falsifiable timestamps are a defect. If we ever evaluate verdicts
against outcomes (roadmap item 3.6), the timestamps are the evidence.

So every update grant below names its columns explicitly:

```sql
grant update (col_a, col_b) on public.<table> to authenticated;
```

Two consequences worth stating plainly:

- **The shared `set_updated_at` trigger is unaffected.** Column privileges are
  checked against the columns named in the user's `SET` clause. A `before update`
  trigger assigning `new.updated_at` runs inside the server after that check and
  is not subject to the invoker's column privileges. Timestamps still update
  automatically; users simply cannot choose the value. Test 7.1 asserts both
  halves — the attempt is rejected *and* `updated_at` still moved.
- **The error class changes for one existing case.** An attempt to update
  `user_id` now fails as a privilege error (`permission denied for column
  user_id`) rather than as a policy violation. The `with check` clauses stay
  anyway as defence in depth — if a column grant is ever widened by mistake, the
  policy is still there. Tests assert *rejected*, not a specific error string.

### 3.1 `profiles` — read own, edit own, cannot create or delete

```sql
alter table public.profiles enable row level security;
alter table public.profiles force  row level security;
revoke all on public.profiles from anon, authenticated;
grant select                     on public.profiles to authenticated;
grant update (display_name)      on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
```

No insert policy: profiles are created by the signup trigger (Part 4), not by the
user. No delete policy: account deletion goes through `auth.users` and the
`on delete cascade` removes the profile, so a user cannot orphan themselves
halfway.

`using` controls which existing rows you may touch. `with check` controls what the
row may look like afterwards. Both are needed on update — `using` alone would let
someone edit their own row and reassign it to another user.

### 3.2 `user_entitlements` — read own, no writes at all

```sql
alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force  row level security;
revoke all on public.user_entitlements from anon, authenticated;
grant select on public.user_entitlements to authenticated;

create policy entitlements_select_own on public.user_entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);
```

One policy. No insert, update, or delete policy, and no grant for them, so no
logged-in person can change their own tier by any route. Only the admin key can.

### 3.3 `watchlists` — full ownership

```sql
alter table public.watchlists enable row level security;
alter table public.watchlists force  row level security;
revoke all on public.watchlists from anon, authenticated;
grant select, insert, delete on public.watchlists to authenticated;
grant update (note)          on public.watchlists to authenticated;

create policy watchlists_select_own on public.watchlists
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy watchlists_insert_own on public.watchlists
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy watchlists_update_own on public.watchlists
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy watchlists_delete_own on public.watchlists
  for delete to authenticated
  using ((select auth.uid()) = user_id);
```

The insert policy is what stops user B writing a row stamped with user A's id.

### 3.4 `portfolio_holdings` — identical shape

```sql
alter table public.portfolio_holdings enable row level security;
alter table public.portfolio_holdings force  row level security;
revoke all on public.portfolio_holdings from anon, authenticated;
grant select, insert, delete                      on public.portfolio_holdings to authenticated;
grant update (shares, average_price, currency)    on public.portfolio_holdings to authenticated;

create policy holdings_select_own on public.portfolio_holdings
  for select to authenticated using ((select auth.uid()) = user_id);

create policy holdings_insert_own on public.portfolio_holdings
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy holdings_update_own on public.portfolio_holdings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy holdings_delete_own on public.portfolio_holdings
  for delete to authenticated using ((select auth.uid()) = user_id);
```

### 3.5 `user_preferences` — select and update only

```sql
alter table public.user_preferences enable row level security;
alter table public.user_preferences force  row level security;
revoke all on public.user_preferences from anon, authenticated;
grant select                                       on public.user_preferences to authenticated;
grant update (theme, default_market, settings)     on public.user_preferences to authenticated;

create policy preferences_select_own on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);

create policy preferences_update_own on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

Revision 1 contradicted itself here: the signup trigger always created the row,
*and* the user was granted insert. Two owners of the same fact is how bugs start.
Resolved in favour of the trigger — the insert grant and insert policy are both
removed, because a permission that is never legitimately used is only ever an
attack surface.

The honest consequence: if a preferences row is ever missing, the user cannot
self-heal and the backend cannot create it without the admin key. That makes the
trigger's reliability load-bearing, which is precisely what §4.3 hardens.

No delete either — resetting means updating back to defaults. One row per user
forever, and a whole class of "row missing" bugs never exists.

### 3.6 The two system tables — locked completely

```sql
alter table public.provider_token_ledger       enable row level security;
alter table public.provider_token_ledger       force  row level security;
alter table public.provider_token_reservations enable row level security;
alter table public.provider_token_reservations force  row level security;

revoke all on public.provider_token_ledger       from anon, authenticated;
revoke all on public.provider_token_reservations from anon, authenticated;
```

Row security on, **zero policies, zero grants**. In Postgres that means total
denial for everyone except the admin key. It is the strongest setting available
and the right one: these tables hold our spend accounting, and no browser has any
business reading them.

This is also why "RLS is on" is not a useful statement by itself. Here it means
*nobody*; on `watchlists` it means *you only*. Same switch, opposite outcomes.

---

## Part 4 — Authentication flow

### 4.1 Signup — invitation only

Public signup is **disabled in the Supabase Auth settings**
(`enable_signup = false`). This is a server-side project setting; there is no
request the browser can craft to get around it. There will be no "Create account"
screen in the UI at all — not a hidden one, not a disabled one.

Adding a person is a deliberate act by us:

```
npm run admin:invite -- --email reviewer@example.com --name "Reviewer"
```

That script runs on our machine, uses the admin key from the backend environment,
and calls Supabase's admin invite API. The person receives an email with a
one-time link, sets a password, and is in.

Login rate limits in the Supabase project's auth configuration are set
deliberately and the chosen values recorded, per §1.3.

### 4.2 Login, session, logout

1. Browser calls Supabase directly with email and password, using the anon key.
2. Supabase returns an access token (short-lived, ~1 hour) and a refresh token.
3. The Supabase JS client stores them and refreshes the access token silently.
4. Every call to our API attaches `Authorization: Bearer <access token>` — one
   axios interceptor on the existing `frontend/src/services/api.ts`.

Logout calls Supabase sign-out, which revokes the refresh token server-side and
clears local storage. The demo cookie is separate and stays — logging out of an
account does not mean losing demo access.

**Session storage — a hard launch gate, not a "revisit".** The Supabase browser
client keeps tokens in `localStorage`, which JavaScript can read, so a cross-site
scripting bug could steal a session. The alternative — proxying login through our
backend into an HttpOnly cookie — is meaningfully more secure but is a significant
amount of custom auth code, itself a source of bugs.

Accepted for the closed demo **only**, where every user is invited and personally
known. Recorded as a gate in Part 8: **no public signup and no external beta until
browser session storage is reconsidered.** Our strict Helmet Content-Security-Policy
is what keeps the risk low in the meantime.

### 4.3 Token verification — the full check list

"Verify the signature against Supabase's public keys" is not enough. A token can
have a perfectly valid signature and still be the wrong token — issued by a
different Supabase project, minted for a different audience, or carrying a
service-role claim. Every one of these must be checked:

| Check | Requirement | Why |
|---|---|---|
| Signature | valid | the basic one |
| Algorithm | against an allowlist — `RS256`/`ES256` for asymmetric keys, or `HS256` for a legacy shared-secret project, **never both accepted at once** | accepting a set of algorithms rather than one is how algorithm-confusion attacks work |
| `iss` | string-equal to this exact project's issuer URL | a valid token from *someone else's* Supabase project must not authenticate here |
| `aud` | `authenticated` | tokens minted for other audiences are not login tokens |
| `exp` | not expired, small bounded clock skew | — |
| `role` | `authenticated` | a `service_role` token must never be accepted as a user login |
| `sub` | present and a valid UUID | it becomes the row owner; a malformed one must fail loudly |

JWKS handling: fetch and cache the key set with a TTL, refetch on an unknown
`kid` so key rotation is automatic, and enforce a **minimum interval between
refetches** so a stream of forged `kid` values cannot turn our auth middleware
into a request amplifier against Supabase.

Verification is a local signature check — no network call per request, so no
latency and no cost.

On success the middleware attaches `req.user = { id, email }` and the fresh
per-request client from §1.1 as `req.db`. Every route uses `req.db`, so a handler
*cannot* accidentally read someone else's data — the connection it holds does not
have that power.

### 4.4 The signup trigger

Created at the **end of migration 002**, after all three account tables exist —
see Part 6 for why placing it in 001 was an ordering defect that would have
blocked account creation mid-deploy.

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'AzaLens user'
    ), 60)
  )
  on conflict (id) do nothing;

  insert into public.user_entitlements (user_id, tier, granted_by)
  values (new.id, 'free', 'signup-default')
  on conflict (user_id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Three deliberate details:

**The display name cannot break signup.** Revision 1 used a bare
`split_part(email, '@', 1)`, which can exceed the 60-character constraint and
abort account creation — an invited reviewer would simply be unable to sign up,
with an opaque database error. Fixed *by construction*: `left(..., 60)` truncates,
`coalesce` handles a missing metadata key, `nullif(trim(...))` handles a
whitespace-only name, `coalesce(new.email, '')` handles a null email, and a final
literal covers every remaining case. The expression cannot produce an invalid
value.

**Exceptions are deliberately not swallowed.** Wrapping the trigger in an
exception handler would make signup "never fail", at the price of creating a user
who can log in but has no entitlements row. A half-created account is worse than a
failed signup: the failure is loud and fixable, the half-account is silent and
surfaces later as a confusing bug. So the value is made always-valid instead, and
any genuine failure aborts the whole signup transaction.

**`set search_path = ''` with fully-qualified names.** `security definer`
functions run with elevated rights; this stops a manipulated search path from
redirecting the writes somewhere else.

### 4.5 The three layers

| Layer | Question it answers | Where enforced |
|---|---|---|
| Closed demo gate | "May this browser reach AzaLens?" | existing `closedDemoGate.js` cookie, on our routes only (§1.3) |
| Supabase auth | "Which specific person is this?" | Bearer token, verified per §4.3 |
| Row-level security | "Which rows may this person see?" | Postgres policies, Part 3 |

Every currently-gated route keeps its gate and gains `requireUser` behind it. New
account routes sit behind both. `/auth/demo/status` and `/auth/demo/unlock` stay
public and unchanged. Nothing about the current gate is removed or weakened.

---

## Part 5 — Atomic token accounting

The current file-based guard takes a lock, reads, checks, writes, unlocks. That
works on one machine. It breaks the moment Render runs two instances, and the
ledger dies with the disk.

The replacement is a **single database function** that checks the budget and
records the spend in one indivisible step:

```sql
create or replace function public.reserve_provider_tokens(
  p_provider       text,
  p_monthly_budget bigint,
  p_estimated_cost bigint,
  p_symbol         text default null,
  p_user_id        uuid default null
)
returns table (
  allowed               boolean,
  code                  text,
  utc_month             text,
  estimated_tokens_used bigint,
  remaining             bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month text := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM');
  v_used  bigint;
begin
  if p_monthly_budget is null or p_monthly_budget <= 0 then
    return query select false, 'HALAL_TERMINAL_BUDGET_DISABLED', v_month, 0::bigint, 0::bigint;
    return;
  end if;

  if p_monthly_budget > 100000000
     or p_estimated_cost is null
     or p_estimated_cost <= 0
     or p_estimated_cost > 10000 then
    return query select false, 'HALAL_TERMINAL_BUDGET_OUT_OF_RANGE', v_month, 0::bigint, 0::bigint;
    return;
  end if;

  insert into public.provider_token_ledger (provider, utc_month)
  values (p_provider, v_month)
  on conflict (provider, utc_month) do nothing;

  update public.provider_token_ledger
     set estimated_tokens_used = estimated_tokens_used + p_estimated_cost,
         request_count         = request_count + 1,
         updated_at            = now()
   where provider  = p_provider
     and utc_month = v_month
     and estimated_tokens_used + p_estimated_cost <= p_monthly_budget
  returning estimated_tokens_used into v_used;

  if v_used is null then
    select estimated_tokens_used into v_used
      from public.provider_token_ledger
     where provider = p_provider and utc_month = v_month;
    return query select false, 'HALAL_TERMINAL_MONTHLY_BUDGET_EXCEEDED',
                        v_month, coalesce(v_used, 0::bigint), 0::bigint;
    return;
  end if;

  insert into public.provider_token_reservations
    (provider, utc_month, symbol, estimated_cost, user_id)
  values (p_provider, v_month, p_symbol, p_estimated_cost, p_user_id);

  return query select true, 'HALAL_TERMINAL_BUDGET_RESERVED',
                      v_month, v_used, greatest(p_monthly_budget - v_used, 0::bigint);
end;
$$;

revoke execute on function public.reserve_provider_tokens(text, bigint, bigint, text, uuid)
  from public, anon, authenticated;
grant  execute on function public.reserve_provider_tokens(text, bigint, bigint, text, uuid)
  to service_role;
```

**Why this is genuinely atomic**, in plain language: the budget check lives
*inside* the `where` clause of the update. Postgres locks that ledger row for the
duration. If two requests arrive at the same instant, the second waits for the
first to finish, then re-checks the condition against the *updated* number. There
is no gap between "check" and "write" for a second request to slip into. That is
the flaw the file lock could never fully close across machines.

**The month is not a parameter.** Revision 1 claimed the database controlled the
budget month and then accepted a `p_now` argument that overrode it — the document
contradicted its own security property. A production function that lets the caller
choose the month lets a bug, a bad clock, or a compromised backend reset the budget
at will. `clock_timestamp()` is read inside the function, from the database, in
UTC, and there is no override. Tests simulate rollover by seeding a prior-month
ledger row directly (test 7.6), which is strictly better: it tests the real
production code path instead of a test-only branch.

**Bounds, not just positivity.** A budget above 100,000,000 or a per-request cost
above 10,000 is rejected as out of range rather than obeyed. The realistic failure
is a typo adding zeros to an environment variable; the guard should refuse an
absurd number, not faithfully honour it.

Behaviours carried over from the current implementation, unchanged on purpose:

- **Reserve before the call, never refund.** If the provider call then fails, the
  tokens stay spent in our ledger. This over-counts slightly. That is the safe
  direction — over-counting stops us early, under-counting overspends real money.
- **Fail closed.** If the database is unreachable, `reserve` fails and the
  screening returns unavailable. It does **not** fall through to a live call. A
  wiped or unreachable ledger must never become permission to spend.
- **Estimated stays labelled estimated.** `/ops/metrics` keeps reporting
  `locallyEstimatedUsed` / `locallyEstimatedRemaining`; `ledgerStorage` becomes
  `supabase-postgres` and `ledgerPersistence` becomes `durable`. The Halal
  Terminal dashboard remains authoritative.

The four existing runtime controls (`SHARIAH_DATA_MODE`,
`HALAL_TERMINAL_LIVE_ENABLED`, the monthly budget, and the dev-only override) are
untouched. This changes *where the ledger lives*, not *when we are allowed to
spend*.

### 5.1 Cost-first, as a design rule

**No page load ever causes a provider call, a token reservation, a cache refresh,
or a cache write.** Not one, not ever, under any flag.

- Loading the workspace reads only our own database — watchlist, portfolio,
  preferences. Zero provider calls, zero tokens.
- **No cache warming, no prefetch, no background refresh job, no startup hook that
  touches the screening path.** This is the rule that matters most, because cache
  warming sounds like an optimisation and is actually the dashboard-on-load token
  leak wearing different clothes: it spends paid tokens with nobody asking. The
  moment a cache exists, someone will propose warming it. The answer is no.
- A live provider call happens only on an explicit, user-initiated action, only
  after all four runtime controls pass, and only after `reserve_provider_tokens`
  returns `allowed = true`.
- **Once — and only once — Part 0.1 is resolved** and legally retainable cached
  data exists, an ordinary zero-cost *read* of that cache on page load is
  permitted. Reading costs nothing. Writing, refreshing, and calling do not become
  permitted with it.

Test 7.8 asserts zero provider calls, zero reservations, and zero cache writes on
page load, and greps for any scheduled job or startup hook reaching the screening
path.

---

## Part 6 — Migrations

Supabase CLI, files in `backend/migrations/`, following the naming rule already
enforced by `backend/scripts/checkMigrations.js`
(`YYYYMMDDHHMMSS_description.sql`).

| File | Contents |
|---|---|
| `..._001_foundation.sql` | `pgcrypto`, default-privilege revoke (§3.0), `set_updated_at`, `profiles`, `user_entitlements`, their RLS, column grants, and `updated_at` triggers |
| `..._002_user_data.sql` | `watchlists`, `portfolio_holdings`, `user_preferences`, their RLS, column grants, `updated_at` triggers — **then, last in the file**, `handle_new_user()` and `on_auth_user_created` |
| `..._003_token_ledger.sql` | ledger, reservations, `reserve_provider_tokens`, RLS lockdown, function grants |
| *conditional, unwritten* | `shariah_screenings` — **blocked on Part 0.1**, schema in Appendix A |

Three migrations, not six. Revision 1's migration 004 (Shariah cache) is blocked,
005 is folded into 003, and 006 was never viable — see §6.2.

**Why the signup trigger sits at the end of 002, not in 001.** Revision 2 put it
in 001, and that was a genuine ordering defect. `handle_new_user()` inserts into
all three account tables, but `user_preferences` is not created until 002. A
person signing up in the window between the two migrations — which is a real
window during a staged deploy, not a theoretical one — would hit an insert against
a table that does not exist. And because the trigger deliberately does not swallow
exceptions (§4.4), that failure aborts the whole signup transaction loudly:
account creation simply blocked, with an opaque error, for as long as the window
lasts.

The rule this generalises to: **a trigger must be created after every table it
writes to.** Creating it earlier means its correctness depends on nobody using the
system mid-deploy, which is not a property we can assert.

**The rollback consequence.** Reversing 002 must drop the trigger *first*, then
the function, then the three tables — the exact reverse of creation order.
Dropping `user_preferences` while `on_auth_user_created` still exists leaves a
trigger pointing at a missing table, which reintroduces the same broken-signup
state from the other direction. The down-script ordering check in §6.1 covers
migration order between files; correct ordering *within* a down-script is a review
item, and this is the case to check for.

**Reproducible.** `supabase db reset` drops the local database and replays every
migration from empty. CI does exactly this on every pull request, so "it works on
my machine because of something I typed into the dashboard once" cannot happen.
Corollary rule: **no schema change is ever made by clicking in the Supabase
dashboard.** If it is not in a migration file, it does not exist.

Destructive changes follow the expand/backfill/contract rule already in
`backend/migrations/README.md`: add the new thing, move the data, and only remove
the old thing in a later release once nothing reads it. Never in one step.

**Environments.** Two Supabase projects: `azalens-dev` (free, disposable, reset
freely) and `azalens-prod` (real data, migrations applied only through CI after
tests pass). Never one project shared between them — that is how test data ends up
in production.

### 6.1 Down-scripts, and a finding about our own tooling

**Finding, recorded here because a plan file disappears and this document does
not.** Revision 1 proposed putting down-scripts in `backend/migrations/down/`.
That would have broken our existing tooling: `backend/scripts/checkMigrations.js:6`
validates *every* entry returned by `readdirSync` against
`^\d{14}_[a-z0-9][a-z0-9_-]*\.(js|sql)$` and does not skip directories. A `down/`
subfolder would be read as a filename, fail the pattern, and make
`npm run check:migrations` fail permanently.

Down-scripts therefore live in a sibling directory, `backend/migrations-down/`,
with filenames whose timestamps match their up-migration exactly. No change to the
existing checker is needed for it to keep passing.

**But a sibling directory is unchecked by default, and unchecked files rot.** So a
dedicated CI check — either an extension of `checkMigrations.js` or a new
`backend/scripts/checkDownMigrations.js` wired into `runCiSuite.js` — must prove
all four of:

1. Every up migration has **exactly one** matching down script.
2. Timestamps match exactly between each pair.
3. Down ordering is the exact reverse of up ordering.
4. No orphan down scripts exist with no corresponding up migration.

A missing or mismatched down script fails the build. This is the check that stops
`migrations-down/` from quietly drifting out of sync until the day we need it.

### 6.2 Legacy data import — a script, not a migration

Revision 1's migration `006_backfill_local_json.sql` **could never have worked.**
Postgres runs inside Supabase's infrastructure and cannot read files from Render's
filesystem. The migration would have failed on deploy, after the earlier
migrations had already applied — the worst time to discover it.

Replaced by `backend/scripts/importLegacyUserData.js`, matching the existing
`backend/scripts/` style:

- **Mandatory explicit `--user <uuid>`.** Never inferred, never "the first
  account". Importing someone's portfolio into the wrong account is not something
  a convenience default should be able to cause.
- Validates every record against the same constraints as the schema before
  inserting, so a malformed legacy row fails loudly rather than half-importing.
- `--dry-run` for the first pass, printing exactly what would happen.
- Idempotent upserts — safe to run twice.
- Prints imported / skipped / errored totals, and exits non-zero on any error.
- Run **once, manually, by a human.** Never wired into deploy, `postinstall`, or
  CI.

The legacy JSON files stay read-only on disk for one release as a fallback before
deletion.

### 6.3 Rollback — what "reversible" actually means here

Revision 1 said CI would assert "the schema is empty" after running downs. That is
wrong: a Supabase database always contains `auth`, `storage`, `realtime`,
`extensions`, `graphql`, and `vault`. An empty-schema assertion would either fail
immediately or, worse, be written loosely enough to pass while proving nothing.

CI asserts what we actually mean — scoped to objects we own:

1. After downs run **in reverse order**, no AzaLens-owned table, policy, trigger,
   function, or index remains in `public` — queried from `pg_tables`,
   `pg_policies`, `pg_trigger`, `pg_proc`, and `pg_indexes`.
2. Supabase-managed schemas are unchanged against a before-snapshot.
3. Re-applying every migration reproduces a schema dump matching a checked-in
   baseline.

**Production rollback is normally a forward corrective migration.** Destructive
down-scripts are a local and CI tool for proving migrations are well-formed. They
are never run automatically against real user data, because "undo the last
migration" against a live database usually means "delete a column users have
already filled in".

---

## Part 7 — Test plan

Nothing counts as done without tests, a commit, and production verification. Tests
run against a **local Supabase instance** in Docker — no cloud calls, no provider
calls, no cost. They join the existing `tests/runCiSuite.js` list.

### 7.1 User A cannot read user B's data — direct database

`tests/testTenantIsolation.js`. Setup, using the admin key against the *local*
database only:

```
create user A and user B; sign in as each
clientA = supabase(anon key) + token A
clientB = supabase(anon key) + token B
clientAnon = supabase(anon key), no token
```

**The test is driven by a per-table permission matrix, not a single generic
loop.** Revision 2 said "for every user-owned table, A inserts a row" — but
`profiles`, `user_entitlements` and `user_preferences` have no insert policy *by
design* (correction 10). That test would have failed on three of five tables for
reasons having nothing to do with isolation, which makes it worse than no test:
it produces red builds that train people to ignore red builds.

| Table | Actions available to the owner | Row created by |
|---|---|---|
| `profiles` | select, update | signup trigger |
| `user_entitlements` | select only | signup trigger |
| `user_preferences` | select, update | signup trigger |
| `watchlists` | select, insert, update, delete | the test, as A |
| `portfolio_holdings` | select, insert, update, delete | the test, as A |

Rows for the first three are **seeded by the signup trigger**, never inserted by
the test. Attempting to insert them would test the wrong thing and fail correctly.

**Positive path** — for each table, every action in its row must succeed for A on
A's own data, and only those. Then the design's own denials are asserted as
positives, because a permission that is supposed to be absent should be proven
absent:

- A inserting into `profiles`, `user_entitlements` or `user_preferences` → denied.
- A updating `user_entitlements` at all (including setting `tier = 'pro'`) →
  denied. This is the test that makes "Shariah free forever" structural.
- A deleting from `profiles` or `user_preferences` → denied.

**Cross-user denial** — applied to every applicable operation on every table, so
the matrix drives the denial cases too rather than only the allowed ones:

| Check | Applies to | Required result |
|---|---|---|
| B selects A's rows | all five | **0 rows** — an empty list, not an error |
| B selects by A's row id | all five | 0 rows |
| B updates A's row by id | the four with update | 0 rows affected; **re-read as A: unchanged** |
| B deletes A's row by id | `watchlists`, `portfolio_holdings` | 0 rows affected; **re-read as A: still there** |
| B inserts with `user_id = A` | `watchlists`, `portfolio_holdings` | error — insert policy violation |
| Anonymous client repeats all of the above | all five | 0 rows or error, every time |
| A sets `user_id`/`id` to B on own row | all five | rejected (§3.0.1: now a column-privilege error) |

The first row is the headline. The update and delete rows matter just as much and
are the ones people forget: reading is not the only way to leak, and silently
corrupting someone's portfolio is worse than reading it. Both re-read as A
afterwards — "zero rows affected" is not proof on its own.

**Immutable-column cases** (§3.0.1), on A's own rows, so they isolate the column
grant from the ownership policy:

- A updating `created_at`, `added_at`, `opened_at`, or `updated_at` directly →
  rejected.
- A legitimate update in the same table → succeeds **and** `updated_at` moves on
  its own. Both halves are asserted: proving the write is blocked is only half the
  requirement, since a column grant that also broke the trigger would pass a
  rejection-only test while quietly freezing every timestamp in the product.

### 7.2 User A cannot reach user B's data through our API

`tests/testApiIsolation.js`. Direct RLS tests prove the *database* is safe; they
do not prove the *API* is. Driving Express with real tokens:

- A cannot `GET` / `PATCH` / `DELETE` B's resource by ID — 404 or 403, never B's
  data in the body.
- `user_id: B` in A's request body is **ignored or rejected**, never honoured.
- Ownership derives exclusively from the verified JWT — a `user_id` query
  parameter changes nothing.
- The demo gate runs **before** `requireUser`: a valid token with no demo cookie
  returns `CLOSED_DEMO_ACCESS_REQUIRED`, not an auth error.

### 7.3 Concurrent requests never exchange identities

`tests/testIdentityIsolation.js`. The test for §1.1, and the reason §1.1 exists.

Fire many interleaved A and B requests simultaneously through Express — enough
concurrency that any shared mutable client state is hit. Assert every single
response contains only the calling user's rows, in both directions, with zero
crossover. Repeat under sustained load, since this class of bug appears only when
one request is awaiting while another mutates.

A deliberately-broken variant (a shared client with a reassigned header) must
**fail** this test. A test that cannot detect the bug it exists to catch is
decoration.

### 7.4 The test that catches the table we add next year

`tests/testRlsCoverage.js`. Isolation tests only cover tables someone remembered
to list. This one asks the database itself:

- Every table in `public` has `rowsecurity = true` **and**
  `relforcerowsecurity = true` — no exceptions list.
- Every user-owned table has policies covering exactly the operations its grants
  allow, and every policy references `auth.uid()`.
- The system tables have **zero** policies and **zero** grants to `anon` or
  `authenticated`.
- No policy anywhere uses `using (true)` for `authenticated` on a user-owned
  table.
- **No update grant to `authenticated` includes `id`, `user_id`, `created_at`,
  `added_at`, `opened_at`, or `updated_at`** — read from
  `information_schema.column_privileges`. This catches the case where someone
  later "fixes" a permission error by widening a grant back to table level, which
  would silently undo §3.0.1 while every other test still passed.

Add a table without policies and this test fails immediately. That is the point:
it protects against the mistake we have not made yet.

### 7.5 Privilege containment

`tests/testPrivilegeContainment.js`:

- No file under `frontend/` mentions `SUPABASE_SERVICE_ROLE_KEY` or
  `service_role`.
- No `VITE_`-prefixed variable holds a service key — frontend-visible variables
  are the anon key and the project URL only.
- The built `frontend/dist` bundle is scanned for the service-key pattern.
- The backend module holding the admin client is imported by an allowlist only
  (invite script, token reserver, legacy import script). A new importer fails.
- **No function in `public` is executable by `anon` or `authenticated`** outside an
  explicit allowlist — proving §3.0's default-privilege revoke actually took
  effect.
- `clientA.rpc('reserve_provider_tokens', ...)` fails with permission denied.

### 7.6 Token accounting is atomic

`tests/testTokenLedgerAtomicity.js`:

All assertions use the **exact code strings the function returns**, verbatim.
Revision 2 wrote shortened forms (`BUDGET_DISABLED`, `MONTHLY_BUDGET_EXCEEDED`)
that do not match the `HALAL_TERMINAL_`-prefixed values in Part 5, so the test
would have failed on a string comparison — a red build with nothing wrong
underneath. The three codes are `HALAL_TERMINAL_BUDGET_DISABLED`,
`HALAL_TERMINAL_BUDGET_OUT_OF_RANGE`, and
`HALAL_TERMINAL_MONTHLY_BUDGET_EXCEEDED`. They are asserted, never paraphrased,
and never matched by substring.

- **Concurrency.** Budget 100, cost 10. Fire 30 reservations simultaneously.
  Assert exactly 10 return `allowed = true`, 20 return
  `HALAL_TERMINAL_MONTHLY_BUDGET_EXCEEDED`, and the ledger reads **exactly 100**
  — never 101, never 90. This is the test that fails on a naive read-then-write.
- **Rollover, without a clock override.** Seed a prior-month ledger row directly
  via the admin key, then call the function normally. Assert a fresh current-month
  row starts at zero and the seeded prior-month row is byte-identical afterwards.
  Proves no carry-over and no early reset, through the real production path.
- **Bounds.** Budget zero or negative → `HALAL_TERMINAL_BUDGET_DISABLED`. Budget
  above 100,000,000, or cost zero, negative, or above 10,000 →
  `HALAL_TERMINAL_BUDGET_OUT_OF_RANGE`. In every one of these cases, **nothing is
  written** to either the ledger or the reservations table.
- **Reservations reconcile.** Sum of `estimated_cost` for a month equals
  `estimated_tokens_used`. This is what finally settles the item-3.4 one-sample
  estimate.
- **Not callable by a user** (shared with 7.5).

### 7.7 Shariah stays free, structurally

`tests/testShariahAlwaysFree.js`:

- Source-level assertion: no file on the Shariah screening path references
  `user_entitlements` or `tier`.
- A `free` user gets full screening, unlimited by tier.
- A user with `tier` manually set to `'pro'` gets an **identical** response — no
  extra features exist, so there is nothing to differ.
- No API response contains an upsell field, and no route returns `402`.

### 7.8 Cost-first on page load

With a network stub that throws on any outbound provider request: log in and load
the workspace with a populated watchlist and portfolio. **Assert zero provider
calls, zero token reservations, and zero cache writes.**

Plus a source-level assertion that no scheduled job, cron entry, startup hook, or
warming routine calls the screening path — §5.1's rule, enforced mechanically
rather than by memory.

### 7.9 Auth flow

`tests/testAuthFlow.js`:

- No token → 401 `AUTH_REQUIRED`. Expired token → 401 `AUTH_TOKEN_INVALID`.
- **Negative cases for every §4.3 check**: wrong issuer (a validly-signed token
  from a different Supabase project), wrong audience, `role` of `service_role`,
  disallowed algorithm, unknown `kid`, malformed `sub`.
- JWKS: unknown `kid` triggers exactly one refetch; repeated unknown `kid`s are
  throttled by the minimum-interval rule.
- Valid token but no demo cookie → `CLOSED_DEMO_ACCESS_REQUIRED` (shared with 7.2).
- Signup trigger produces exactly one row in each of `profiles`,
  `user_entitlements` (tier `free`), and `user_preferences`.
- **Display-name boundary cases.** RFC 5321 limits an email local part to 64
  octets, so a longer one cannot exist and testing it would be theatre. Test the
  cases that can actually occur: a **64-character local part** (the true maximum,
  which exceeds our 60-character column and must truncate cleanly),
  plus-addressing, a quoted local part *if Supabase accepts one*, missing
  `display_name` metadata, whitespace-only metadata, and a null-email identity
  where that identity type applies. Every case must create a valid account.
- Public signup is off: calling the public sign-up endpoint with the anon key is
  rejected by Supabase.
- Deleting a user cascades: all their rows disappear from every user table.

### 7.10 Migrations

`npm run check:migrations`, the new down-script pairing check (§6.1), and:

- `supabase db reset` from empty succeeds.
- Apply all → apply downs in reverse → the §6.3 scoped assertions → apply again →
  schema dump matches the checked-in baseline.
- Filenames match `YYYYMMDDHHMMSS_description.sql`.
- Local schema matches production — no dashboard drift.

### 7.11 Production verification, after deploy

Not automated; a written checklist, run once against production:

1. Log in as a real invited account; watchlist and portfolio load; **zero provider
   calls in the logs**.
2. Log in as a second account; confirm by eye that its data is empty and separate.
3. `/ops/metrics` shows `ledgerStorage: supabase-postgres` and
   `ledgerPersistence: durable`.
4. Trigger one live screening. Confirm the ledger increments by exactly the
   estimate, one reservation row is written, and — the point of all this —
   **compare against the Halal Terminal dashboard** to check the 5-token estimate
   against reality.
5. Redeploy. Confirm the ledger survives. That single check is the proof the
   durable-ledger work actually landed.

---

## Part 8 — Scope, and the gates

### Deferred out of this bucket

**`saved_analyses`.** Deferred, with two independent reasons. It exists only to
serve roadmap item 3.6 (historical verdict evaluation), which is already scheduled
later and already listed as depending on this work — so deferring it delays
nothing this bucket promises. And it is the only user-owned table that would carry
provider-derived content, which puts it squarely inside Part 0.1's unanswered
question 5. Building it now would mean either guessing at the terms or building it
twice.

**`shariah_screenings`.** Blocked, not deferred — designed and ready in Appendix
A, waiting on written confirmation.

### Not in this design at all

- **No payments, no Pro tier UI.** The `tier` column exists and is always
  `'free'`. Per Rules 24 and 26, payments do not go live before the UAE regulatory
  memo exists. This design neither advances nor delays that date; it just avoids a
  schema migration when it arrives.
- **No public signup.** Invitation only, for as long as the closed demo lasts.
- **No multiple watchlists, no teams, no sharing.** Additive later.
- **No social login.** Email and password only. Fewer moving parts.
- **No analytics tables.** Roadmap item 3.5 is designed after this lands, not
  smuggled into it.

### Launch gates this design adds or reaffirms

| Gate | Blocks |
|---|---|
| Provider-terms confirmation in writing (Part 0.1) | any durable storage of Shariah results; `saved_analyses` |
| Browser session storage reconsidered (§4.2) | **public signup and external beta** |
| UAE regulatory memo — Track B, Rule 26 | payments, external beta |
| Controlled beta gate — Rule 20 | external users |

---

## Part 9 — Decisions on record

**Settled:**

1. **Supabase free tier** — accepted for private development. The current pause
   policy is to be verified at project-creation time rather than assumed from
   memory, and the paid tier is a prerequisite for external beta, not an
   afterthought.
2. **Existing shared data** — imported into Ahsan's first account via the reviewed
   `importLegacyUserData.js` script (§6.2), with an explicit `--user` UUID. Not a
   migration.
3. **Session storage** — `localStorage` accepted for the closed demo only,
   recorded as a mandatory pre-public-launch gate (§4.2, Part 8).
4. **Scope** — `saved_analyses` deferred; `provider_token_reservations` kept
   because it is the only mechanism that ever settles the token-economics estimate.
5. **Signup trigger** — no exception swallowing; a failed signup is better than a
   half-created account.

**Open, and blocking:**

6. **Provider terms** (Part 0.1) — five questions, owner Tahir Khan sahib, folded
   into the existing Track B commercial-terms review recorded at
   `docs/PROVIDER_DEPENDENCY_AUDIT.md:163`. Blocks the durable Shariah cache and
   `saved_analyses`. Everything else in this document can be built while it is
   pending.

---

## Appendix A — `shariah_screenings`, conditional

**Not created. Not migrated. Not deployed.** Documented so it can be built the day
Part 0.1 is answered, and not one day earlier. If any answer comes back negative,
this appendix is deleted rather than adapted.

```sql
-- CONDITIONAL: requires written confirmation on all five Part 0.1 questions.
create table public.shariah_screenings (
  id               uuid primary key default gen_random_uuid(),
  symbol           text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$'),
  provider         text not null check (char_length(provider) <= 64),
  contract_version text not null check (char_length(contract_version) <= 64),
  data_mode        text not null check (data_mode in ('live', 'fixture')),
  payload          jsonb not null check (octet_length(payload::text) <= 32768),
  fetched_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  unique (symbol, provider, contract_version, data_mode)
);
create index shariah_screenings_expiry_idx on public.shariah_screenings (expires_at);

alter table public.shariah_screenings enable row level security;
alter table public.shariah_screenings force  row level security;
revoke all on public.shariah_screenings from anon, authenticated;
-- zero policies, zero grants: service_role only
```

Design notes held for that day:

- The key matches the existing `shariah:provider:SYMBOL` / `shariah:fixture:SYMBOL`
  scheme but adds `provider` and `contract_version`, so a provider response-shape
  change means bumping the version and ignoring old rows rather than misreading
  them.
- Expiry is checked on read, not enforced by a deletion job.
- No user reads this table directly even once it exists. Results reach the browser
  only through our API, which shapes them — the defensible position on provider
  terms.
- Which columns are permissible depends entirely on the answers. Storing "only
  normalised fields" is **not** a way to proceed without them (Part 0.1).
- Its tests — write/read hit, survives process restart, expired row misses,
  `contract_version` change misses, database-unreachable fails closed with zero
  provider calls — are written when the table is.
- §5.1 still applies in full: once this exists, a zero-cost read on page load is
  permitted; a write, refresh, or provider call on page load never is.

---

## Change log — revision 3

Four final-review fixes, applied to revision 2. Two were live defects that would
have surfaced on deploy or in CI, not polish.

| # | Fix | Where |
|---|---|---|
| i | **Migration ordering defect.** `handle_new_user()` was created in migration 001 but inserts into `user_preferences`, created in 002 — a signup in that window would have failed loudly and blocked account creation, exactly because the trigger does not swallow exceptions. Function and trigger moved to the end of 002, after all three account tables. Generalised rule recorded: a trigger is created after every table it writes to. Rollback consequence recorded: reversing 002 drops trigger → function → tables, in that order | Part 6, §4.4 |
| ii | **Test 7.1 contradicted its own policies.** The generic "A inserts a row into every user-owned table" matrix would have failed on `profiles`, `user_entitlements` and `user_preferences`, which have no insert policy by design (correction 10) — three of five tables red for reasons unrelated to isolation. Replaced with a per-table permission matrix; trigger-created rows are seeded by the trigger, not inserted by the test; absent permissions are asserted as positives; cross-user denial still covers every applicable operation on every table | 7.1 |
| iii | **Token test expected codes the function never returns.** `BUDGET_DISABLED` / `MONTHLY_BUDGET_EXCEEDED` corrected to the exact `HALAL_TERMINAL_`-prefixed strings from Part 5, asserted verbatim and never by substring | 7.6 |
| iv | **Column-level update grants.** Table-level `update` let a user rewrite `created_at`, `added_at`, `opened_at` and `updated_at` on their own rows — not a cross-user leak, but self-falsifiable history in a product whose claim is honest analysis. Grants narrowed to `display_name`; `theme, default_market, settings`; `note`; and `shares, average_price, currency`. `set_updated_at` confirmed unaffected — column privileges are checked against the user's `SET` clause, not against a trigger's assignment to `new`. Tests assert the rejection *and* that `updated_at` still moves | §3.0.1, §3.1, §3.3–3.5, 7.1, 7.4 |

Note recorded with fix iv: an attempt to change `user_id` now fails as a
column-privilege error rather than a policy violation. The `with check` clauses
are kept regardless as defence in depth, and tests assert *rejected* rather than a
specific error string.

---

## Change log — revision 2

Fifteen review corrections and four refinements, applied to revision 1.

| # | Correction | Where |
|---|---|---|
| 1 | Per-request Supabase client required; shared-client header mutation forbidden (`persistSession: false`, `autoRefreshToken: false`, no `setSession`, no reuse); concurrency test added | §1.1, 7.3 |
| 2 | Provider-terms verification made a blocking prerequisite — five explicit questions, owner named | Part 0.1, Appendix A |
| 3 | `p_now` removed from the token function; month computed internally via `clock_timestamp()`; totals `integer` → `bigint`; upper bounds on budget and cost; rollover tested by seeding ledger rows | Part 5, 7.6 |
| 4 | Legacy JSON import moved out of migrations (Postgres cannot read Render's filesystem) into `importLegacyUserData.js` — mandatory `--user`, validation, `--dry-run`, idempotent, manual-only | §6.2 |
| 5 | Demo-gate description corrected — it does not and cannot protect the Supabase auth endpoint; login does not pass through Express; brute-force protection is Supabase rate limiting, configured deliberately | §1.3 |
| 6 | Explicit `revoke execute … grant execute … to service_role`, plus `alter default privileges` so future functions are not silently exposed; test added | §3.0, Part 5, 7.5 |
| 7 | Full JWT verification specified — signature, algorithm allowlist, exact `iss`, `aud`, `exp`, `role`, `sub`, JWKS caching with rotation and refetch throttling; negative tests added | §4.3, 7.9 |
| 8 | Signup trigger made failure-safe by construction (`left(…, 60)`, coalesce chain, `on conflict do nothing`); exceptions deliberately not swallowed | §4.4 |
| 9 | Schema tightened — symbol pattern everywhere, currency uppercase, length caps, `octet_length` JSONB bounds, shared `set_updated_at` trigger, reservation retention | Part 2 |
| 10 | `user_preferences` contradiction resolved — trigger owns creation; insert grant and policy removed; consequence stated | §2.5, §3.5 |
| 11 | Backend API isolation tests added, distinct from direct RLS tests | 7.2 |
| 12 | Rollback claim refined — "schema is empty" replaced with assertions scoped to AzaLens-owned objects; Supabase-managed schemas untouched; reverse ordering; production uses forward corrective migrations | §6.3 |
| 13 | Scope reduced 9 tables → 7 shipped: `saved_analyses` deferred, `shariah_screenings` blocked, `provider_token_reservations` kept | Part 2, Part 8 |
| 14 | `localStorage` session decision reworded from "revisit" to a hard gate — no public signup or external beta until reconsidered | §4.2, Part 8 |
| 15 | No cache write, refresh, provider call, or reservation ever originates from a page load; cache warming explicitly forbidden and named as the dashboard leak in new clothes | §5.1, 7.8 |

Refinements applied on approval:

| # | Refinement | Where |
|---|---|---|
| A | Stricter than planned — `shariah_screenings` not created at all until terms are confirmed in writing, **not even with minimum normalised fields**, since normalised provider-derived data may carry the same restrictions; schema held as conditional; zero-cost cache *reads* on page load permitted only once legally retainable data exists | Part 0.1, Appendix A, §5.1 |
| B | Email boundary corrected — RFC 5321 caps a local part at 64 octets, so the "70+ character" case cannot exist; test the valid 64-character boundary, plus-addressing, quoted local parts if accepted, missing metadata, and applicable null-email identities | 7.9 |
| C | `migrations-down/` must not become unchecked — dedicated CI check proving one-to-one pairing, matching timestamps, correct reverse ordering, and no orphan down scripts | §6.1 |
| D | Both independent findings recorded in this document rather than only in the plan file: the `checkMigrations.js` directory conflict, and that `docs/PROVIDER_DEPENDENCY_AUDIT.md:163` already assigns commercial-terms review to Tahir Khan sahib | §6.1, Part 0.1 |
