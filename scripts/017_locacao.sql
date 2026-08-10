-- CRM de Locação: tabelas espelho do CRM de Vendas, separadas para não misturar métricas.
-- Execute no SQL Editor do Supabase.

-- 1) Leads de locação (espelho de leads + campos específicos de locação)
create table if not exists public.locacao_leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  email text,
  referencia_imovel text,
  referencias jsonb not null default '[]',
  temperatura text not null default 'morno',
  origem text not null default 'Outro',
  observacoes text,
  status text not null default 'novo',
  valor_proposta numeric,
  valor_comissao numeric,
  corretor_id uuid,
  gestor_responsavel uuid,
  tipo_imovel_desejado text,
  bairros_desejados jsonb not null default '[]',
  aluguel_max numeric,
  quartos text,
  garantia text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz,
  locado_em timestamptz,
  negociando_em timestamptz
);
alter table public.locacao_leads disable row level security;
grant all on table public.locacao_leads to anon, authenticated;
create index if not exists locacao_leads_status_idx on public.locacao_leads (status);
create index if not exists locacao_leads_corretor_idx on public.locacao_leads (corretor_id);

-- 2) Visitas de locação
create table if not exists public.locacao_visitas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.locacao_leads(id) on delete cascade,
  data text not null,
  horario text not null,
  corretor_id uuid,
  gestor_responsavel uuid,
  referencias text,
  observacoes text,
  criado_em timestamptz not null default now()
);
alter table public.locacao_visitas disable row level security;
grant all on table public.locacao_visitas to anon, authenticated;
create index if not exists locacao_visitas_lead_idx on public.locacao_visitas (lead_id);

-- 3) Contratos de locação (fechamento)
create table if not exists public.locacao_contratos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.locacao_leads(id) on delete set null,
  lead_nome text not null,
  corretor_id uuid,
  corretor_nome text,
  imovel_ref text,
  valor_aluguel numeric not null,
  garantia text,
  comissao numeric,
  assinado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
alter table public.locacao_contratos disable row level security;
grant all on table public.locacao_contratos to anon, authenticated;
create index if not exists locacao_contratos_lead_idx on public.locacao_contratos (lead_id);

-- Realtime para as novas tabelas (ignora erro se já adicionadas)
do $$ begin
  alter publication supabase_realtime add table public.locacao_leads;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.locacao_visitas;
exception when duplicate_object then null; end $$;
