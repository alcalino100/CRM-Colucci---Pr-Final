-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- Impede o cadastro de leads com telefone duplicado em TODA a base
-- (todos os corretores e gestores), com proteção real no banco.

-- 1) Coluna normalizada (apenas dígitos) gerada automaticamente a partir do telefone.
--    Ex.: "(18) 99811-2694" e "18998112694" viram o mesmo valor "18998112694".
alter table public.leads
  add column if not exists telefone_normalizado text
  generated always as (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) stored;

-- 2) Índice único parcial: garante unicidade ignorando registros sem telefone.
create unique index if not exists leads_telefone_normalizado_uidx
  on public.leads (telefone_normalizado)
  where telefone_normalizado <> '';
