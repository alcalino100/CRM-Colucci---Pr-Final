-- Tags para leads (teste-ia, novo lead, em atendimento, follow-up, etc.)
alter table public.leads add column if not exists tags text[] not null default array[]::text[];
create index if not exists idx_leads_tags on public.leads using gin (tags);
create index if not exists idx_leads_telefone_tags on public.leads(telefone) where tags @> array['teste-ia'];
