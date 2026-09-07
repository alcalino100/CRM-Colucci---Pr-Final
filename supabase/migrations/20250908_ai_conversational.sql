-- Fase 2: IA Conversacional - tabelas novas, sem tocar em leads/whatsapp existentes
-- Execute este SQL no Supabase Dashboard > SQL Editor

-- Conversational AI
create table if not exists public.ai_agents (
  id text primary key,
  name text not null,
  description text,
  bot_template text not null default 'vendas',
  channels text[] not null default array['whatsapp'],
  response_mode text not null default 'auto',
  wait_time_ms int not null default 2000,
  message_cap int not null default 10,
  api_token text,
  api_endpoint text,
  model_name text,
  system_prompt text,
  additional_instructions text,
  brand_voice text,
  handoff_rules text,
  is_active boolean not null default false,
  config jsonb,
  account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_bases (
  id text primary key,
  name text not null,
  description text,
  vector_store_id text,
  ai_id text references public.ai_agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id text primary key,
  name text not null,
  type text not null,
  url text not null,
  content text,
  file_size int,
  knowledge_base_id text not null references public.knowledge_bases(id) on delete cascade,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id text primary key,
  question text not null,
  answer text not null,
  knowledge_base_id text not null references public.knowledge_bases(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id text primary key,
  name text not null,
  description text,
  type text not null,
  prompt text not null,
  questions text[],
  ai_id text not null references public.ai_agents(id) on delete cascade,
  is_active boolean not null default true,
  config jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.escalation_triggers (
  id text primary key,
  name text not null,
  condition text not null,
  detection_keywords text[],
  action text not null,
  notification_channels text[],
  assign_to text,
  ai_id text not null references public.ai_agents(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations_ia (
  id text primary key,
  ai_id text not null references public.ai_agents(id) on delete cascade,
  contact_id text,
  channel text not null,
  external_id text,
  status text not null default 'active',
  ai_responding boolean not null default true,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.messages_ia (
  id text primary key,
  conversation_id text not null references public.conversations_ia(id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_ai_agents_account on public.ai_agents(account_id);
create index if not exists idx_conversations_ia_ai on public.conversations_ia(ai_id);
create index if not exists idx_messages_ia_conv on public.messages_ia(conversation_id);

-- RLS desabilitado para MVP (reaproveita auth existente via app)
alter table public.ai_agents disable row level security;
alter table public.knowledge_bases disable row level security;
alter table public.documents disable row level security;
alter table public.faqs disable row level security;
alter table public.goals disable row level security;
alter table public.escalation_triggers disable row level security;
alter table public.conversations_ia disable row level security;
alter table public.messages_ia disable row level security;
