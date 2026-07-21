-- Correção idempotente da autoria das notificações, sem apagar dados existentes.
alter table public.notificacoes add column if not exists criado_por uuid;
alter table public.notificacoes add column if not exists criado_por_nome text;

alter table public.notificacoes_agendadas add column if not exists criado_por uuid;
alter table public.notificacoes_agendadas add column if not exists criado_por_nome text;

comment on column public.notificacoes.criado_por is 'ID do usuário que criou a notificação';
comment on column public.notificacoes.criado_por_nome is 'Nome do usuário preservado no momento do envio';

-- Solicita ao PostgREST/Supabase a atualização imediata do schema cache.
notify pgrst, 'reload schema';
