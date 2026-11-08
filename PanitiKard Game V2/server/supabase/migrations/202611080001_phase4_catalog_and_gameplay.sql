-- PanitiKard V2 Phase 4 schema. Non-destructive: creates new objects and seeds only
-- the four stable topic codes and seven card categories. This migration is NOT applied
-- automatically; review and apply it explicitly in the intended Supabase project.

begin;

-- Fail before making changes if a named object already exists. This migration is a
-- first-install schema, not an idempotent upgrade for an existing PanitiKard schema.
do $migration_preflight$
declare
  conflicts text[] := array[]::text[];
  object_name text;
  target_tables text[] := array[
    'profiles', 'topics', 'card_categories', 'questions', 'question_versions',
    'question_evaluation_rubrics', 'question_choices', 'game_sessions', 'student_answers'
  ];
  target_types text[] := array[
    'profile_role', 'topic_status', 'question_status', 'game_mode', 'game_round',
    'game_session_status', 'question_type'
  ];
  target_functions text[] := array[
    'payload_contains_private_answer', 'current_profile_role', 'is_teacher_or_admin',
    'is_admin', 'set_updated_at', 'protect_profile_role', 'create_student_profile',
    'create_game_session', 'publish_question_version', 'submit_game_answer', 'finish_game_session'
  ];
  target_indexes text[] := array[
    'topics_status_idx', 'questions_topic_status_idx', 'question_versions_question_version_idx',
    'question_evaluation_version_idx', 'question_choices_version_order_idx',
    'game_sessions_student_started_idx', 'game_sessions_topic_status_idx',
    'student_answers_session_idx', 'student_answers_student_answered_idx'
  ];
  target_policies text[] := array[
    'profiles_read_self_or_staff', 'profiles_update_self_or_admin', 'topics_read_published',
    'topics_staff_insert', 'topics_staff_update', 'card_categories_read_all',
    'questions_read_published', 'questions_staff_insert', 'question_versions_read_visible',
    'question_versions_staff_insert', 'question_choices_read_visible',
    'question_choices_staff_insert', 'question_rubrics_staff_read',
    'question_rubrics_staff_insert', 'sessions_read_owner_or_staff', 'answers_read_owner_or_staff'
  ];
begin
  if to_regclass('auth.users') is null then
    raise exception 'PanitiKard Phase 4 migration requires the Supabase auth.users table.';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'PanitiKard Phase 4 migration requires Supabase anon, authenticated, and service_role roles.';
  end if;

  foreach object_name in array target_tables loop
    if exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = object_name
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
    ) then conflicts := array_append(conflicts, 'public relation ' || object_name); end if;
  end loop;

  foreach object_name in array target_types loop
    if exists (
      select 1 from pg_catalog.pg_type t
      join pg_catalog.pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = object_name
    ) then conflicts := array_append(conflicts, 'public type ' || object_name); end if;
  end loop;

  foreach object_name in array target_functions loop
    if exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = object_name
    ) then conflicts := array_append(conflicts, 'public function ' || object_name); end if;
  end loop;

  foreach object_name in array target_indexes loop
    if exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = object_name and c.relkind = 'i'
    ) then conflicts := array_append(conflicts, 'public index ' || object_name); end if;
  end loop;

  foreach object_name in array target_policies loop
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.policyname = object_name
    ) then conflicts := array_append(conflicts, 'public policy ' || object_name); end if;
  end loop;

  if to_regclass('auth.users') is not null and exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = to_regclass('auth.users') and not t.tgisinternal
      and t.tgname = 'auth_user_profile_created'
  ) then conflicts := array_append(conflicts, 'trigger auth_user_profile_created on auth.users'); end if;

  if cardinality(conflicts) > 0 then
    raise exception 'PanitiKard Phase 4 migration stopped before changes: existing objects found: %. Review/rename or prepare a dedicated upgrade migration.',
      array_to_string(conflicts, ', ');
  end if;
