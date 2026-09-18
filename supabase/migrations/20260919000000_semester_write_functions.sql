-- =========================================================
-- Phase 8 Stage 4A: Semester write RPCs (functions + execute grants only)
--
-- DOCUMENTATION / VERSION CONTROL ONLY AT CREATION TIME.
-- This file defines the database functions that make semester writes
-- (metadata update, atomic activate/switch, archive) safe. It is
-- additive only:
--   - does NOT recreate public.semesters
--   - does NOT add/alter semester_id columns
--   - does NOT recreate Stage 3 foreign keys or indexes
--   - does NOT backfill or UPDATE existing data outside the functions
--     themselves being called later
--   - does NOT DELETE or DROP anything
--   - does NOT modify existing RLS on semesters or on
--     subjects/activities/notes/grades
--   - does NOT touch profiles, pro_orders, or any PayMongo-related table
--
-- All three functions are SECURITY INVOKER: they never bypass RLS.
-- They only ever operate on rows already owned by auth.uid(), which
-- the existing Stage 3 RLS policies on public.semesters already permit
-- the calling user to touch. Ownership is additionally re-checked
-- explicitly inside each function as defense in depth, and every
-- "not found" case (wrong id, wrong owner, wrong state) raises the
-- same generic error so a caller cannot distinguish "doesn't exist"
-- from "exists but isn't yours".
-- =========================================================

-- ---------------------------------------------------------
-- RPC 1: update_semester_metadata
--
-- Updates ONLY name / school_year / start_date / end_date on a
-- semester the caller owns. Cannot touch id, user_id, is_active,
-- archived_at, or created_at, because the UPDATE's SET clause never
-- mentions them — this is a structural guarantee, not app convention.
--
-- The existing semesters_date_order CHECK constraint (Stage 3) is
-- the final database backstop for start_date <= end_date; this
-- function does not duplicate that validation.
-- ---------------------------------------------------------
create or replace function public.update_semester_metadata(
  p_semester_id uuid,
  p_name text,
  p_school_year text,
  p_start_date date,
  p_end_date date
)
returns public.semesters
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_name text;
  v_result public.semesters;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  v_name := trim(p_name);

  if v_name is null or v_name = '' then
    raise exception 'Semester name is required.';
  end if;

  update public.semesters
  set
    name = v_name,
    school_year = p_school_year,
    start_date = p_start_date,
    end_date = p_end_date
  where id = p_semester_id
    and user_id = auth.uid()
  returning * into v_result;

  if not found then
    raise exception 'Semester not found.';
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------
-- RPC 2: activate_semester
--
-- Atomically makes p_semester_id the caller's only active semester.
-- Runs entirely inside this function's implicit transaction, so a
-- failure at any point rolls back the whole operation — there is
-- never a persisted state with zero-or-two actives as a result of
-- this function alone.
--
-- Locking: pg_advisory_xact_lock() takes a bigint (64-bit) key. A
-- plain hashtext() only returns a 32-bit int4, which halves the
-- effective key space and raises collision odds between unrelated
-- users sharing a lock unnecessarily. hashtextextended(text, seed)
-- returns a genuine 64-bit bigint hash, so it is used here instead,
-- keyed on the authenticated user's UUID text. This lock is a purely
-- internal serialization aid (never an authorization mechanism): it
-- only prevents two concurrent activate_semester calls FOR THE SAME
-- USER from interleaving (e.g. two browser tabs switching at once).
-- It is transaction-scoped (`_xact_`), so it is released automatically
-- on commit or rollback — no manual unlock needed, no risk of a stuck
-- lock outliving the call.
--
-- The existing partial unique index semesters_one_active_per_user is
-- left completely untouched and remains the independent, unconditional
-- database-level backstop even if this function's own logic ever had
-- a bug.
--
-- Idempotent outcome: calling this on an already-active target is
-- safe — the "deactivate others" step excludes the target by id, and
-- re-setting is_active = true on an already-true row is a no-op
-- change, so the end state (exactly this semester active) is
-- unchanged either way.
-- ---------------------------------------------------------
create or replace function public.activate_semester(
  p_semester_id uuid
)
returns public.semesters
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target public.semesters;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  -- Serialize concurrent activation attempts for this one user only.
  -- 64-bit key derived from the user's UUID text via hashtextextended;
  -- transaction-scoped, released automatically at commit/rollback.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select *
  into v_target
  from public.semesters
  where id = p_semester_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Semester not found.';
  end if;

  if v_target.archived_at is not null then
    raise exception 'Cannot activate an archived semester.';
  end if;

  update public.semesters
  set is_active = false
  where user_id = v_user_id
    and is_active = true
    and id <> p_semester_id;

  update public.semesters
  set is_active = true
  where id = p_semester_id
  returning * into v_target;

  return v_target;
end;
$$;

-- ---------------------------------------------------------
-- RPC 3: archive_semester
--
-- V1 behavior (Option 1, approved): archiving the currently active
-- semester is allowed and may leave the user with zero active
-- semesters. This function never activates another semester on the
-- caller's behalf.
--
-- One atomic UPDATE sets archived_at and clears is_active together,
-- so "an archived semester cannot remain active" holds by
-- construction — no separate deactivate step, no window where both
-- could be true. Single-row operation: no advisory lock needed here,
-- unlike activate_semester.
--
-- No permanent delete exists anywhere in this migration.
-- ---------------------------------------------------------
create or replace function public.archive_semester(
  p_semester_id uuid
)
returns public.semesters
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result public.semesters;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  update public.semesters
  set
    archived_at = now(),
    is_active = false
  where id = p_semester_id
    and user_id = auth.uid()
    and archived_at is null
  returning * into v_result;

  if not found then
    raise exception 'Semester not found.';
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------
-- Execute permissions — hardened per function.
--
-- Every PostgreSQL function is PUBLIC-executable by default, so each
-- one is explicitly locked down here: PUBLIC and anon are revoked,
-- and only authenticated may call them. service_role is intentionally
-- NOT granted — nothing in the Stage 4 client architecture needs it,
-- and service_role already bypasses RLS/grants entirely for the
-- existing PayMongo serverless functions, which do not touch semesters.
-- ---------------------------------------------------------
revoke all on function public.update_semester_metadata(uuid, text, text, date, date) from public;
revoke all on function public.update_semester_metadata(uuid, text, text, date, date) from anon;
grant execute on function public.update_semester_metadata(uuid, text, text, date, date) to authenticated;

revoke all on function public.activate_semester(uuid) from public;
revoke all on function public.activate_semester(uuid) from anon;
grant execute on function public.activate_semester(uuid) to authenticated;

revoke all on function public.archive_semester(uuid) from public;
revoke all on function public.archive_semester(uuid) from anon;
grant execute on function public.archive_semester(uuid) to authenticated;
