-- WhatsApp Oficial (Meta Cloud API): canais e colunas de entrega.
-- Convive com a Evolution: as conversas oficiais usam instance_name = 'oficial:<phone_number_id>' em whatsapp_mensagens.

create table if not exists public.whatsapp_oficial_canais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  phone_number_id text not null unique,
  waba_id text,
  numero text,
  nome_verificado text,
  qualidade text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.whatsapp_mensagens add column if not exists canal text not null default 'evolution';
alter table public.whatsapp_mensagens add column if not exists status_entrega text;
alter table public.whatsapp_mensagens add column if not exists erro_entrega text;

create index if not exists whatsapp_mensagens_mensagem_id_idx on public.whatsapp_mensagens (mensagem_id);

-- Só o servidor (chave secreta) acessa a tabela de canais.
alter table public.whatsapp_oficial_canais enable row level security;
revoke all on table public.whatsapp_oficial_canais from anon, authenticated;
