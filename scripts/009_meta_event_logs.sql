-- Log persistente dos eventos enviados à Meta (Conversions API / CAPI).
-- Toda vez que um evento Purchase é enviado (fechamento em tempo real ou backfill),
-- a rota registra aqui: status, resposta do Meta e dados do lead.
-- Rodar no SQL Editor do Supabase (mesmo padrão dos demais scripts 00X_*.sql).

create table if not exists public.meta_event_logs (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_name text not null default 'Purchase',
  pixel_id text not null,
  origem text not null default 'events', -- events | backfill
  lead_id text,
  nome text,
  telefone_mascarado text,
  valor numeric,
  corretor_id text,
  campaign_id text,
  adset_id text,
  ad_id text,
  status text not null default 'enviado', -- enviado | erro
  http_status integer,
  events_received integer,
  meta_code text,
  meta_message text,
  event_time timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists meta_event_logs_criado_idx on public.meta_event_logs (criado_em desc);
create index if not exists meta_event_logs_eventid_idx on public.meta_event_logs (event_id);
create index if not exists meta_event_logs_lead_idx on public.meta_event_logs (lead_id);

-- RLS desabilitado: o app usa a chave publishable (anon), como nas demais tabelas do projeto.
alter table public.meta_event_logs disable row level security;

notify pgrst, 'reload schema';

do $$ begin
  alter publication supabase_realtime add table public.meta_event_logs;
exception when duplicate_object then null; end $$;