end;
$migration_preflight$;

create extension if not exists pgcrypto;

create type public.profile_role as enum ('student', 'teacher', 'admin');
create type public.topic_status as enum ('draft', 'published', 'archived');
create type public.question_status as enum ('draft', 'published', 'archived');
create type public.game_mode as enum ('deck', 'quiz');
create type public.game_round as enum ('main', 'reverse');
create type public.game_session_status as enum ('active', 'completed', 'abandoned');
create type public.question_type as enum (
  'multiple_choice', 'identification', 'true_false', 'fill_in_blank', 'situational', 'open_ended'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.profile_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 120)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null default '',
  competency text not null default '',
  status public.topic_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint topics_code_format check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  constraint topics_title_length check (char_length(title) between 1 and 200)
);

-- Topic is curriculum content; card category is the interaction style, kept separate.
create table public.card_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order smallint not null unique,
  created_at timestamptz not null default now(),
  constraint card_categories_code_check check (code in (
    'question', 'statement', 'correction', 'bonus', 'reverse', 'help', 'challenge'
  ))
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  topic_id uuid not null references public.topics(id) on delete restrict,
  card_category_id uuid references public.card_categories(id) on delete restrict,
  question_type public.question_type not null,
  status public.question_status not null default 'draft',
  current_version integer not null default 1 check (current_version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint questions_code_format check (code ~ '^[a-z0-9][a-z0-9-]{0,119}$')
);

create or replace function public.payload_contains_private_answer(p_value jsonb)
returns boolean
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare v_item record;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_item in select key, value from jsonb_each(p_value) loop
      if lower(v_item.key) in ('answer', 'answerkey', 'expectedanswer', 'acceptedanswers',
        'terms', 'rubricgroups', 'iscorrect', 'correctanswer') then return true; end if;
      if public.payload_contains_private_answer(v_item.value) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_item in select value from jsonb_array_elements(p_value) loop
      if public.payload_contains_private_answer(v_item.value) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

-- Immutable versions retain the exact scoring contract used by historical answers.
create table public.question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  question_type public.question_type not null,
  card_category_id uuid references public.card_categories(id) on delete restrict,
  title text not null default '',
  prompt text not null,
  explanation text not null default '',
  hint text,
  points smallint not null default 1 check (points between 0 and 100),
  time_limit_seconds smallint check (time_limit_seconds between 1 and 3600),
  difficulty text check (difficulty in ('easy', 'average', 'hard')),
  category_label text,
  tag text,
  version_digest text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (question_id, version_number),
  unique (question_id, id),
  constraint question_versions_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint question_versions_payload_no_answers check (not public.payload_contains_private_answer(payload))
);

-- Correct answers and rubrics are private so direct public PostgREST reads cannot spoil questions.
create table public.question_evaluation_rubrics (
  question_version_id uuid primary key references public.question_versions(id) on delete restrict,
  expected_answer text,
  answer_key text,
  accepted_answers jsonb not null default '[]'::jsonb,
  rubric_groups jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint evaluation_accepted_answers_array check (jsonb_typeof(accepted_answers) = 'array'),
  constraint evaluation_rubric_groups_array check (jsonb_typeof(rubric_groups) = 'array')
);

