-- Tipo do imóvel vendido: campo obrigatório no fechamento do lead
-- Opções registradas no kanban (TIPO_IMOVEL_VENDIDO): asa, casa em condomínio fechado,
-- apartamento, terreno, terreno em condomínio fechado, comercial casa,
-- comercial - casa, comercial - barracão
alter table leads add column if not exists tipo_imovel_vendido text;

-- Backfill: leads já fechados não têm o dado preenchido (fica nulo até o gestor editar)
