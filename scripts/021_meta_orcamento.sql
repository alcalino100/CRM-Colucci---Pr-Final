-- Configuração do teto mensal de gastos do Meta Ads (verba).
-- Painel em Meta Ads: mostra quanto já foi gasto, quanto falta e a projeção
-- do mês com base no padrão de veiculação (ex.: dia 01 a 20).
-- Rodar no SQL Editor do Supabase (mesmo padrão dos demais scripts 00X_*.sql).

create table if not exists public.meta_orcamento (
  id int primary key default 1 check (id = 1), -- linha única
  teto_mensal numeric not null default 10000,          -- teto de gastos do mês (R$)
  custo_inicial numeric not null default 1428.34,      -- valor já comprometido no início do mês (cartão da empresa)
  veiculacao_inicio int not null default 1,            -- primeiro dia de veiculação do mês
  veiculacao_fim int not null default 20,              -- último dia de veiculação do mês
  contas text[] not null default '{act_321873088505518,act_2062030070601584}', -- contas de anúncio incluídas no gasto real
  atualizado_em timestamptz not null default now()
);
alter table public.meta_orcamento disable row level security;
grant all on table public.meta_orcamento to anon, authenticated;

insert into public.meta_orcamento (id) values (1)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
