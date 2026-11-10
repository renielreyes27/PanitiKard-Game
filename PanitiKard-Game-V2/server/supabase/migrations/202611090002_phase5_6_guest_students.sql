-- ==============================================================================
-- PanitiKard V2 — Phase 5.6: Guest Student Gameplay & Authoritative Evaluation
-- ==============================================================================
--
-- STATUS: UNAPPLIED (Do not execute directly against production Supabase without authorization)
--
-- Architecture:
-- 1. Permits guest students (who do NOT have login credentials or student accounts)
--    to play PanitiKard V2 and persist sessions, Gemini semantic evaluations, and
--    authoritative scores.
-- 2. Makes `student_id` nullable in `game_sessions`, `student_answers`, and `ai_evaluations`.
-- 3. Retains the existing `student_name_snapshot` column on `game_sessions` to store
--    the student's full name as entered at Step 1.
-- 4. Provides backend-authorized RPCs:
--    - `create_guest_game_session(p_topic_code, p_mode, p_student_name)`
--    - `start_guest_question_timer(p_session_id, p_question_code, p_round)`
--    - `submit_guest_game_answer(p_session_id, p_question_code, p_round, p_response, p_is_timeout)`
--    - `finish_guest_game_session(p_session_id)`
-- 5. Revokes all execution privileges on guest RPCs from PUBLIC, anon, and authenticated;
--    grants execute exclusively to `service_role`.
--    The backend Express server verifies the cryptographic guest session token before
--    invoking these RPCs via its service-role client.
-- 6. Enforces atomic duplicate answer prevention, server-authoritative timeout validation
--    using trusted server-side timestamps in `game_sessions.metadata`, and hardened
--    Reverse Round rules (max 3 attempts, missed-only eligibility, no duplicates).
-- ==============================================================================

begin;

-- Preflight check: Ensure prerequisite Phase 4 and Phase 5 tables exist
do $migration_preflight$
begin
  if to_regclass('public.game_sessions') is null then
    raise exception 'PanitiKard Phase 5.6 migration requires the public.game_sessions table from Phase 4.';
  end if;
  if to_regclass('public.student_answers') is null then
    raise exception 'PanitiKard Phase 5.6 migration requires the public.student_answers table from Phase 4.';
  end if;
  if to_regclass('public.ai_evaluations') is null then
    raise exception 'PanitiKard Phase 5.6 migration requires the public.ai_evaluations table from Phase 5.1.';
  end if;
  if to_regclass('public.questions') is null then
    raise exception 'PanitiKard Phase 5.6 migration requires the public.questions table from Phase 4.';
  end if;
  if to_regclass('public.question_versions') is null then
    raise exception 'PanitiKard Phase 5.6 migration requires the public.question_versions table from Phase 4.';
  end if;
end;
$migration_preflight$;

-- 1. Make student_id nullable on gameplay tables
alter table public.game_sessions
  alter column student_id drop not null;

alter table public.student_answers
  alter column student_id drop not null;

alter table public.ai_evaluations
  alter column student_id drop not null;

-- 2. Guest Session Creation RPC
-- Callable exclusively by trusted service-role backend on behalf of an unauthenticated student.
create or replace function public.create_guest_game_session(
  p_topic_code text,
  p_mode public.game_mode,
  p_student_name text
)
returns public.game_sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_topic public.topics%rowtype;
  v_session public.game_sessions%rowtype;
  v_versions jsonb;
  v_clean_name text;
begin
  v_clean_name := left(trim(coalesce(p_student_name, '')), 120);
  if length(v_clean_name) < 2 then
    raise exception 'A valid student name (at least 2 characters) is required' using errcode = '22023';
  end if;

  select * into v_topic from public.topics
   where code = p_topic_code and status = 'published' and archived_at is null;
  if not found then
    raise exception 'Published topic not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_object_agg(q.code, v.id), '{}'::jsonb) into v_versions
    from public.questions q join public.question_versions v
      on v.question_id = q.id and v.version_number = q.current_version
   where q.topic_id = v_topic.id and q.status = 'published' and q.archived_at is null
     and ((p_mode = 'deck' and q.card_category_id is not null)
       or (p_mode = 'quiz' and q.card_category_id is null));

  if v_versions = '{}'::jsonb then
    raise exception 'Topic has no published questions for this mode' using errcode = 'P0002';
  end if;

  insert into public.game_sessions (
    student_id, topic_id, mode, student_name_snapshot, question_versions, status
  ) values (
    null, v_topic.id, p_mode, v_clean_name, v_versions, 'active'
  )
  returning * into v_session;

  return v_session;
end;
$$;

