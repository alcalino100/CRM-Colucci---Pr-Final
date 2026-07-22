-- Integração WhatsApp (Evolution API)
-- Tabelas: instâncias por corretor + mensagens recebidas

create table if not exists whatsapp_instancias (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references usuarios(id) on delete cascade,
  instance_name text not null unique,
  numero text,
  status text not null default 'desconectado',
  qr_code text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Uma instância por corretor (permite upsert onConflict = corretor_id)
create unique index if not exists whatsapp_instancias_corretor_uidx
  on whatsapp_instancias (corretor_id);

create table if not exists whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  instance_name text not null,
  telefone text not null,
  nome_contato text,
  corpo text,
  lead_id uuid,
  veio_de_anuncio boolean not null default false,
  anuncio_id text,
  anuncio_titulo text,
  criado_em timestamptz not null default now()
);

create index if not exists whatsapp_mensagens_telefone_idx
  on whatsapp_mensagens (telefone);

-- Colunas de contexto de anúncio (idempotente para bases que já criaram a tabela)
alter table whatsapp_mensagens add column if not exists veio_de_anuncio boolean not null default false;
alter table whatsapp_mensagens add column if not exists anuncio_id text;
alter table whatsapp_mensagens add column if not exists anuncio_titulo text;

-- Realtime
do $$
begin
  alter publication supabase_realtime add table whatsapp_instancias;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table whatsapp_mensagens;
exception when duplicate_object then null;
end $$;
