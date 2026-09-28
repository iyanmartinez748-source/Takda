-- =========================================================
-- Phase 9E Stage 9E-4C-2: finalize RPC privilege hardening
-- (records a manual Production correction)
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED / NOT APPLIED.
--
-- Purpose: Production verification found that anon and authenticated
-- both had direct EXECUTE grants on the two finalize RPCs introduced
-- by 20260926000000_reminder_delivery_claim_token.sql, despite that
-- migration's own `revoke all on function ... from public;` — because
-- REVOKE ... FROM PUBLIC only removes the ACL entry for the PUBLIC
-- pseudo-role; it does not remove a separate, direct grant already
-- held by a specific role. Supabase configures default privileges so
-- that newly created functions in the public schema are automatically
-- granted to anon/authenticated in addition to PUBLIC, so revoking
-- from PUBLIC alone was insufficient here.
--
-- Production has already been manually corrected and independently
-- verified (anon = false, authenticated = false, service_role = true,
-- for both functions). This migration exists solely to record that
-- correction in repository history so a future fresh deploy/reset
-- reaches the same, already-verified end state — it does not itself
-- get applied against Production as part of this step.
--
-- This migration is additive/behavioral only:
--   - does NOT modify 20260926000000_reminder_delivery_claim_token.sql
--     or any other existing migration
--   - does NOT alter either function's definition, parameters, return
--     type, language, SECURITY INVOKER setting, or search_path
--   - does NOT touch service_role's EXECUTE grant on either function
--   - does NOT touch reminder_deliveries' columns, constraints, index,
--     or RLS (still enabled, zero policies)
--   - does NOT modify push_subscriptions, any academic table, profiles,
--     pro_orders, or any PayMongo-related table
--   - does NOT create or modify any cron job, scheduled function, or
--     vercel.json
--   - does NOT send, queue, or compute any reminder
-- =========================================================

revoke execute on function public.finalize_reminder_delivery_success(uuid, text, uuid)
from anon, authenticated;

revoke execute on function public.finalize_reminder_delivery_failure(uuid, text, uuid, text, int)
from anon, authenticated;
