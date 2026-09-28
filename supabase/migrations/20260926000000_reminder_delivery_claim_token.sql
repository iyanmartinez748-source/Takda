-- =========================================================
-- Phase 9E Stage 9E-4C-2: reminder_deliveries dedicated claim-token
-- fencing + atomic finalize RPCs (dormant)
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED / NOT APPLIED.
--
-- Purpose: replace the concurrency review's earlier "reuse
-- lease_expires_at as an ownership proxy" idea (rejected as carrying a
-- small but non-zero fencing/collision risk) with a dedicated
-- claim_token column plus two atomic finalize functions, so that:
--   - lease reclaim (still a plain PostgREST UPDATE, unchanged by this
--     migration) mints a fresh claim_token on every successful claim
--     or reclaim
--   - a worker whose claim has since been superseded by a later
--     reclaim can never successfully finalize (its remembered token no
--     longer matches the row's current token, so its finalize call
--     atomically affects zero rows — a safe no-op)
--   - the one relative/computed update PostgREST's plain REST
--     interface cannot express safely (attempt_count = attempt_count +
--     1 combined with a conditional status transition) is done inside
--     a single atomic SQL statement server-side, never via an
--     application-level read-then-write
--
-- This migration is additive/behavioral only:
--   - does NOT drop or rename any existing reminder_deliveries column
--     — id, user_id, category, source_id, dedup_key, delivered_at,
--     status, attempt_count, last_attempt_at, lease_expires_at,
--     sent_at, last_error all keep their current name, type, and
--     constraints, unchanged
--   - does NOT touch the existing unique(user_id, dedup_key)
--     constraint, the existing status/attempt_count CHECK constraints,
--     or the existing reminder_deliveries_retry_idx partial index —
--     all remain exactly as the prior migration left them
--   - does NOT touch existing rows — the table is currently empty (no
--     automatic sending has ever occurred), and this file performs no
--     UPDATE/backfill of any kind regardless
--   - does NOT modify RLS — reminder_deliveries stays enabled with
--     ZERO policies; the two new functions below are SECURITY INVOKER
--     (never DEFINER) and are granted EXECUTE to service_role only,
--     so they can never be used to bypass RLS or read/write this
--     table on behalf of a browser/authenticated caller
--   - does NOT grant authenticated/browser clients any new access —
--     EXECUTE on both new functions is explicitly revoked from PUBLIC
--     (Postgres's default grant on function creation) before being
--     re-granted to service_role alone
--   - does NOT modify push_subscriptions, any academic table
--     (subjects, activities, notes, grades, semesters,
--     subject_schedules), profiles, pro_orders, or any
--     PayMongo-related table
--   - does NOT create or modify any cron job, scheduled function, or
--     vercel.json — none exists yet
--   - does NOT send, queue, or compute any reminder — no such logic is
--     introduced by this file
-- =========================================================

-- ---------------------------------------------------------
-- 1. claim_token — dedicated ownership/fencing token
--
-- NOT NULL with a volatile default (gen_random_uuid()) is safe here
-- specifically because the table is currently empty; a volatile
-- default on a NOT NULL column added to a non-empty table would force
-- a full table rewrite, which is a non-issue with zero existing rows.
--
-- Every successful initial claim (INSERT ... ON CONFLICT DO NOTHING,
-- unchanged plain PostgREST call) and every successful lease reclaim
-- (UPDATE ... WHERE lease_expires_at < now(), also unchanged plain
-- PostgREST call) mints a fresh claim_token — reclaim explicitly sets
-- a freshly generated value in its own SET clause; claim relies on
-- this column's default. Neither claim nor reclaim requires an RPC:
-- both remain safe as ordinary PostgREST calls under READ COMMITTED
-- row-lock + re-check semantics, independent of this new column.
--
-- claim_token deliberately stays UNCHANGED across a retryable failure
-- finalize — ownership only transfers at claim/reclaim time, never at
-- finalize time (see finalize_reminder_delivery_failure below).
-- ---------------------------------------------------------
alter table public.reminder_deliveries
  add column if not exists claim_token uuid not null default gen_random_uuid();

-- ---------------------------------------------------------
-- 2. finalize_reminder_delivery_success
--
-- Atomically transitions a currently-claimed row to 'sent', gated by
-- BOTH status = 'claimed' and an exact claim_token match — the second
-- check is what makes this safe against a worker whose claim has
-- since been superseded by a reclaim (its remembered token no longer
-- matches, so this affects zero rows for that caller).
--
-- attempt_count is incremented here too, under this migration's
-- chosen definition: attempt_count counts the TOTAL number of send
-- attempts made for this event, successful or failed, not merely
-- failures — so a successful finalize is itself one more counted
-- attempt, keeping this column's meaning identical and comparable
-- across both the success and failure RPCs.
--
-- last_error is deliberately left untouched on success, preserving
-- "succeeded despite an earlier failure" as informative history
-- rather than erasing it.
--
-- SECURITY INVOKER (explicit, not the implicit default) plus
-- SET search_path = '' with every object reference fully schema-
-- qualified: standard Postgres/Supabase function-hardening practice,
-- independent of the fact that only service_role can ever call this.
-- pg_catalog built-ins (now(), etc.) remain resolvable regardless of
-- an empty search_path — only unqualified references to non-catalog
-- objects would fail, and none exist in this function body.
-- ---------------------------------------------------------
create or replace function public.finalize_reminder_delivery_success(
  p_user_id uuid,
  p_dedup_key text,
  p_claim_token uuid
) returns setof public.reminder_deliveries
language sql
security invoker
set search_path = ''
as $$
  update public.reminder_deliveries
  set
    status = 'sent',
    sent_at = now(),
    attempt_count = attempt_count + 1,
    last_attempt_at = now()
  where user_id = p_user_id
    and dedup_key = p_dedup_key
    and status = 'claimed'
    and claim_token = p_claim_token
  returning *;
$$;

-- ---------------------------------------------------------
-- 3. finalize_reminder_delivery_failure
--
-- Atomically increments attempt_count and derives status from the
-- row's OWN current value inside a single UPDATE statement — the one
-- operation plain PostgREST PATCH structurally cannot express (its
-- REST body accepts only literal values, never a relative expression
-- like "attempt_count + 1"), which is the specific, unavoidable reason
-- this one operation requires a database function rather than a plain
-- REST call.
--
-- language plpgsql (rather than the plain "language sql" used above)
-- exists specifically to allow the p_max_attempts guard below: a NULL
-- p_max_attempts would otherwise make "attempt_count + 1 >= NULL"
-- evaluate to NULL (not-true) in the CASE expression, silently making
-- retries infinite; a zero/negative p_max_attempts would make that
-- same comparison true on the very first failure, silently abandoning
-- every reminder after one attempt. Both failure modes are silent and
-- system-wide, so this function fails loudly instead via
-- RAISE EXCEPTION on any non-positive-integer input, rather than
-- clamping or otherwise guessing a "safe" substitute value.
--
-- On a still-retryable failure (new attempt_count below
-- p_max_attempts), lease_expires_at is set to now() — immediately
-- expired — so the very next sweep can reclaim and retry right away,
-- rather than waiting out the remainder of the original ~3-minute
-- lease window. On the attempt that reaches p_max_attempts,
-- lease_expires_at is left untouched: irrelevant once the row is
-- 'abandoned', since every reclaim/finalize path requires
-- status = 'claimed', which an abandoned row can never satisfy again.
--
-- claim_token is deliberately NOT changed here (see the claim_token
-- column note above) — a still-'claimed' row keeps the same token
-- until a future reclaim transfers ownership and mints a new one.
--
-- last_error is bounded to 500 characters via left(...) as a defensive
-- cap against an unexpectedly large upstream error string. This
-- column must never contain subscription endpoints, p256dh/auth
-- keys, bearer tokens, or any other secret material — that guarantee
-- is the responsibility of the application code that constructs the
-- p_error string before calling this function; this migration cannot
-- enforce that semantically.
-- ---------------------------------------------------------
create or replace function public.finalize_reminder_delivery_failure(
  p_user_id uuid,
  p_dedup_key text,
  p_claim_token uuid,
  p_error text,
  p_max_attempts int
) returns setof public.reminder_deliveries
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_max_attempts is null or p_max_attempts < 1 then
    raise exception 'p_max_attempts must be a positive integer, got %', p_max_attempts;
  end if;

  return query
    update public.reminder_deliveries
    set
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      last_error = left(p_error, 500),
      status = case when attempt_count + 1 >= p_max_attempts then 'abandoned' else 'claimed' end,
      lease_expires_at = case when attempt_count + 1 >= p_max_attempts then lease_expires_at else now() end
    where user_id = p_user_id
      and dedup_key = p_dedup_key
      and status = 'claimed'
      and claim_token = p_claim_token
    returning *;
end;
$$;

-- ---------------------------------------------------------
-- 4. EXECUTE privileges — service-role-only
--
-- Postgres grants EXECUTE to PUBLIC on function creation by default
-- (unlike table privileges, which default to restrictive) — both
-- REVOKEs below are required, not defensive boilerplate, to prevent
-- anon/authenticated (both members of PUBLIC) from ever being able to
-- call either function. Only service_role — which already has full,
-- direct read/write access to this table regardless of these
-- functions' existence — is granted EXECUTE.
-- ---------------------------------------------------------
revoke all on function public.finalize_reminder_delivery_success(uuid, text, uuid) from public;
revoke all on function public.finalize_reminder_delivery_failure(uuid, text, uuid, text, int) from public;

grant execute on function public.finalize_reminder_delivery_success(uuid, text, uuid) to service_role;
grant execute on function public.finalize_reminder_delivery_failure(uuid, text, uuid, text, int) to service_role;