create table public.question_choices (
  id uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references public.question_versions(id) on delete restrict,
  option_key text not null,
  label text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (question_version_id, option_key),
  constraint question_choices_key_length check (char_length(option_key) between 1 and 24),
  constraint question_choices_label_length check (char_length(label) between 1 and 1000)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  topic_id uuid not null references public.topics(id) on delete restrict,
  mode public.game_mode not null,
  status public.game_session_status not null default 'active',
  student_name_snapshot text not null default '',
  question_versions jsonb not null default '{}'::jsonb,
  main_score integer not null default 0 check (main_score >= 0),
  reverse_score integer not null default 0 check (reverse_score >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint game_sessions_question_versions_object check (jsonb_typeof(question_versions) = 'object'),
  constraint game_sessions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.student_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete restrict,
  question_version_id uuid not null,
  round public.game_round not null default 'main',
  response jsonb not null,
  is_correct boolean not null,
  points_awarded smallint not null default 0 check (points_awarded >= 0),
  max_points smallint not null default 0 check (max_points >= 0),
  evaluation_method text not null,
  evaluation_record jsonb not null default '{}'::jsonb,
  answered_at timestamptz not null default now(),
  foreign key (question_id, question_version_id)
    references public.question_versions(question_id, id) on delete restrict,
  unique (session_id, question_id, round),
  constraint student_answers_response_object check (jsonb_typeof(response) in ('string', 'object', 'array', 'number', 'boolean')),
  constraint student_answers_evaluation_object check (jsonb_typeof(evaluation_record) = 'object'),
  constraint student_answers_points_consistency check (
    (is_correct and points_awarded <= max_points) or (not is_correct and points_awarded = 0)
  )
);

create index topics_status_idx on public.topics(status) where archived_at is null;
create index questions_topic_status_idx on public.questions(topic_id, status) where archived_at is null;
create index question_versions_question_version_idx on public.question_versions(question_id, version_number desc);
create index question_evaluation_version_idx on public.question_evaluation_rubrics(question_version_id);
create index question_choices_version_order_idx on public.question_choices(question_version_id, sort_order);
create index game_sessions_student_started_idx on public.game_sessions(student_id, started_at desc);
create index game_sessions_topic_status_idx on public.game_sessions(topic_id, status);
create index student_answers_session_idx on public.student_answers(session_id, answered_at);
create index student_answers_student_answered_idx on public.student_answers(student_id, answered_at desc);

create or replace function public.current_profile_role()
returns public.profile_role
language sql stable security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function public.is_teacher_or_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_profile_role() in ('teacher', 'admin'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_profile_role() = 'admin', false)
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Profile role is assigned by trusted provisioning/admin tooling, never by profile self-update.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and new.role is distinct from old.role then
    raise exception 'Profile roles cannot be changed by the profile owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.create_student_profile()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_profile_created
after insert on auth.users for each row execute function public.create_student_profile();
insert into public.profiles (id, display_name, role)
select u.id, left(coalesce(u.raw_user_meta_data ->> 'display_name', ''), 120), 'student'
from auth.users u
on conflict (id) do nothing;
create trigger profiles_role_protected before update on public.profiles
for each row execute function public.protect_profile_role();
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger topics_updated_at before update on public.topics
for each row execute function public.set_updated_at();
create trigger questions_updated_at before update on public.questions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.card_categories enable row level security;
alter table public.questions enable row level security;
alter table public.question_versions enable row level security;
alter table public.question_evaluation_rubrics enable row level security;
alter table public.question_choices enable row level security;
alter table public.game_sessions enable row level security;
alter table public.student_answers enable row level security;

create policy profiles_read_self_or_staff on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_teacher_or_admin()));
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
using (id = (select auth.uid()) or (select public.is_admin()))
with check (id = (select auth.uid()) or (select public.is_admin()));

create policy topics_read_published on public.topics for select to anon, authenticated
using ((status = 'published' and archived_at is null) or (select public.is_teacher_or_admin()));
create policy topics_staff_insert on public.topics for insert to authenticated
with check ((select public.is_teacher_or_admin()) and created_by = (select auth.uid()) and status = 'draft');
create policy topics_staff_update on public.topics for update to authenticated
using ((select public.is_teacher_or_admin())) with check ((select public.is_teacher_or_admin()));

create policy card_categories_read_all on public.card_categories for select to anon, authenticated using (true);

