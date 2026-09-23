-- =========================================================
-- Phase 9E Stage 9E-2: Web Push subscription storage foundation
--
-- Purpose: add a new, purely additive public.push_subscriptions table so
-- an authenticated user's browser/device PushSubscription can be
-- persisted for a LATER stage to read when sending real background push
-- notifications — with zero changes to any existing table or existing
-- data.
--
-- This migration is additive/behavioral only:
--   - does NOT modify subjects, subject_schedules, activities, notes,
--     grades, semesters, or profiles in any way
--   - does NOT copy semester, subject, class schedule, or activity data
--     into this table — a subscription row describes a DEVICE, never a
--     reminder; "what to send" stays entirely computed elsewhere, later
--   - does NOT backfill any row for any existing user — every user has
--     zero push_subscriptions rows until their browser explicitly
--     subscribes in a later stage's frontend flow
--   - does NOT modify RLS on any existing table
--   - does NOT modify profiles, pro_orders, or any PayMongo-related table
--   - does NOT add any server-side sending, scheduling, or VAPID key
--     storage — this stage only stores subscription rows; no
--     notification/reminder delivery logic is implemented here
-- =========================================================

-- ---------------------------------------------------------
-- push_subscriptions: one row = one browser/device's Web Push
-- registration for one Takda user. A user can have many rows (phone,
-- laptop, multiple browsers); a device/browser has exactly one row,
-- keyed by its own unique `endpoint` (issued by the browser's push
-- service, not by Takda) — see the unique constraint below for why
-- uniqueness is scoped to endpoint alone rather than (user_id, endpoint).
--
-- p256dh/auth_key are the two public encryption values the browser
-- returns alongside the endpoint when subscribing (`auth` is avoided as
-- a column name — it collides with the reserved `auth` schema name).
--
-- last_seen_at is set explicitly by the client on every
-- subscribe/re-subscribe call, the same manual-timestamp convention
-- profile saves already use elsewhere in this app (no auto-touch
-- trigger convention exists anywhere in this schema; this migration
-- does not introduce one).
-- ---------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Scoped to endpoint alone, not (user_id, endpoint): a PushSubscription
  -- endpoint is already globally unique per browser installation by
  -- construction (issued by the push service, never by Takda). Scoping
  -- uniqueness by user_id too would wrongly allow the same endpoint to
  -- exist under two different user_id rows at once, which can only
  -- happen from an account switch on a shared device — that case must
  -- re-point this single row's user_id (an upsert on conflict(endpoint),
  -- implemented in the frontend lifecycle), never create a duplicate.
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

-- ---------------------------------------------------------
-- Tenant-aware index — RLS already filters every query by user_id, so a
-- plain user_id index directly serves the real access pattern ("all of
-- my devices"), matching the same indexing rationale already used on
-- subjects/activities/notes/grades/subject_schedules.
-- ---------------------------------------------------------
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

-- ---------------------------------------------------------
-- RLS — authenticated users only, strictly scoped to their own rows.
-- A later server-side sending stage uses the service-role key (which
-- bypasses RLS by design, the same precedent already established by
-- api/reconcile-orders.js) — no RLS here is ever relaxed or bypassed to
-- support that; these four policies only ever govern the client's own
-- subscribe/unsubscribe calls.
-- ---------------------------------------------------------
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);
