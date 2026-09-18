-- =========================================================
-- Phase 8 Stage 4C2A: Academic semester_id immutability
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED.
--
-- Purpose: guarantee, at the database level, that an academic
-- record's semester_id can only ever be SET at INSERT time and can
-- never be changed afterward by an ordinary UPDATE — regardless of
-- what any future frontend code does or how it does it. This is the
-- structural backstop behind the frontend-level creation-time
-- assignment logic that a later stage (4C2C/4C2D) will introduce.
--
-- This migration is additive/behavioral only:
--   - does NOT change any existing data
--   - does NOT backfill semester_id (legacy NULL rows are untouched)
--   - does NOT create semester records
--   - does NOT modify RLS on any table
--   - does NOT modify existing foreign keys (including the
--     subjects_semester_owner_fk / activities_semester_owner_fk /
--     notes_semester_owner_fk / grades_semester_owner_fk composite FKs,
--     and the existing subject_id -> subjects.id ON DELETE CASCADE
--     relationships, all from the Stage 3 migration)
--   - does NOT modify any existing index
--   - does NOT modify any table's columns
--   - does NOT add any child-consistency (subject/child semester match)
--     trigger — that is explicitly out of scope for this stage
--   - does NOT add any bypass/move mechanism — that is explicitly
--     deferred to a future, separate, deliberate feature
-- =========================================================

-- ---------------------------------------------------------
-- One reusable trigger function for all four academic tables.
--
-- The WHEN clause on each trigger (below) already ensures this
-- function is only ever invoked when OLD.semester_id IS DISTINCT FROM
-- NEW.semester_id, so the function itself does not need to repeat
-- that check — by the time it runs, a real change is always in
-- progress and must always be rejected.
--
-- LANGUAGE plpgsql, no SECURITY DEFINER: this function only ever
-- inspects the row values already visible to the triggering
-- statement and unconditionally raises — it needs no elevated
-- privilege beyond the default SECURITY INVOKER behavior, and RLS on
-- the underlying table already governs whether the UPDATE itself was
-- allowed to reach this point at all.
-- ---------------------------------------------------------
create or replace function public.reject_academic_semester_id_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'semester_id is immutable after creation and cannot be changed by an ordinary update.';
end;
$$;

-- ---------------------------------------------------------
-- subjects
-- ---------------------------------------------------------
drop trigger if exists subjects_semester_id_immutable on public.subjects;

create trigger subjects_semester_id_immutable
  before update of semester_id on public.subjects
  for each row
  when (old.semester_id is distinct from new.semester_id)
  execute function public.reject_academic_semester_id_change();

-- ---------------------------------------------------------
-- activities
-- ---------------------------------------------------------
drop trigger if exists activities_semester_id_immutable on public.activities;

create trigger activities_semester_id_immutable
  before update of semester_id on public.activities
  for each row
  when (old.semester_id is distinct from new.semester_id)
  execute function public.reject_academic_semester_id_change();

-- ---------------------------------------------------------
-- notes
-- ---------------------------------------------------------
drop trigger if exists notes_semester_id_immutable on public.notes;

create trigger notes_semester_id_immutable
  before update of semester_id on public.notes
  for each row
  when (old.semester_id is distinct from new.semester_id)
  execute function public.reject_academic_semester_id_change();

-- ---------------------------------------------------------
-- grades
-- ---------------------------------------------------------
drop trigger if exists grades_semester_id_immutable on public.grades;

create trigger grades_semester_id_immutable
  before update of semester_id on public.grades
  for each row
  when (old.semester_id is distinct from new.semester_id)
  execute function public.reject_academic_semester_id_change();
