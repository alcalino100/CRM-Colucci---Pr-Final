-- White-label base (NOVO BANCO): tabelas núcleo que nasceram no dashboard e não
-- estão nas migrations. Rode PRIMEIRO (001), depois 002..028 e supabase/migrations.
-- Seguro re-rodar. RLS desligado (igual produção atual).

-- ============================ USUÁRIOS ============================
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  senha_hash text,
  role text not null default 'corretor',
  status text not null default 'ativo',
  avatar text,
  criado_em timestamptz not null default now(),
  workspace_id text not null default 'main'
);

-- ============================ LEADS ============================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  telefone text not null default '',
  email text not null default '',
  referencia_imovel text not null default '',
  referencias jsonb not null default '[]',
  temperatura text,
  ref_proposta text,
  ref_fechamento text,
  tipo_imovel_vendido text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  utm_campaign text,
  utm_adset text,
  utm_ad text,
  fbc text,
  fbp text,
  origem text,
  observacoes text not null default '',
  status text not null default 'novo',
  valor_proposta numeric,
  valor_comissao numeric,
  corretor_id uuid,
  gestor_responsavel text,
  arquivado_em timestamptz,
  fechado_em timestamptz,
  negociando_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  client_ip text,
  client_ua text,
  workspace_id text not null default 'main'
);
create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_leads_atualizado on public.leads (atualizado_em);
create index if not exists idx_leads_telefone on public.leads (telefone);
create index if not exists idx_leads_corretor on public.leads (corretor_id);

-- ============================ VISITAS (vendas) ============================
create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  data date not null,
  horario text not null default '',
  corretor_id uuid,
  referencias text not null default '',
  observacoes text not null default ''
);
create index if not exists idx_visitas_lead on public.visitas (lead_id);

-- ============================ META (campanhas/conjuntos/anúncios) ============================
create table if not exists public.meta_campanhas (
  id text primary key,
  nome text,
  status text,
  corretor_id uuid,
  conta text,
  atualizado_em timestamptz
);
create table if not exists public.meta_adsets (
  id text primary key,
  nome text,
  campanha_id text,
  atualizado_em timestamptz
);
create table if not exists public.meta_ads (
  id text primary key,
  nome text,
  campanha_id text,
  adset_id text,
  atualizado_em timestamptz
);

-- RLS desligado (igual produção; app usa service/publishable sem policies).
alter table public.usuarios disable row level security;
alter table public.leads disable row level security;
alter table public.visitas disable row level security;
alter table public.meta_campanhas disable row level security;
alter table public.meta_adsets disable row level security;
alter table public.meta_ads disable row level security;

-- ============================ ADMIN INICIAL ============================
-- Login: guilherme@colucci.com / Trocar123! (TROQUE após entrar: Meu Perfil)
insert into public.usuarios (nome, email, senha_hash, role, status)
values ('Guilherme Garcia', 'guilherme@colucci.com', '$2b$10$dhZ6yoOyJJnnJKyvNewC6ugeZf0ITQjYx2hNUyn.wjKhoQdpaPFgS', 'gestor_master', 'ativo')
on conflict (email) do nothing;
