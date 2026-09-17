-- =========================================================
-- Phase 8: Semester / Academic Term Management — foundation
--
-- DOCUMENTATION / VERSION CONTROL ONLY.
-- This schema was already applied manually to production
-- (Stage 1 + Stage 2) and verified. This file records what is
-- already live; it is not meant to be (re-)executed against
-- production as part of Stage 3.
--
-- Additive only. Does not modify subjects/activities/notes/grades
-- existing columns, existing FKs (incl. subject_id ON DELETE CASCADE),
-- existing RLS policies on those four tables, or any existing data.
-- No backfill, no UPDATE of existing rows, no DELETE, no DROP.
-- =========================================================

-- ---------------------------------------------------------
-- 1. semesters table
-- ---------------------------------------------------------
create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  school_year text,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint semesters_user_id_id_unique unique (user_id, id),
  constraint semesters_not_active_and_archived
    check (not (is_active and archived_at is not null)),
  constraint semesters_date_order
    check (start_date is null or end_date is null or start_date <= end_date)
);

-- ---------------------------------------------------------
-- 2. At most one active semester per user (DB-enforced, race-safe)
-- ---------------------------------------------------------
create unique index if not exists semesters_one_active_per_user
  on public.semesters (user_id)
  where is_active;

-- ---------------------------------------------------------
-- 3. RLS — new policy surface only. Existing academic-table RLS
--    (subjects/activities/notes/grades) is untouched by this file.
--    Intentionally NO DELETE policy: Phase 8 v1 is archive-only,
--    and omitting the policy makes deletion impossible at the
--    database level, not just unused by the application.
-- ---------------------------------------------------------
alter table public.semesters enable row level security;

create policy "semesters_select_own"
  on public.semesters for select
  to authenticated
  using (auth.uid() = user_id);

create policy "semesters_insert_own"
  on public.semesters for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "semesters_update_own"
  on public.semesters for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------
-- 4. Nullable semester_id + tenant-safe composite ownership FK on the
--    four existing academic tables. NULL is always valid (Postgres
--    MATCH SIMPLE skips FK evaluation when any referencing column is
--    NULL) -> zero backfill, existing rows unaffected.
--
--    ON DELETE intentionally omitted (defaults to NO ACTION/RESTRICT):
--    a semester referenced by any row cannot be hard-deleted. Phase 8
--    v1 has no delete UI, so this is inert until that ever ships.
--
--    Existing subject_id relationships
--    (activities/notes/grades.subject_id -> subjects.id ON DELETE CASCADE)
--    are separate, independent constraints and are not modified here.
-- ---------------------------------------------------------
alter table public.subjects   add column if not exists semester_id uuid;
alter table public.activities add column if not exists semester_id uuid;
alter table public.notes      add column if not exists semester_id uuid;
alter table public.grades     add column if not exists semester_id uuid;

alter table public.subjects
  add constraint subjects_semester_owner_fk
  foreign key (user_id, semester_id) references public.semesters (user_id, id);

alter table public.activities
  add constraint activities_semester_owner_fk
  foreign key (user_id, semester_id) references public.semesters (user_id, id);

alter table public.notes
  add constraint notes_semester_owner_fk
  foreign key (user_id, semester_id) references public.semesters (user_id, id);

alter table public.grades
  add constraint grades_semester_owner_fk
  foreign key (user_id, semester_id) references public.semesters (user_id, id);

-- ---------------------------------------------------------
-- 5. Tenant-aware composite indexes. RLS implicitly filters every
--    query by user_id, so (user_id, semester_id) directly serves the
--    real access pattern ("my rows in my active semester") better
--    than a standalone semester_id index would. Not redundant with
--    any existing index (all pre-existing indexes are single-column).
-- ---------------------------------------------------------
create index if not exists subjects_user_id_semester_id_idx
  on public.subjects (user_id, semester_id);

create index if not exists activities_user_id_semester_id_idx
  on public.activities (user_id, semester_id);

create index if not exists notes_user_id_semester_id_idx
  on public.notes (user_id, semester_id);

create index if not exists grades_user_id_semester_id_idx
  on public.grades (user_id, semester_id);
