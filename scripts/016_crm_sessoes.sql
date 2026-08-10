-- Presença online/ausente + tempo médio de uso do CRM
-- Cada aba aberta cria uma sessão (inicio_em). O cliente atualiza duracao_seg
-- a cada 30s e fecha (fim_em) quando a aba perde visibilidade ou é fechada.
-- Online = existe sessão com fim_em nulo cujo heartbeat (atualizado_em) é recente.
-- Tempo de uso = soma de duracao_seg das sessões iniciadas no dia.

create table if not exists public.crm_sessoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  inicio_em timestamptz not null default now(),
  fim_em timestamptz,
  duracao_seg int not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table public.crm_sessoes disable row level security;
grant all on table public.crm_sessoes to anon, authenticated;

create index if not exists crm_sessoes_user_idx on public.crm_sessoes (user_id);
create index if not exists crm_sessoes_abertas_idx on public.crm_sessoes (fim_em, atualizado_em);
