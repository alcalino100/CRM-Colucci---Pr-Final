-- WhatsApp Oficial – fase 2: log de eventos do webhook e modo de atendimento por canal.

create table if not exists public.whatsapp_oficial_eventos (
  id uuid primary key default gen_random_uuid(),
  recebido_em timestamptz not null default now(),
  tipo text not null,               -- mensagem | status | verificacao | recusado | erro
  phone_number_id text,
  wamid text,
  resumo text,
  assinatura_ok boolean
);
create index if not exists whatsapp_oficial_eventos_recebido_idx on public.whatsapp_oficial_eventos (recebido_em desc);
alter table public.whatsapp_oficial_eventos enable row level security;
revoke all on table public.whatsapp_oficial_eventos from anon, authenticated;

-- manual = só pessoas pelo Inbox | assistente = Assistente Virtual (Betina) | ia = IA conversacional de leads
alter table public.whatsapp_oficial_canais add column if not exists modo text not null default 'manual';
alter table public.whatsapp_oficial_canais add column if not exists ai_agent_id text;