create policy questions_read_published on public.questions for select to anon, authenticated
using (
  (status = 'published' and archived_at is null and exists (
    select 1 from public.topics t where t.id = topic_id and t.status = 'published' and t.archived_at is null
  )) or (select public.is_teacher_or_admin())
);
create policy questions_staff_insert on public.questions for insert to authenticated
with check ((select public.is_teacher_or_admin()) and created_by = (select auth.uid())
  and status = 'draft' and current_version = 1);

create policy question_versions_read_visible on public.question_versions for select to anon, authenticated
using (
  exists (select 1 from public.questions q join public.topics t on t.id = q.topic_id
    where q.id = question_id and q.current_version = version_number
      and q.status = 'published' and q.archived_at is null
      and t.status = 'published' and t.archived_at is null)
  or (select public.is_teacher_or_admin())
);
create policy question_versions_staff_insert on public.question_versions for insert to authenticated
with check ((select public.is_teacher_or_admin()) and created_by = (select auth.uid()));
create policy question_choices_read_visible on public.question_choices for select to anon, authenticated
using (
  exists (
    select 1 from public.question_versions v join public.questions q on q.id = v.question_id
      join public.topics t on t.id = q.topic_id
    where v.id = question_version_id and q.current_version = v.version_number
      and q.status = 'published' and q.archived_at is null and t.status = 'published' and t.archived_at is null
  ) or (select public.is_teacher_or_admin())
);
create policy question_choices_staff_insert on public.question_choices for insert to authenticated
with check ((select public.is_teacher_or_admin()) and exists (
  select 1 from public.question_versions v where v.id = question_version_id and v.created_by = (select auth.uid())
));
create policy question_rubrics_staff_read on public.question_evaluation_rubrics for select to authenticated
using ((select public.is_teacher_or_admin()));
create policy question_rubrics_staff_insert on public.question_evaluation_rubrics for insert to authenticated
with check ((select public.is_teacher_or_admin()) and exists (
  select 1 from public.question_versions v where v.id = question_version_id and v.created_by = (select auth.uid())
));

create policy sessions_read_owner_or_staff on public.game_sessions for select to authenticated
using (student_id = (select auth.uid()) or (select public.is_teacher_or_admin()));
-- Students read only their own records; authenticated RPCs perform session and answer writes.
create policy answers_read_owner_or_staff on public.student_answers for select to authenticated
using (student_id = (select auth.uid()) or (select public.is_teacher_or_admin()));

-- Session creation snapshots the published versions available to this authenticated student.
create or replace function public.create_game_session(p_topic_code text, p_mode public.game_mode, p_student_name text)
returns public.game_sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_topic public.topics%rowtype; v_session public.game_sessions%rowtype; v_versions jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_topic from public.topics
   where code = p_topic_code and status = 'published' and archived_at is null;
  if not found then raise exception 'Published topic not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_object_agg(q.code, v.id), '{}'::jsonb) into v_versions
    from public.questions q join public.question_versions v
      on v.question_id = q.id and v.version_number = q.current_version
   where q.topic_id = v_topic.id and q.status = 'published' and q.archived_at is null
     and ((p_mode = 'deck' and q.card_category_id is not null)
       or (p_mode = 'quiz' and q.card_category_id is null));
  if v_versions = '{}'::jsonb then raise exception 'Topic has no published questions for this mode' using errcode = 'P0002'; end if;
  insert into public.game_sessions (student_id, topic_id, mode, student_name_snapshot, question_versions)
  values (auth.uid(), v_topic.id, p_mode, left(coalesce(p_student_name, ''), 120), v_versions)
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.publish_question_version(
  p_question_id uuid,
  p_version_number integer,
  p_status public.question_status
)
returns public.questions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_question public.questions%rowtype; v_version public.question_versions%rowtype;
begin
  if auth.uid() is null or not public.is_teacher_or_admin() then
    raise exception 'Teacher or administrator permission required' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Invalid question status' using errcode = '22023';
  end if;
  select * into v_question from public.questions where id = p_question_id for update;
  if not found then raise exception 'Question not found' using errcode = 'P0002'; end if;
  select * into v_version from public.question_versions
    where question_id = p_question_id and version_number = p_version_number;
  if not found or not exists (select 1 from public.question_evaluation_rubrics r where r.question_version_id = v_version.id) then
    raise exception 'Question version and scoring rubric must exist before publishing' using errcode = '23514';
  end if;
  if p_status = 'published' and not exists (
    select 1 from public.topics t where t.id = v_question.topic_id and t.status = 'published' and t.archived_at is null
  ) then raise exception 'Publish the topic before publishing its question' using errcode = '23514'; end if;
  update public.questions set
    current_version = p_version_number,
    question_type = v_version.question_type,
    card_category_id = v_version.card_category_id,
    status = p_status,
    archived_at = case when p_status = 'archived' then now() else null end,
    updated_at = now()
  where id = p_question_id returning * into v_question;
  return v_question;
