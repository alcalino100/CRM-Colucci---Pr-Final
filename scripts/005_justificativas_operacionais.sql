-- Cobrança de justificativa para leads sem atualização operacional
create table if not exists public.justificativas_operacionais (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  motivo text not null check (char_length(trim(motivo)) between 2 and 120),
  observacao text,
  etapa text not null check (etapa in ('novo', 'escolhendo opcoes', 'visita agendada', 'negociando', 'fechado', 'perdido')),
  autor_id uuid not null references public.usuarios(id),
  autor_nome text not null,
  criado_em timestamptz not null default now(),
  constraint justificativa_outro_observacao check (motivo <> 'Outro' or char_length(trim(coalesce(observacao, ''))) > 0)
);

create index if not exists justificativas_lead_data_idx on public.justificativas_operacionais (lead_id, criado_em desc);

do $$ begin
  alter publication supabase_realtime add table public.justificativas_operacionais;
exception when duplicate_object then null; end $$;
