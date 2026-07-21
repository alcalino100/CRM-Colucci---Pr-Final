-- Disparador de Notificações (comunicados da gestão + agendamento)

-- 1) Notificações: título, prioridade e origem (sistema × gestão)
alter table public.notificacoes add column if not exists titulo text;
alter table public.notificacoes add column if not exists prioridade text not null default 'informativo';
alter table public.notificacoes add column if not exists origem text not null default 'sistema';
alter table public.notificacoes add column if not exists criado_por_nome text;

-- 2) Notificações agendadas (fila de envio)
create table if not exists public.notificacoes_agendadas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  mensagem text not null,
  prioridade text not null default 'informativo',
  para_role text,
  para_usuario_id uuid,
  agendada_para timestamptz not null,
  status text not null default 'pendente', -- pendente | enviada | cancelada
  criado_por_nome text not null,
  criado_em timestamptz not null default now(),
  enviada_em timestamptz
);
create index if not exists notif_agendadas_status_idx on public.notificacoes_agendadas (status, agendada_para);

do $$ begin
  alter publication supabase_realtime add table public.notificacoes_agendadas;
exception when duplicate_object then null; end $$;
