-- =========================================================
-- Phase 9E Stage 9E-4A: Automatic reminder delivery — data
-- foundation (dormant)
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED / NOT APPLIED.
--
-- Purpose: add the minimum additive schema a LATER stage needs to
-- compute and send automatic background reminders — with zero
-- automatic sending, zero scheduling, and zero behavioral change to
-- any existing row, table, or notification path in this stage.
--
-- This migration is additive/behavioral only:
--   - does NOT create, enable, or wire up any cron job, scheduled
--     function, or server endpoint — none exists yet
--   - does NOT send, queue, or compute any reminder — no such logic
--     is introduced by this file
--   - does NOT change the existing foreground reminder behavior
--     (Stage 9A/9B/9D-5) or the existing manual Web Push test path
--     (Stage 9E-3) in any way
--   - does NOT modify subjects, subject_schedules, activities, notes,
--     grades, semesters, or push_subscriptions in any way — column
--     for column, row for row, unchanged
--   - does NOT modify profiles, pro_orders, or any PayMongo-related
--     table beyond the single additive column below
--   - does NOT backfill or guess a timezone for any existing user —
--     profiles.timezone is added NULL for every existing row and
--     stays NULL until a user (or a later, separate stage's explicit
--     detection/preference UI) sets a real IANA value
--   - does NOT backfill or synthesize any reminder_deliveries row —
--     the table starts empty and stays empty until a later stage
--     actually sends something
--   - does NOT modify RLS on any existing table
--   - does NOT grant authenticated clients any access
--     (insert/update/delete) to reminder_deliveries — this stage is
--     deliberately service-role-only; the minimum authenticated
--     access (if any) is added later, only when foreground/background
--     dedup integration (Stage 9E-4D) actually needs it
-- =========================================================

-- ---------------------------------------------------------
-- 1. profiles.timezone
--
-- Nullable, no default, no backfill. Deliberately NOT defaulted to
-- any timezone (e.g. Asia/Manila) for existing OR new rows — a
-- missing timezone must stay an explicit, visible NULL, never a
-- guessed value. A later automatic-delivery stage must treat NULL
-- here as "skip this user" rather than assume any zone.
--
-- No CHECK constraint enforcing IANA-name validity is added: Postgres
-- CHECK constraints cannot reference pg_timezone_names (a view, not
-- an immutable expression), so real validation of "is this a genuine
-- IANA zone name" belongs at the application layer, at the point a
-- later stage's timezone-detection/preference UI actually writes this
-- column — out of scope for this stage, which only stores the column.
--
-- `if not exists` guard: no equivalent timezone/time_zone/tz column
-- was found anywhere in the current profiles schema or any existing
-- migration (confirmed by inspection before writing this file), so
-- this is expected to be a genuine new column everywhere it runs.
-- ---------------------------------------------------------
alter table public.profiles
  add column if not exists timezone text;

-- ---------------------------------------------------------
-- 2. reminder_deliveries: persistent, server-side dedup ledger.
--
-- One row = one reminder EVENT already decided/delivered for one
-- user (e.g. "activity X's due-today reminder, for today" or "class
-- schedule Y's 15-minute-before reminder, for today's occurrence") —
-- never one row per device. Fan-out to a user's multiple
-- push_subscriptions rows happens after this ledger says an event is
-- new; this table only ever answers "have we already acted on this
-- exact event," independent of how many devices that user has.
--
-- category + source_id are kept alongside dedup_key (rather than
-- requiring dedup_key to be parsed) so a future reminder category is
-- purely additive: a new category value and a new dedup_key shape,
-- no schema change. source_id intentionally has no foreign key: it
-- points to either activities.id or subject_schedules.id depending on
-- category, so a single-target FK is not meaningful here — the same
-- rationale already used for activities.recurrence_series_id having
-- no FK in the Stage 9C-2 migration.
--
-- No table-level relationship to push_subscriptions: this table
-- describes WHAT was decided, never WHICH device/browser it was sent
-- to — the same separation of concerns the Stage 9E-2 migration
-- already established for push_subscriptions itself ("a subscription
-- row describes a DEVICE, never a reminder").
-- ---------------------------------------------------------
create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  source_id uuid not null,
  dedup_key text not null,
  delivered_at timestamptz not null default now(),
  -- The real concurrency guard for repeated/overlapping scheduled
  -- executions: two runs (or an overlapping retry) that both decide
  -- "this event is new" both attempt to insert the same
  -- (user_id, dedup_key) row; the second insert fails this
  -- constraint instead of creating a duplicate. A later stage's
  -- insert is expected to use `on conflict (user_id, dedup_key) do
  -- nothing` rather than relying on a pre-check, so this constraint
  -- is the actual source of truth, not just documentation.
  constraint reminder_deliveries_user_dedup_unique unique (user_id, dedup_key)
);

-- No separate single-column index on user_id: the composite unique
-- constraint above is itself a btree index on (user_id, dedup_key)
-- with user_id as its leading column, so it already fully serves a
-- "my rows" / user-scoped lookup (Postgres can use a leftmost prefix
-- of a composite index for a query that filters on user_id alone) —
-- the same "don't add a redundant index" discipline this schema
-- already follows elsewhere. A dedicated index would only duplicate
-- what this constraint's own index already provides.

-- ---------------------------------------------------------
-- RLS — enabled with ZERO policies, deliberately.
--
-- With row level security enabled and no policy defined for a given
-- command, Postgres denies that command by default for every role
-- subject to RLS (anon and authenticated) — so this table is
-- completely unreachable from the browser/client in every direction
-- (select/insert/update/delete), in this stage. This is intentional,
-- not an oversight: Stage 9E-4A's own instructions call for
-- service-role ownership only, with the minimum authenticated access
-- added later, deliberately, only once Stage 9E-4D (foreground/
-- background dedup integration) actually needs it — never added now
-- "for convenience."
--
-- A later server-side stage (the actual reminder-sending function)
-- uses the service-role key, which bypasses RLS by design — the same
-- precedent already established by api/reconcile-orders.js and
-- api/test-push.js. No policy here is ever relaxed to support that;
-- RLS being enabled with no policies is exactly what makes
-- service-role-only access structurally true today, not just a
-- convention.
-- ---------------------------------------------------------
alter table public.reminder_deliveries enable row level security;
