-- =========================================================
-- Phase 9C Stage 9C-2: Recurring activity data foundation (dormant)
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED.
--
-- Purpose: add the minimum nullable columns needed to eventually group
-- multiple public.activities rows ("materialized occurrences") into a
-- recurring series, with zero behavioral change to any existing row.
-- Recurrence GENERATION does not exist yet — this migration only adds
-- dormant plumbing that the frontend does not populate in this stage.
--
-- This migration is additive/behavioral only:
--   - does NOT backfill recurrence_series_id or recurrence_rule on any
--     existing row (both remain NULL for every pre-existing activity)
--   - does NOT create a recurrence-series table
--   - does NOT create an occurrence table
--   - does NOT add a foreign key for recurrence_series_id — it is a
--     plain grouping identifier, not a relationship to another row/table
--   - does NOT add a parent/child activity relationship of any kind
--   - does NOT modify semester_id, the semester ownership FKs, or the
--     semester_id immutability triggers from prior migrations
--   - does NOT modify RLS on any table
--   - does NOT modify any existing column, index, or constraint
--   - does NOT modify profiles, pro_orders, or any PayMongo-related table
-- =========================================================

-- ---------------------------------------------------------
-- Dormant recurrence metadata on public.activities.
--
-- recurrence_series_id: groups occurrences created from the same
-- recurring submission. NULL for every non-recurring activity,
-- including every row that exists today. No FK — it is deliberately
-- just a grouping tag, since there is no separate series row to
-- reference and no series table is being introduced.
--
-- recurrence_rule: which repeat pattern generated this occurrence.
-- NULL for every non-recurring activity. The CHECK constraint allows
-- NULL (the default, and the only valid value for non-recurring rows)
-- or one of the four v1 rule values. "none" is deliberately not a
-- stored value — non-recurring is represented by NULL, not a string.
-- ---------------------------------------------------------
alter table public.activities add column if not exists recurrence_series_id uuid;
alter table public.activities add column if not exists recurrence_rule text;

alter table public.activities
  add constraint activities_recurrence_rule_valid
  check (
    recurrence_rule is null
    or recurrence_rule in ('daily', 'weekdays', 'weekends', 'weekly')
  );
