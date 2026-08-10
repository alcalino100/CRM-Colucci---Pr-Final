-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- Separação de módulos (Vendas / Locação) e níveis (Corretor / Gestor / Master)
--
-- A coluna `role` da tabela public.usuarios é TEXT e passa a aceitar:
--   corretor           -> Vendas + Locação (nível corretor)  [legado]
--   gestor             -> Vendas + Locação (nível gestor)    [legado]
--   gestor_master      -> acesso total (admin)
--   corretor_vendas    -> somente Vendas (nível corretor)
--   gestor_vendas      -> somente Vendas (nível gestor)
--   corretor_locacao   -> somente Locação (nível corretor)
--   gestor_locacao     -> somente Locação (nível gestor)

-- Restrições de nível/modulo (opcional, mas recomendado):
-- Dropa a constraint antiga (que só aceitava 'corretor'/'gestor') e recria com
-- os 7 perfis. Usamos DROP + ADD em vez de "if not exists" para corrigir
-- bancos que já tinham a versão antiga da constraint.
alter table public.usuarios drop constraint if exists usuarios_role_check;
alter table public.usuarios
  add constraint usuarios_role_check check (
    role in ('corretor','gestor','gestor_master',
             'corretor_vendas','gestor_vendas',
             'corretor_locacao','gestor_locacao')
  );

-- ---------------------------------------------------------------
-- 1) TROCA DE SENHA (o login transitório compara senha_hash == senha,
--    ou seja, senha_hash guarda a senha em texto puro)
-- ---------------------------------------------------------------
-- update public.usuarios
--    set senha_hash = 'SUA_NOVA_SENHA'
--  where email = 'email@dominio.com';

-- ---------------------------------------------------------------
-- 2) Ajustar o ROLE de um usuário
-- ---------------------------------------------------------------
-- update public.usuarios
--    set role = 'gestor_master'
--  where email = 'email@dominio.com';

-- Exemplo prático — definir os 3 Gestores Master (troque os e-mails pelos reais da conta):
-- update public.usuarios set role = 'gestor_master' where email = 'guilherme@dominio.com';
-- update public.usuarios set role = 'gestor_master' where email = 'patricia@colucci.com';
-- update public.usuarios set role = 'gestor_master' where email = 'kleber@dominio.com';
-- update public.usuarios set senha_hash = '123456' where email = 'patricia@colucci.com';
