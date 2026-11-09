-- ==============================================================================
-- PanitiKard V2 Phase 5.1 Migration: Backend Foundation for AI Semantic Evaluation
-- ==============================================================================
-- 
-- Creates the public.ai_evaluations table for persisting Gemini semantic evaluation
-- results, scores, criteria breakdowns, and feedback.
-- 
-- ARCHITECTURAL AND SECURITY GUARANTEES:
-- 1. Evaluative & Formative Only: ai_evaluations does NOT modify game_sessions
--    scores (main_score, reverse_score) and does NOT insert into student_answers.
-- 2. Authoritative Scoring: Official scores and game progression are strictly
--    governed by the submit_game_answer() PostgreSQL RPC.
-- 3. Reverse Round Protection: Reverse Round remains 0-point review practice.
-- 4. No Credentials Stored: Zero Gemini API keys or secrets are stored in the database.
-- 5. Row Level Security: Students can read only their own evaluation records.
--    Teachers and administrators can read all records for pedagogical review.
--    INSERT is restricted exclusively to the backend service_role; no authenticated
--    role (student or staff) may insert directly, preventing forge attacks on
--    semantic_score, confidence_score, status, and raw_model_response.
-- 6. Safe Relational Links: Foreign keys link to profiles, game_sessions, questions,
--    and question_versions.

begin;

-- Preflight Check: Verify that Phase 4 tables exist
do $migration_preflight$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'PanitiKard Phase 5.1 migration requires the public.profiles table from Phase 4.';
  end if;
  if to_regclass('public.questions') is null then
    raise exception 'PanitiKard Phase 5.1 migration requires the public.questions table from Phase 4.';
  end if;
  if to_regclass('public.game_sessions') is null then
    raise exception 'PanitiKard Phase 5.1 migration requires the public.game_sessions table from Phase 4.';
  end if;
  if to_regclass('public.question_versions') is null then
    raise exception 'PanitiKard Phase 5.1 migration requires the public.question_versions table from Phase 4.';
  end if;
end;
$migration_preflight$;

-- Create public.ai_evaluations table
create table if not exists public.ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  session_id uuid references public.game_sessions(id) on delete set null,
  question_id uuid not null references public.questions(id) on delete restrict,
  question_version_id uuid references public.question_versions(id) on delete restrict,
  student_answer text not null,
  is_semantic_match boolean not null default false,
  semantic_score numeric(5, 4) not null default 0.0 check (semantic_score >= 0.0 and semantic_score <= 1.0),
  confidence_score numeric(5, 4) check (confidence_score >= 0.0 and confidence_score <= 1.0),
  feedback text not null default '',
  rubric_criteria jsonb not null default '[]'::jsonb,
  raw_model_response jsonb not null default '{}'::jsonb,
  model_version text not null default 'gemini-3.5-flash-lite',
  status text not null default 'baseline_evaluated' check (status in ('pending', 'evaluated', 'baseline_evaluated', 'flagged', 'failed')),
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ai_evaluations_student_answer_length check (char_length(student_answer) between 1 and 4000),
  constraint ai_evaluations_rubric_criteria_array check (jsonb_typeof(rubric_criteria) = 'array'),
  constraint ai_evaluations_raw_response_object check (jsonb_typeof(raw_model_response) = 'object')
);

-- Performance Indexes
create index if not exists ai_evaluations_student_idx on public.ai_evaluations(student_id, evaluated_at desc);
create index if not exists ai_evaluations_session_idx on public.ai_evaluations(session_id) where session_id is not null;
create index if not exists ai_evaluations_question_idx on public.ai_evaluations(question_id, evaluated_at desc);

-- Row Level Security (RLS)
alter table public.ai_evaluations enable row level security;

-- Policies: Students read self, staff reads all
drop policy if exists ai_evaluations_read_owner_or_staff on public.ai_evaluations;
create policy ai_evaluations_read_owner_or_staff on public.ai_evaluations for select to authenticated
using (student_id = (select auth.uid()) or (select public.is_teacher_or_admin()));

-- INSERT is restricted exclusively to service_role (the trusted backend server).
-- Authenticated clients (students, teachers) cannot insert directly into ai_evaluations.
-- This prevents students from forging semantic_score, confidence_score, status, or
-- raw_model_response values that would pollute teacher analytics and audit records.
-- All legitimate insertions are performed by the backend Express server after completing
-- Gemini evaluation, session ownership verification, and question relationship validation.
drop policy if exists ai_evaluations_insert_owner on public.ai_evaluations;
drop policy if exists ai_evaluations_insert_owner_or_staff on public.ai_evaluations;

-- Grants
revoke all on table public.ai_evaluations
from public, anon, authenticated;

grant select on public.ai_evaluations to authenticated;
grant all on public.ai_evaluations to service_role;

commit;

