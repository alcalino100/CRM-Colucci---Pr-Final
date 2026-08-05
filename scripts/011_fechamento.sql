-- Página de Fechamentos (análise mensal de fechamentos e negociações)
-- Colunas fechado_em / negociando_em: registram a data exata em que o lead entrou
-- na etapa "Fechado" ou "Negociando". Sem elas, a página usa atualizado_em como fallback.
alter table leads add column if not exists fechado_em timestamptz;
alter table leads add column if not exists negociando_em timestamptz;

-- Backfill: leads já existentes nas etapas recebem a data aproximada (atualizado_em)
update leads set fechado_em = atualizado_em where status = 'fechado' and fechado_em is null;
update leads set negociando_em = atualizado_em where status = 'negociando' and negociando_em is null;
