-- =========================================================
-- Phase 9E Stage 9E-4C-2: reminder_deliveries claim/send/finalize
-- state — additive columns (dormant)
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED / NOT APPLIED.
--
-- Purpose: let a future automatic-delivery worker safely distinguish
-- "claimed, not yet confirmed sent" from "confirmed delivered" from
-- "gave up after repeated failures." The Stage 9E-4A schema could not
-- represent this (delivered_at is set unconditionally at insert time),
-- which made it impossible to guarantee both "no reminder is silently
-- lost after a crash/transient failure" and "no duplicate send across
-- overlapping/retried executions" at the same time.
--
-- Design note: zero push subscriptions and all-subscriptions-stale are
-- treated as ordinary retryable failures, NOT as immediate terminal
-- conditions — a user may re-subscribe before the retry cap is
-- reached, and the reminder can still be legitimately delivered. The
-- ONLY path to 'abandoned' is exhausting the retry cap (an
-- application-level policy constant, not enforced here as a CHECK, so
-- it can be tuned later without a migration).
--
-- This migration is additive/behavioral only:
--   - does NOT drop or rename any existing reminder_deliveries column
--     (id, user_id, category, source_id, dedup_key, delivered_at all
--     keep their current name, type, and constraints, unchanged)
--   - does NOT touch the existing unique(user_id, dedup_key)
--     constraint — it remains the sole concurrency guard for the
--     initial claim
--   - does NOT touch existing rows — the table is currently empty (no
--     automatic sending has ever occurred), and this file performs no
--     UPDATE/backfill of any kind regardless
--   - does NOT modify RLS — reminder_deliveries stays enabled with
--     ZERO policies, exactly as Stage 9E-4A left it, so it remains
--     completely unreachable from the browser/client in every
--     direction; only the service-role key (bypassing RLS by design,
--     the same precedent already established by
--     api/reconcile-orders.js and api/test-push.js) can read or write
--     this table
--   - does NOT grant authenticated/browser clients any new access
--   - does NOT modify push_subscriptions, any academic table
--     (subjects, activities, notes, grades, semesters,
--     subject_schedules), profiles, pro_orders, or any
--     PayMongo-related table
--   - does NOT create or modify any cron job, scheduled function, or
--     vercel.json — none exists yet
--   - does NOT send, queue, or compute any reminder — no such logic is
--     introduced by this file; it only stores additional state columns
--     for a later stage to read/write
-- =========================================================

-- ---------------------------------------------------------
-- 1. State/attempt/lease columns
--
-- status: 'claimed' (initial + retryable-after-failure) | 'sent'
-- (terminal success) | 'abandoned' (terminal, retry cap exhausted
-- only). See the Stage 9E-4C-2 design review for the full state
-- machine and the reasoning for why zero-subscriptions/all-stale
-- conditions stay 'claimed' rather than jumping straight to
-- 'abandoned'.
--
-- attempt_count: incremented on every send attempt (success or
-- failure); drives the only transition into 'abandoned'.
--
-- last_attempt_at: null until the first real send attempt is made —
-- distinct from delivered_at, which (unchanged) is set at INSERT/claim
-- time regardless of whether a send has happened yet.
--
-- lease_expires_at: the crash-recovery / overlapping-worker guard. A
-- worker claiming or reclaiming a row sets this to now() plus a lease
-- duration; only once it has passed may another invocation reclaim the
-- row via an atomic conditional UPDATE (never a SELECT-then-INSERT/
-- UPDATE pattern) analogous to the initial claim's
-- `on conflict (user_id, dedup_key) do nothing`.
--
-- sent_at: the new, sole authoritative "genuinely delivered" timestamp
-- — set only when status transitions to 'sent'. delivered_at
-- (unchanged, still NOT NULL with its original default) should from
-- this point on be read only as "row first claimed/created at," never
-- as proof of delivery; any future reporting/analytics query must use
-- status/sent_at instead.
--
-- last_error: diagnostic text only (e.g. 'no_subscriptions',
-- 'all_subscriptions_stale') — never subscription endpoint/key
-- material or any other secret.
-- ---------------------------------------------------------
alter table public.reminder_deliveries
  add column if not exists status text not null default 'claimed',
  add column if not exists attempt_count int not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists last_error text;

-- ---------------------------------------------------------
-- 2. Validity constraints
-- ---------------------------------------------------------
alter table public.reminder_deliveries
  add constraint reminder_deliveries_status_valid
  check (status in ('claimed', 'sent', 'abandoned'));

alter table public.reminder_deliveries
  add constraint reminder_deliveries_attempt_count_valid
  check (attempt_count >= 0);

-- ---------------------------------------------------------
-- 3. Retry-sweep index
--
-- Serves the retry sweep's real access pattern ("find claimed rows
-- whose lease has expired") without scanning the eventually-larger
-- population of terminal 'sent'/'abandoned' rows. Partial on
-- status = 'claimed' so this index never grows with the ledger's
-- long-term terminal history.
-- ---------------------------------------------------------
create index if not exists reminder_deliveries_retry_idx
  on public.reminder_deliveries (lease_expires_at)
  where status = 'claimed';
