-- Relatórios mensais (Instagram e campanhas) guardados com histórico para consulta e comparação.
create table if not exists public.meta_relatorios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('instagram', 'campanhas')),
  mes text not null,                       -- 'YYYY-MM'
  dados jsonb not null default '{}'::jsonb,
  analise text,
  gerado_em timestamptz not null default now(),
  gerado_por text,                          -- 'cron' ou id do usuário
  unique (tipo, mes)
);
alter table public.meta_relatorios enable row level security;
revoke all on table public.meta_relatorios from anon, authenticated;
