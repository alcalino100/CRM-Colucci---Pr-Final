-- Painel Master (white-label): identidade visual + links do workspace.
-- Rode UMA VEZ no SQL Editor do Supabase. Seguro re-rodar (if not exists).
create table if not exists public.workspace_settings (
  id text primary key,
  brand_name text not null default 'Colucci Imóveis',
  logo_url text,
  cor_primaria text not null default '#b22222',
  links jsonb not null default '{"site":"","instagram":"","suporte":""}',
  updated_at timestamptz not null default now()
);

insert into public.workspace_settings (id)
values ('main')
on conflict (id) do nothing;
