-- =========================================================
-- Phase 9D Stage 9D-2: Subject class schedule foundation
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED.
--
-- Purpose: add a new, purely additive public.subject_schedules table so
-- a subject can eventually have one or more recurring weekly class
-- sessions (one row per weekday, per Stage 9D-1's approved design) —
-- with zero changes to any existing table or existing data.
--
-- This migration is additive/behavioral only:
--   - does NOT modify subjects.schedule or subjects.room (the legacy
--     free-text fields) in any way — not renamed, not parsed, not
--     backfilled, not overwritten
--   - does NOT modify activities/notes/grades or their existing
--     columns, FKs, or RLS
--   - does NOT add semester_id anywhere on subject_schedules — a
--     schedule's semester context is always inherited transitively
--     through its parent subject, never stored redundantly
--   - does NOT modify the semester immutability triggers from prior
--     migrations
--   - does NOT modify RLS on any existing table
--   - does NOT modify profiles, pro_orders, or any PayMongo-related table
--   - does NOT backfill or generate any subject_schedules rows — every
--     existing subject has zero schedules until a student explicitly
--     adds one in a later stage
-- =========================================================

-- ---------------------------------------------------------
-- Prerequisite: public.subjects needs a UNIQUE (user_id, id) constraint
-- so subject_schedules can use a composite ownership FK against it —
-- the same pattern the Stage 3 semesters migration already established
-- for semesters(user_id, id). subjects.id is already globally unique as
-- the primary key, so (user_id, id) can never violate uniqueness
-- against any existing row: this is guaranteed safe to add against
-- existing data, with no possibility of failing.
-- ---------------------------------------------------------
alter table public.subjects
  add constraint subjects_user_id_id_unique unique (user_id, id);

-- ---------------------------------------------------------
-- subject_schedules: one row = one weekday's recurring class session
-- for a subject. Multiple rows per subject represent multiple class
-- days (e.g. Monday + Wednesday + Friday = 3 rows) — per Stage 9D-1's
-- approved rationale for one-row-per-weekday over an array column.
--
-- day_of_week matches JavaScript's Date.getDay() exactly (0 = Sunday
-- ... 6 = Saturday), so the future frontend never needs a translation
-- table between the two.
--
-- start_time/end_time are PostgreSQL TIME WITHOUT TIME ZONE — plain
-- local wall-clock values, deliberately never converted to/through UTC,
-- consistent with how activity deadlines are already treated as local
-- calendar values elsewhere in this schema. Overnight classes (end_time
-- earlier than start_time) are not supported in v1, enforced by the
-- start_time < end_time CHECK below.
--
-- reminder_minutes is constrained to the five v1 reminder choices (at
-- class time / 5 / 15 / 30 / 60 minutes before). notifications_enabled
-- is a per-schedule on/off toggle. Neither is acted on by any code in
-- this stage — this migration only stores the values for a later stage
-- to read; no notification/reminder logic is implemented here.
-- ---------------------------------------------------------
create table if not exists public.subject_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  location text,
  reminder_minutes smallint not null default 15,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint subject_schedules_day_of_week_valid check (day_of_week between 0 and 6),
  constraint subject_schedules_time_order check (start_time < end_time),
  constraint subject_schedules_reminder_minutes_valid check (reminder_minutes in (0, 5, 15, 30, 60)),
  -- Composite ownership FK: guarantees at the database level that a
  -- schedule's user_id can never disagree with its subject's actual
  -- owner — the same defense-in-depth pattern the semesters/activities/
  -- notes/grades composite ownership FKs already use. This is also what
  -- makes it structurally impossible for one user to attach a schedule
  -- to another user's subject, independent of RLS or any frontend
  -- check. This single composite FK also already guarantees subject_id
  -- references a real subjects.id row, so no separate/redundant plain
  -- FK on subject_id alone is added.
  constraint subject_schedules_subject_owner_fk
    foreign key (user_id, subject_id) references public.subjects (user_id, id)
    on delete cascade
);

-- ---------------------------------------------------------
-- Tenant-aware composite index — RLS already filters every query by
-- user_id, so (user_id, subject_id) directly serves the real access
-- pattern ("my schedules for my subject"), matching the identical
-- indexing pattern already used on subjects/activities/notes/grades.
-- ---------------------------------------------------------
create index if not exists subject_schedules_user_id_subject_id_idx
  on public.subject_schedules (user_id, subject_id);

-- ---------------------------------------------------------
-- RLS — authenticated users only, strictly scoped to their own rows.
-- The composite ownership FK above is an additional, independent
-- database-level guarantee that user_id can never disagree with the
-- real owner of subject_id; RLS alone is not relied on for that.
-- ---------------------------------------------------------
alter table public.subject_schedules enable row level security;

create policy "subject_schedules_select_own"
  on public.subject_schedules for select
  to authenticated
  using (auth.uid() = user_id);

create policy "subject_schedules_insert_own"
  on public.subject_schedules for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "subject_schedules_update_own"
  on public.subject_schedules for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "subject_schedules_delete_own"
  on public.subject_schedules for delete
  to authenticated
  using (auth.uid() = user_id);
