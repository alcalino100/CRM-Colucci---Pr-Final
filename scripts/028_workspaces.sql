-- Fase A multi-tenant (estilo GoHighLevel): contas isoladas no mesmo banco.
-- FASE A = SOMENTE estrutura, sem enforcement: workspace_id NULLABLE em tudo,
-- nada muda no comportamento. O isolamento por módulo vem na Fase B.
-- Rode UMA VEZ no SQL Editor do Supabase. Seguro re-rodar.
create table if not exists public.workspaces (
  id text primary key,
  slug text unique not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.workspaces (id, slug, name)
values ('main', 'colucci', 'Colucci Imóveis')
on conflict (id) do nothing;

create table if not exists public.workspace_members (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Coluna de conta nas tabelas núcleo (NULL = conta principal, compat total).
alter table public.leads add column if not exists workspace_id text not null default 'main';
alter table public.usuarios add column if not exists workspace_id text not null default 'main';
alter table public.ai_agents add column if not exists workspace_id text not null default 'main';
alter table public.automations add column if not exists workspace_id text not null default 'main';
alter table public.automation_jobs add column if not exists workspace_id text not null default 'main';
alter table public.automation_logs add column if not exists workspace_id text not null default 'main';
alter table public.whatsapp_mensagens add column if not exists workspace_id text not null default 'main';
alter table public.whatsapp_instancias add column if not exists workspace_id text not null default 'main';
alter table public.conversations_ia add column if not exists workspace_id text not null default 'main';
alter table public.messages_ia add column if not exists workspace_id text not null default 'main';
alter table public.notificacoes add column if not exists workspace_id text not null default 'main';
alter table public.visitas add column if not exists workspace_id text not null default 'main';
alter table public.knowledge_bases add column if not exists workspace_id text not null default 'main';
alter table public.documents add column if not exists workspace_id text not null default 'main';
alter table public.automation_message_templates add column if not exists workspace_id text not null default 'main';
alter table public.workspace_settings add column if not exists workspace_id text not null default 'main';
alter table public.pipeline_stages add column if not exists workspace_id text not null default 'main';
