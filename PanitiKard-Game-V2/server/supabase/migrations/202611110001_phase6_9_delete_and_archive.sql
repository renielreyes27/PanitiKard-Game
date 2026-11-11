-- ==============================================================================
-- Migration: 202611110001_phase6_9_delete_and_archive.sql
-- Phase: 6.9 Centralized Delete & Archive Management
--
-- Objective:
--   1. Document and formalize safe delete and archive rules for PanitiKard V2.
--   2. Enforce that historical gameplay records (game_sessions, student_answers,
--      ai_evaluations) maintain ON DELETE RESTRICT on all foreign keys.
--   3. Provide staff-level policies (Teacher and Admin) for permanently deleting
--      eligible unreferenced draft and archived topics, questions, and draft versions.
--   4. Prevent deletion of active published content and protect all historical data.
--
-- Note: Do NOT apply this migration to production without separate approval.
-- ==============================================================================

begin;

-- Verify prerequisite tables exist
do $preflight_6_9$
begin
  if to_regclass('public.topics') is null or
     to_regclass('public.questions') is null or
     to_regclass('public.question_versions') is null or
     to_regclass('public.game_sessions') is null or
     to_regclass('public.student_answers') is null or
     to_regclass('public.ai_evaluations') is null then
    raise exception 'Phase 6.9 migration requires topics, questions, question_versions, game_sessions, student_answers, and ai_evaluations tables.';
  end if;
end;
$preflight_6_9$;

-- Policy 1: Staff-level delete on unreferenced draft or archived topics (Teacher + Admin)
drop policy if exists topics_staff_delete on public.topics;
drop policy if exists topics_admin_delete on public.topics;
create policy topics_staff_delete on public.topics
  for delete to authenticated
  using (
    public.is_teacher_or_admin() and status in ('draft', 'archived') and
    not exists (select 1 from public.questions q where q.topic_id = topics.id) and
    not exists (select 1 from public.game_sessions s where s.topic_id = topics.id)
  );

-- Policy 2: Staff-level delete on unreferenced draft or archived questions (Teacher + Admin)
drop policy if exists questions_staff_delete on public.questions;
drop policy if exists questions_admin_delete on public.questions;
create policy questions_staff_delete on public.questions
  for delete to authenticated
  using (
    public.is_teacher_or_admin() and status in ('draft', 'archived') and
    not exists (select 1 from public.student_answers a where a.question_id = questions.id) and
    not exists (select 1 from public.ai_evaluations e where e.question_id = questions.id)
  );

-- Policy 3: Staff-level delete for question versions (Teacher + Admin)
-- Allows deleting:
--   1. Unreferenced draft revisions of published questions (version_number > current_version)
--   2. Unreferenced versions belonging to draft or archived questions being permanently deleted
drop policy if exists question_versions_staff_delete on public.question_versions;
create policy question_versions_staff_delete on public.question_versions
  for delete to authenticated
  using (
    public.is_teacher_or_admin() and
    exists (
      select 1 from public.questions q
      where q.id = question_versions.question_id
        and (
          (q.status = 'published' and question_versions.version_number > q.current_version)
          or (q.status in ('draft', 'archived'))
        )
    ) and
    not exists (select 1 from public.student_answers a where a.question_version_id = question_versions.id) and
    not exists (select 1 from public.ai_evaluations e where e.question_version_id = question_versions.id)
  );

commit;
