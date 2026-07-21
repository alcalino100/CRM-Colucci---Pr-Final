-- Integração Meta Ads: conexão OAuth (long-lived token) + vínculo lead↔campanha

-- 1) Conexão Meta Business (token guardado apenas no servidor; nunca exposto ao client)
create table if not exists public.meta_conexao (
  id int primary key default 1 check (id = 1), -- linha única
  access_token text not null,
  token_expira_em timestamptz,
  conectado_por text,
  atualizado_em timestamptz not null default now()
);

-- 2) Vínculo do lead com a hierarquia real do Meta (para origem "Tráfego Pago")
alter table public.leads add column if not exists meta_campaign_id text;
alter table public.leads add column if not exists meta_adset_id text;
alter table public.leads add column if not exists meta_ad_id text;
create index if not exists leads_meta_campaign_idx on public.leads (meta_campaign_id);
