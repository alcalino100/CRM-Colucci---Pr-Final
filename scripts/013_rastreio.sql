-- Ponte de rastreio: captura UTM/fbc/fbp/IP/UA do lead no clique do anúncio
-- e casa com a mensagem do WhatsApp (código no texto pré-preenchido).
create table if not exists public.rastreio_cliques (
  id uuid primary key default gen_random_uuid(),
  click_id text unique not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  ip text,
  user_agent text,
  fbc text,
  fbp text,
  fbclid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  telefone text,
  lead_id uuid,
  consumido boolean not null default false
);
alter table public.rastreio_cliques disable row level security;
grant all on table public.rastreio_cliques to anon, authenticated;

-- Campos de rastreio no lead (preenchidos no webhook a partir do clique)
alter table public.leads add column if not exists utm_campaign text;
alter table public.leads add column if not exists utm_adset text;
alter table public.leads add column if not exists utm_ad text;
alter table public.leads add column if not exists fbc text;
alter table public.leads add column if not exists fbp text;
alter table public.leads add column if not exists client_ip text;
alter table public.leads add column if not exists client_ua text;