-- 2b. Guest Question Timer Activation RPC
-- Records trusted server-side start timestamp in game_sessions.metadata
create or replace function public.start_guest_question_timer(
  p_session_id uuid,
  p_question_code text,
  p_round public.game_round default 'main'
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.game_sessions%rowtype;
  v_question public.questions%rowtype;
  v_version public.question_versions%rowtype;
  v_snapshot_version_id uuid;
  v_timer_key text;
  v_now timestamptz := now();
  v_metadata jsonb;
  v_existing_start text;
begin
  select * into v_session from public.game_sessions
   where id = p_session_id and student_id is null for update;
  if not found or v_session.status <> 'active' then
    raise exception 'Active guest game session not found' using errcode = 'P0002';
  end if;

  v_snapshot_version_id := (v_session.question_versions ->> p_question_code)::uuid;
  if v_snapshot_version_id is null then
    raise exception 'Question is not part of this session snapshot' using errcode = 'P0002';
  end if;

  select q.* into v_question
    from public.questions q join public.topics t on t.id = q.topic_id
   where q.code = p_question_code and q.topic_id = v_session.topic_id;
  if not found then
    raise exception 'Published question not found' using errcode = 'P0002';
  end if;

  select * into v_version from public.question_versions
   where question_id = v_question.id and id = v_snapshot_version_id;
  if not found then
    raise exception 'Current question version not found' using errcode = 'P0002';
  end if;

  if v_version.time_limit_seconds is null or v_version.time_limit_seconds <= 0 then
    raise exception 'Question does not have a time limit' using errcode = '22023';
  end if;

  v_timer_key := p_round || ':' || p_question_code;
  v_metadata := coalesce(v_session.metadata, '{}'::jsonb);
  if jsonb_typeof(v_metadata -> 'question_timers') is distinct from 'object' then
    v_metadata := jsonb_set(v_metadata, '{question_timers}', '{}'::jsonb, true);
  end if;

  v_existing_start := v_metadata -> 'question_timers' ->> v_timer_key;
  if v_existing_start is null then
    v_metadata := jsonb_set(
      v_metadata,
      array['question_timers', v_timer_key],
      to_jsonb(v_now::text),
      true
    );
    update public.game_sessions
       set metadata = v_metadata
     where id = p_session_id;
    v_existing_start := v_now::text;
  end if;

  return jsonb_build_object(
    'sessionId', p_session_id,
    'questionCode', p_question_code,
    'round', p_round,
    'startedAt', v_existing_start,
    'timeLimitSeconds', v_version.time_limit_seconds
  );
end;
$$;

-- 3. Guest Answer Submission & Authoritative Scoring RPC
-- Executes exact rubric validation, server-authoritative timeout validation, and updates session scores atomically.
create or replace function public.submit_guest_game_answer(
  p_session_id uuid,
  p_question_code text,
  p_round public.game_round,
  p_response text,
  p_is_timeout boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.game_sessions%rowtype;
  v_question public.questions%rowtype;
  v_version public.question_versions%rowtype;
  v_rubric public.question_evaluation_rubrics%rowtype;
  v_answer public.student_answers%rowtype;
  v_correct boolean := false;
  v_method text := 'local_rubric';
  v_points smallint := 0;
  v_max_points smallint := 0;
  v_correct_display text;
  v_student_norm text;
  v_expected_norm text;
  v_group jsonb;
  v_term text;
  v_group_match boolean;
  v_group_count integer := 0;
  v_matched_count integer := 0;
  v_reverse_count integer;
  v_words integer;
  v_snapshot_version_id uuid;
  v_is_timeout boolean := coalesce(p_is_timeout, false);
  v_timer_key text;
  v_timer_start_str text;
  v_timer_start timestamptz;
  v_elapsed_seconds numeric;
begin
  if length(coalesce(p_response, '')) > 4000 or
     (not v_is_timeout and length(trim(coalesce(p_response, ''))) = 0) then
    raise exception 'Answer must contain 1 to 4000 characters unless this is a timeout' using errcode = '22023';
  end if;

  select * into v_session from public.game_sessions
   where id = p_session_id and student_id is null for update;
  if not found or v_session.status <> 'active' then
    raise exception 'Active guest game session not found' using errcode = 'P0002';
  end if;

  v_snapshot_version_id := (v_session.question_versions ->> p_question_code)::uuid;
  if v_snapshot_version_id is null then
    raise exception 'Question is not part of this session snapshot' using errcode = 'P0002';
  end if;

  select q.* into v_question
    from public.questions q join public.topics t on t.id = q.topic_id
   where q.code = p_question_code and q.topic_id = v_session.topic_id
     and t.id = v_session.topic_id;
  if not found then
    raise exception 'Published question not found' using errcode = 'P0002';
  end if;

  select * into v_version from public.question_versions
   where question_id = v_question.id and id = v_snapshot_version_id;
  if not found then
    raise exception 'Current question version not found' using errcode = 'P0002';
  end if;

  -- 1. Atomic duplicate-answer prevention for the same session, question, and round
  if exists (
    select 1 from public.student_answers
     where session_id = p_session_id
       and question_id = v_question.id
       and round = p_round
  ) then
    raise exception 'An answer for this question and round has already been recorded' using errcode = '23505';
  end if;

  -- 2. Server-authoritative timer validation for timed questions.
  -- Rules apply to ALL submissions (normal and timeout) for questions with a time limit:
  --   a) p_is_timeout = true is only valid if the question has a positive time limit.
  --   b) Any submission (normal or timeout) for a timed question requires a server-recorded timer.
  --   c) A timeout is accepted only after the full time limit has elapsed (server clock).
  --   d) A normal answer is accepted only before the time limit has elapsed (server clock).
  --   e) Untimed questions reject timeout submissions; normal answers are always accepted.
  -- Client-supplied timestamps or elapsed-time values are never trusted.
  if v_version.time_limit_seconds is not null and v_version.time_limit_seconds > 0 then
    -- Timed question: timer must exist and answer must arrive within/after the limit.
    v_timer_key := p_round || ':' || p_question_code;
    v_timer_start_str := v_session.metadata -> 'question_timers' ->> v_timer_key;

    if v_is_timeout then
      -- Timeout requires a started timer and full elapsed time.
      if v_timer_start_str is null then
        raise exception 'Question timer has not been started' using errcode = '22023';
      end if;
      v_timer_start := v_timer_start_str::timestamptz;
      v_elapsed_seconds := extract(epoch from (now() - v_timer_start));
      if v_elapsed_seconds < v_version.time_limit_seconds then
        raise exception 'Premature timeout submission: time limit has not elapsed' using errcode = '22023';
      end if;
    else
      -- Normal answer: timer must exist (proves the question was opened properly).
      -- Answer must arrive before the deadline; after the deadline only timeout is valid.
      if v_timer_start_str is null then
        raise exception 'Question timer has not been started' using errcode = '22023';
      end if;
      v_timer_start := v_timer_start_str::timestamptz;
      v_elapsed_seconds := extract(epoch from (now() - v_timer_start));
      if v_elapsed_seconds >= v_version.time_limit_seconds then
        raise exception 'Time limit has elapsed; submit as a timeout instead' using errcode = '22023';
      end if;
    end if;
  else
    -- Untimed question: timeout submission is not permitted.
    if v_is_timeout then
      raise exception 'Timeout is only permitted on timed questions' using errcode = '22023';
    end if;
  end if;

  v_max_points := case when p_round = 'reverse' and v_version.points = 0 then 1 else v_version.points end;

  select * into v_rubric from public.question_evaluation_rubrics
   where question_version_id = v_version.id;
  if not found then
    raise exception 'Question rubric is not configured' using errcode = 'P0002';
  end if;

  -- 3. Hardened Reverse Round validation
  if p_round = 'reverse' then
    select count(*) into v_reverse_count from public.student_answers
     where session_id = p_session_id and round = 'reverse';
    if v_reverse_count >= 3 then
      raise exception 'Reverse Round attempt limit reached' using errcode = '23514';
    end if;
    if not exists (select 1 from public.student_answers
      where session_id = p_session_id and question_id = v_question.id and round = 'main' and is_correct = false) then
      raise exception 'Reverse Round accepts only questions missed in the main round' using errcode = '23514';
    end if;
  end if;

  v_student_norm := lower(translate(regexp_replace(trim(coalesce(p_response, '')), '[^[:alnum:]]+', ' ', 'g'),
    'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU'));
  v_expected_norm := lower(translate(regexp_replace(trim(coalesce(v_rubric.expected_answer, '')), '[^[:alnum:]]+', ' ', 'g'),
    'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU'));
  v_words := case when trim(v_student_norm) = '' then 0 else cardinality(regexp_split_to_array(trim(v_student_norm), '\s+')) end;

  if not v_is_timeout then
    if v_version.question_type = 'multiple_choice' then
      v_correct := lower(trim(p_response)) = lower(trim(coalesce(v_rubric.answer_key, '')));
      v_method := 'answer_key';
      select coalesce(c.option_key || '. ' || c.label, v_rubric.answer_key) into v_correct_display
        from (select 1) seed left join public.question_choices c
          on c.question_version_id = v_version.id and c.option_key = v_rubric.answer_key;
    elsif v_version.question_type = 'true_false' then
      v_correct := lower(trim(p_response)) = lower(trim(coalesce(v_rubric.answer_key, '')))
        or exists (select 1 from jsonb_array_elements_text(v_rubric.accepted_answers) a(value)
          where lower(trim(a.value)) = lower(trim(p_response)));
      v_method := 'answer_key';
      v_correct_display := coalesce(v_rubric.answer_key, v_rubric.expected_answer);
    else
      v_correct_display := coalesce(v_rubric.expected_answer, v_rubric.answer_key);
      v_correct := (v_expected_norm <> '' and v_student_norm = v_expected_norm)
        or exists (select 1 from jsonb_array_elements_text(v_rubric.accepted_answers) a(value)
          where lower(translate(regexp_replace(trim(a.value), '[^[:alnum:]]+', ' ', 'g'),
            'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU')) = v_student_norm);

      for v_group in select value from jsonb_array_elements(v_rubric.rubric_groups) loop
        v_group_count := v_group_count + 1;
        v_group_match := false;
        for v_term in select value from jsonb_array_elements_text(v_group) loop
          if position(' ' || trim(lower(translate(regexp_replace(trim(v_term), '[^[:alnum:]]+', ' ', 'g'),
            'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU'))) || ' ' in ' ' || v_student_norm || ' ') > 0 then
            v_group_match := true;
            exit;
          end if;
        end loop;
        if v_group_match then v_matched_count := v_matched_count + 1; end if;
      end loop;
      if not v_correct then
        v_correct := v_group_count > 0 and v_words >= 3 and v_matched_count = v_group_count;
      end if;
    end if;
  else
    v_correct := false;
    v_points := 0;
    v_correct_display := coalesce(v_rubric.expected_answer, v_rubric.answer_key);
  end if;

  if v_correct then v_points := v_max_points; end if;

  insert into public.student_answers (
    session_id, student_id, question_id, question_version_id, round, response,
    is_correct, points_awarded, max_points, evaluation_method, evaluation_record
  ) values (
    p_session_id, null, v_question.id, v_version.id, p_round, to_jsonb(coalesce(trim(p_response), '')),
    v_correct, v_points, v_max_points, case when v_is_timeout then 'timeout' else v_method end,
    jsonb_build_object('evaluationMethod', case when v_is_timeout then 'timeout' else v_method end,
      'timedOut', v_is_timeout, 'questionVersionId', v_version.id, 'correctAnswer', v_correct_display)
  ) returning * into v_answer;

  if p_round = 'reverse' then
    update public.game_sessions set reverse_score = reverse_score + v_points where id = p_session_id;
  else
    update public.game_sessions set main_score = main_score + v_points where id = p_session_id;
  end if;

  return jsonb_build_object(
    'answer', jsonb_build_object(
      'id', v_answer.id,
      'questionId', v_answer.question_id,
      'round', v_answer.round,
      'isCorrect', v_answer.is_correct,
      'pointsAwarded', v_answer.points_awarded,
      'maxPoints', v_answer.max_points,
      'evaluationMethod', v_answer.evaluation_method,
      'answeredAt', v_answer.answered_at
    ),
    'isCorrect', v_correct,
    'pointsAwarded', v_points,
    'maxPoints', v_max_points,
    'evaluationMethod', case when v_is_timeout then 'timeout' else v_method end,
    'correctAnswer', v_correct_display
  );
