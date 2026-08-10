-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- Compartimenta as notificações por módulo (Vendas / Locação).
--
-- Adiciona a coluna `modulo` na tabela notificacoes:
--   'vendas'   -> visível apenas para quem tem o módulo Vendas
--   'locacao'  -> visível apenas para quem tem o módulo Locação
--   NULL       -> visível para todos (padrão, compatível com notificações antigas)

alter table public.notificacoes add column if not exists modulo text;

do $$
begin
  alter table public.notificacoes
    add constraint notificacoes_modulo_check check (
      modulo in ('vendas', 'locacao') or modulo is null
    );
exception when duplicate_object then null; end $$;
