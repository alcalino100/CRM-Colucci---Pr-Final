-- 20250911 — Melhorias da IA conversacional (escalação, RAG, analytics).
-- Idempotente: pode rodar mais de uma vez. Rodar no SQL editor do Supabase
-- (o app não tem permissão de DDL).
-- ATENÇÃO: a extensão pgvector precisa estar habilitada. Se
--   create extension if not exists vector;
-- falhar, rode o restante do script sem esse bloco (só o RAG semântico fica pendente).

create extension if not exists vector;

-- Triggers de escalação: garante colunas (a tabela base já existe).
alter table public.escalation_triggers add column if not exists name text;
alter table public.escalation_triggers add column if not exists action text;
alter table public.escalation_triggers add column if not exists notification_channels text[];
alter table public.escalation_triggers add column if not exists assign_to text;
create index if not exists idx_escalation_triggers_ai on public.escalation_triggers(ai_id);

-- Conversas IA: campos da escalação + teste + inatividade.
alter table public.conversations_ia add column if not exists escalation_reason text;
alter table public.conversations_ia add column if not exists last_user_message_at timestamptz;
alter table public.conversations_ia add column if not exists test_mode boolean not null default false;
create index if not exists idx_conversations_ia_status on public.conversations_ia(status, ai_responding);

-- RAG semântico: chunks + embeddings dos documentos.
create table if not exists public.document_embeddings (
  id text primary key,
  document_id text not null references public.documents(id) on delete cascade,
  embedding vector(1536),
  chunk_text text,
  chunk_order int,
  created_at timestamptz not null default now()
);
create index if not exists idx_document_embeddings_doc on public.document_embeddings(document_id);
create index if not exists idx_document_embeddings_vec on public.document_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.documents add column if not exists chunks_count int not null default 1;

-- Analytics de conversas.
create table if not exists public.conversation_analytics (
  id text primary key,
  conversation_id text references public.conversations_ia(id) on delete cascade,
  ai_id text,
  resolved_without_escalation boolean,
  response_time_ms int,
  user_satisfaction int,
  api_cost_usd decimal(10,4),
  tokens_used int,
  created_at timestamptz not null default now()
);
create index if not exists idx_analytics_ai on public.conversation_analytics(ai_id, created_at);
