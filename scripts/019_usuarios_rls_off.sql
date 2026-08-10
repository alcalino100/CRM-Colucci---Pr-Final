-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- Desativa o Row Level Security (RLS) da tabela public.usuarios.
--
-- Motivo: todas as outras tabelas do projeto têm o RLS desativado nos scripts
-- (017_locacao, 013_rastreio, etc.). A tabela usuarios foi criada pelo dashboard
-- com RLS ATIVO e sem política de UPDATE, então o app conseguia listar e inserir
-- usuários, mas as EDIÇÕES (perfil, permissões, ativar/desativar) falhavam em
-- silêncio e não persistiam.

alter table public.usuarios disable row level security;
