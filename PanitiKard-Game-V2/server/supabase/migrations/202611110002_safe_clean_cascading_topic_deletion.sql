-- ==============================================================================
-- Migration: 202611110002_safe_clean_cascading_topic_deletion.sql
-- Phase: 6.9+ Option 2 — Safe Clean Cascading Topic Deletion
--
-- Objective:
--   1. Provide an atomic stored procedure (delete_topic_permanent_cascade) for
--      permanently deleting eligible Draft or Archived Topics and their eligible
--      child Questions, Question Versions, Choices, and Rubrics in one ACID transaction.
--   2. Enforce strict authorization: authenticated Teacher or Admin only.
--   3. Strictly protect historical gameplay and student evaluation records:
--      - Rejects published topics (must archive first).
--      - Rejects topics with any game_sessions.
--      - Rejects topics containing any published child questions.
--      - Rejects topics if any child question or version has student_answers or ai_evaluations.
--   4. Implement deterministic row-level locking (topic -> questions -> versions)
--      to eliminate race conditions and prevent deadlocks.
--   5. Delete dependencies in verified reverse-topological order:
--      choices -> rubrics -> versions -> questions -> topics.
--   6. Roll back the entire transaction if any check or deletion step fails.
--   7. Return the exact count of deleted questions from the database.
--
-- Note: Do NOT execute this migration on production without separate approval.
-- ==============================================================================

begin;

-- Verify prerequisite tables exist
do $preflight_cascade$
begin
  if to_regclass('public.topics') is null or
     to_regclass('public.questions') is null or
     to_regclass('public.question_versions') is null or
     to_regclass('public.question_choices') is null or
     to_regclass('public.question_evaluation_rubrics') is null or
     to_regclass('public.game_sessions') is null or
     to_regclass('public.student_answers') is null or
     to_regclass('public.ai_evaluations') is null then
    raise exception 'Cascading topic deletion migration requires topics, questions, question_versions, question_choices, question_evaluation_rubrics, game_sessions, student_answers, and ai_evaluations tables.';
  end if;
end;
$preflight_cascade$;

create or replace function public.delete_topic_permanent_cascade(p_topic_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_topic record;
  v_question_ids uuid[];
  v_version_ids uuid[];
  v_question_count integer := 0;
  v_published_count integer := 0;
  v_answers_count integer := 0;
  v_evals_count integer := 0;
  v_sessions_count integer := 0;
begin
  -- 1. Authorization: Verify caller is an authenticated staff member (Teacher or Admin)
  if auth.uid() is null or public.is_teacher_or_admin() is not true then
    raise exception 'Teacher or administrator permission required'
      using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  -- 2. Deterministic Row Locking: Parent Topic
  select id, code, title, status into v_topic
  from public.topics
  where code = p_topic_code
  for update;

  if not found then
    raise exception 'Topic not found'
      using errcode = 'P0002', detail = 'TOPIC_NOT_FOUND';
  end if;

  -- 3. Topic Status Invariant: Published topics must be archived first
  if v_topic.status = 'published' then
    raise exception 'Published topics cannot be permanently deleted. Archive the topic first.'
      using errcode = '22023', detail = 'CANNOT_DELETE_ACTIVE_TOPIC';
  end if;

  if v_topic.status not in ('draft', 'archived') then
    raise exception 'Only unreferenced draft or archived topics can be permanently deleted.'
      using errcode = '22023', detail = 'CANNOT_DELETE_NON_DRAFT';
  end if;

  -- 4. Historical Session Dependency: Reject if topic has any game sessions
  select count(*) into v_sessions_count
  from public.game_sessions
  where topic_id = v_topic.id;

  if v_sessions_count > 0 then
    raise exception 'Cannot permanently delete topic with historical gameplay sessions.'
      using errcode = '23503', detail = 'TOPIC_HAS_SESSIONS';
  end if;

  -- 5. Deterministic Row Locking: Child Questions (ordered by id to prevent deadlocks)
  perform 1
  from public.questions
  where topic_id = v_topic.id
  order by id
  for update;

  -- 6. Collect Question IDs and Count (clean query without aggregate FOR UPDATE)
  select coalesce(array_agg(id order by id), array[]::uuid[]), count(*)
  into v_question_ids, v_question_count
  from public.questions
  where topic_id = v_topic.id;

  if v_question_count > 0 then
    -- 7. Deterministic Row Locking: Question Versions (ordered by id)
    perform 1
    from public.question_versions
    where question_id = any(v_question_ids)
    order by id
    for update;

    -- 8. Question Status Invariant: Reject if ANY child question is published
    select count(*) into v_published_count
    from public.questions
    where id = any(v_question_ids) and status = 'published';

    if v_published_count > 0 then
      raise exception 'Cannot delete topic containing published questions. Archive or unpublish them first.'
        using errcode = '22023', detail = 'TOPIC_HAS_PUBLISHED_QUESTIONS';
    end if;

    -- 9. Historical Student Answers: Check question_id AND question_version_id
    select count(*) into v_answers_count
    from public.student_answers
    where question_id = any(v_question_ids)
       or question_version_id in (
         select id from public.question_versions where question_id = any(v_question_ids)
       );

    if v_answers_count > 0 then
      raise exception 'Cannot permanently delete topic because its questions contain historical student answers. Archive it instead.'
        using errcode = '23503', detail = 'TOPIC_QUESTIONS_HAVE_ANSWERS';
    end if;

    -- 10. Historical AI Evaluations: Check question_id AND question_version_id
    select count(*) into v_evals_count
    from public.ai_evaluations
    where question_id = any(v_question_ids)
       or question_version_id in (
         select id from public.question_versions where question_id = any(v_question_ids)
       );

    if v_evals_count > 0 then
      raise exception 'Cannot permanently delete topic because its questions contain historical AI evaluations. Archive it instead.'
        using errcode = '23503', detail = 'TOPIC_QUESTIONS_HAVE_EVALUATIONS';
    end if;

    -- 11. Collect Version IDs for Reverse-Dependency Cascade
    select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_version_ids
    from public.question_versions
    where question_id = any(v_question_ids);

    -- 12. Reverse Topological Deletion: Leaf tables first
    if array_length(v_version_ids, 1) > 0 then
      delete from public.question_choices
      where question_version_id = any(v_version_ids);

      delete from public.question_evaluation_rubrics
      where question_version_id = any(v_version_ids);

      delete from public.question_versions
      where id = any(v_version_ids);
    end if;

    delete from public.questions
    where id = any(v_question_ids);
  end if;

  -- 13. Delete Parent Topic Row
  delete from public.topics
  where id = v_topic.id;

  return jsonb_build_object(
    'success', true,
    'deletedCode', p_topic_code,
    'deletedQuestionsCount', v_question_count
  );
end;
$$;

-- Permissions: revoke public/anon execution, grant to authenticated only
revoke all on function public.delete_topic_permanent_cascade(text) from public, anon;
grant execute on function public.delete_topic_permanent_cascade(text) to authenticated;

commit;

