-- Comissão por lead na página de Fechamentos
-- valor_comissao: valor da comissão recebida pelo corretor, inserida manualmente
-- pelos gestores (Patrícia, Kleber, Guilherme) lead a lead.
alter table leads add column if not exists valor_comissao numeric;
