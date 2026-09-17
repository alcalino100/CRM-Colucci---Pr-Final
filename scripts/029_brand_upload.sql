-- Master Marca v2: favicon + fontes + bucket de upload da marca.
-- Rode UMA VEZ no SQL Editor. Seguro re-rodar.
alter table public.workspace_settings
  add column if not exists favicon_url text,
  add column if not exists fonte_titulo text not null default 'Space Grotesk',
  add column if not exists fonte_texto text not null default 'Inter';

-- Bucket público para logo/favicon (upload via API master com service key).
insert into storage.buckets (id, name, public)
values ('brand', 'brand', true)
on conflict (id) do nothing;