end;
$$;

-- Authenticated scoring RPC: students submit only a response; the database reads the
-- private rubric, computes correctness/points, validates reverse eligibility, and stores
-- the answer plus total in one transaction. No client-supplied score is trusted.
create or replace function public.submit_game_answer(
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
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if length(coalesce(p_response, '')) > 4000 or
     (not v_is_timeout and length(trim(coalesce(p_response, ''))) = 0) then
    raise exception 'Answer must contain 1 to 4000 characters unless this is a timeout' using errcode = '22023';
  end if;
  select * into v_session from public.game_sessions
    where id = p_session_id and student_id = auth.uid() for update;
  if not found or v_session.status <> 'active' then
    raise exception 'Active game session not found' using errcode = 'P0002';
  end if;

  v_snapshot_version_id := (v_session.question_versions ->> p_question_code)::uuid;
  if v_snapshot_version_id is null then raise exception 'Question is not part of this session snapshot' using errcode = 'P0002'; end if;
  select q.* into v_question
    from public.questions q join public.topics t on t.id = q.topic_id
   where q.code = p_question_code and q.topic_id = v_session.topic_id
     and t.id = v_session.topic_id;
  if not found then raise exception 'Published question not found' using errcode = 'P0002'; end if;

  select * into v_version from public.question_versions
   where question_id = v_question.id and id = v_snapshot_version_id;
  if not found then raise exception 'Current question version not found' using errcode = 'P0002'; end if;
  v_max_points := case when p_round = 'reverse' and v_version.points = 0 then 1 else v_version.points end;
  select * into v_rubric from public.question_evaluation_rubrics
   where question_version_id = v_version.id;
  if not found then raise exception 'Question rubric is not configured' using errcode = 'P0002'; end if;

  if p_round = 'reverse' then
    select count(*) into v_reverse_count from public.student_answers
     where session_id = p_session_id and round = 'reverse';
    if v_reverse_count >= 3 then raise exception 'Reverse Round attempt limit reached' using errcode = '23514'; end if;
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
    v_correct_display := coalesce(v_rubric.expected_answer, v_rubric.answer_key);
  end if;

  if v_correct then v_points := v_max_points; end if;
  insert into public.student_answers (
    session_id, student_id, question_id, question_version_id, round, response,
    is_correct, points_awarded, max_points, evaluation_method, evaluation_record
  ) values (
    p_session_id, auth.uid(), v_question.id, v_version.id, p_round, to_jsonb(coalesce(trim(p_response), '')),
    v_correct, v_points, v_max_points, case when v_is_timeout then 'timeout' else v_method end,
    jsonb_build_object('evaluationMethod', case when v_is_timeout then 'timeout' else v_method end,
      'timedOut', v_is_timeout, 'questionVersionId', v_version.id)
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
    'evaluationMethod', case when v_is_timeout then 'timeout' else v_method end
  );
end;
$$;

create or replace function public.finish_game_session(p_session_id uuid)
returns public.game_sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_session public.game_sessions%rowtype;
begin
  update public.game_sessions set status = 'completed', completed_at = now()
   where id = p_session_id and student_id = auth.uid() and status = 'active'
   returning * into v_session;
  if not found then raise exception 'Active game session not found' using errcode = 'P0002'; end if;
  return v_session;
end;
$$;

revoke all on function public.submit_game_answer(uuid, text, public.game_round, text, boolean) from public, anon;
grant execute on function public.submit_game_answer(uuid, text, public.game_round, text, boolean) to authenticated;
revoke all on function public.finish_game_session(uuid) from public, anon;
revoke all on function public.create_game_session(text, public.game_mode, text) from public, anon;
grant execute on function public.create_game_session(text, public.game_mode, text) to authenticated;
revoke all on function public.publish_question_version(uuid, integer, public.question_status) from public, anon;
grant execute on function public.publish_question_version(uuid, integer, public.question_status) to authenticated;
grant execute on function public.finish_game_session(uuid) to authenticated;

revoke all on public.profiles, public.topics, public.card_categories, public.questions,
  public.question_versions, public.question_evaluation_rubrics, public.question_choices, public.game_sessions, public.student_answers
from anon, authenticated;
grant all on public.profiles, public.topics, public.card_categories, public.questions,
  public.question_versions, public.question_evaluation_rubrics, public.question_choices, public.game_sessions, public.student_answers
to service_role;
grant select on public.topics, public.card_categories, public.questions, public.question_versions, public.question_choices to anon, authenticated;
grant select on public.question_evaluation_rubrics to authenticated;
grant select on public.profiles, public.game_sessions, public.student_answers to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert, update on public.topics to authenticated;
grant insert on public.questions to authenticated;
grant insert on public.question_versions, public.question_choices, public.question_evaluation_rubrics to authenticated;

revoke all on function public.protect_profile_role() from public, anon, authenticated;
revoke all on function public.create_student_profile() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.payload_contains_private_answer(jsonb) from public, anon;
grant execute on function public.payload_contains_private_answer(jsonb) to authenticated;
revoke all on function public.current_profile_role() from public, anon;
grant execute on function public.current_profile_role() to authenticated;
revoke all on function public.is_teacher_or_admin() from public;
grant execute on function public.is_teacher_or_admin() to anon, authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

insert into public.topics (code, title, description, competency, status) values
  ('elements', 'Pagsusuri ng Elemento ng Akda', 'Suriin ang banghay, tauhan, tagpuan, at tunggalian sa mga akdang pampanitikan.', 'Nasusuri ang mga elemento at mahahalagang kaisipan ng akdang pampanitikan.', 'published'),
  ('meaning', 'Pagpapakahulugan sa Pahayag', 'Tuklasin ang pahiwatig, tayutay, at malalim na diwa ng bawat pahayag pampanitikan.', 'Naipaliliwanag ang pahiwatig at mensahe ng akdang pampanitikan.', 'published'),
  ('alamat', 'Alamat', 'Pagsusuri sa pinagmulan, elemento, uri, at pampanitikang aral ng mga alamat.', 'Nauunawaan ang kahulugan, elemento, uri, at pampanitikang aral ng mga alamat.', 'published'),
  ('maikling-kwento', 'Maikling Kwento', 'Pagsusuri sa banghay, kasukdulan, tagpuan, tauhan, tema, at aral sa maikling kuwento.', 'Nasusuri ang mga elemento, uri, at bahagi ng banghay sa maikling kuwento.', 'published')
on conflict (code) do nothing;

insert into public.card_categories (code, label, sort_order) values
  ('question', 'Tanong', 1), ('statement', 'Pahayag', 2), ('correction', 'Pagwawasto', 3),
  ('bonus', 'Bonus', 4), ('reverse', 'Baligtaran', 5), ('help', 'Gabay', 6), ('challenge', 'Hamon', 7)
on conflict (code) do nothing;

commit;