end;
$$;

-- 4. Guest Session Completion RPC
create or replace function public.finish_guest_game_session(p_session_id uuid)
returns public.game_sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.game_sessions%rowtype;
begin
  update public.game_sessions
     set status = 'completed', completed_at = now()
   where id = p_session_id and student_id is null and status = 'active'
   returning * into v_session;

  if not found then
    raise exception 'Active guest game session not found' using errcode = 'P0002';
  end if;

  return v_session;
end;
$$;

-- 5. Permission grants
-- Explicitly revoke guest RPC execution from PUBLIC, anon, and authenticated; grant only to service_role.
revoke all on function public.create_guest_game_session(text, public.game_mode, text) from public, anon, authenticated;
grant execute on function public.create_guest_game_session(text, public.game_mode, text) to service_role;

revoke all on function public.start_guest_question_timer(uuid, text, public.game_round) from public, anon, authenticated;
grant execute on function public.start_guest_question_timer(uuid, text, public.game_round) to service_role;

revoke all on function public.submit_guest_game_answer(uuid, text, public.game_round, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_guest_game_answer(uuid, text, public.game_round, text, boolean) to service_role;

revoke all on function public.finish_guest_game_session(uuid) from public, anon, authenticated;
grant execute on function public.finish_guest_game_session(uuid) to service_role;

-- 6. Performance indexes for guest lookups and dashboard queries
create index if not exists game_sessions_guest_started_idx
  on public.game_sessions (started_at desc)
  where student_id is null;

create index if not exists student_answers_guest_idx
  on public.student_answers (session_id, answered_at)
  where student_id is null;

commit;
