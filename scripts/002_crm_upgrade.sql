-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- Upgrade do CRM Colucci: temperatura, referências múltiplas, obs. de qualidade,
-- auditoria persistida, notificações por papel e avatar de perfil.

-- 1) Leads: temperatura + referências múltiplas + referências de proposta/fechamento
alter table public.leads add column if not exists temperatura text not null default 'morno';
alter table public.leads add column if not exists referencias jsonb not null default '[]';
alter table public.leads add column if not exists ref_proposta text;
alter table public.leads add column if not exists ref_fechamento text;

-- 2) Visitas: referência(s) do imóvel na visita
alter table public.visitas add column if not exists referencias text;

-- 3) Usuários: foto de perfil (data URL comprimida)
alter table public.usuarios add column if not exists avatar text;

-- 4) Observações internas de qualidade (somente gestores veem via app)
create table if not exists public.observacoes_qualidade (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  autor_id uuid,
  autor_nome text not null,
  texto text not null,
  criado_em timestamptz not null default now()
);

-- 5) Auditoria persistida (lead_id sem FK para preservar histórico após exclusão)
create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  lead_nome text,
  usuario_nome text not null,
  tipo text not null, -- criacao | edicao | etapa | visita | proposta | fechamento | exclusao | responsavel | temperatura | qualidade
  descricao text not null,
  referencias text,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_lead_idx on public.auditoria (lead_id);

-- 6) Notificações segmentadas por papel
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  tipo text not null default 'geral',
  para_role text,          -- 'gestor' | 'corretor' | null (todos)
  para_usuario_id uuid,    -- destinatário específico (opcional)
  lead_id uuid,
  lida_por jsonb not null default '[]',
  criado_em timestamptz not null default now()
);
-- Caso a tabela notificacoes já exista de uma versão anterior, garante as colunas novas
alter table public.notificacoes add column if not exists tipo text not null default 'geral';
alter table public.notificacoes add column if not exists para_role text;
alter table public.notificacoes add column if not exists para_usuario_id uuid;
alter table public.notificacoes add column if not exists lead_id uuid;
alter table public.notificacoes add column if not exists lida_por jsonb not null default '[]';

-- 7) Realtime para as novas tabelas (ignora erro se já adicionadas)
do $$ begin
  alter publication supabase_realtime add table public.observacoes_qualidade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.auditoria;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notificacoes;
exception when duplicate_object then null; end $$;
