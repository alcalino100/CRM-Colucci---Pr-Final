-- =============================================================================
-- Migration 033: Arquivar lead com data de reaparecimento e reativação automática
-- Executar no Supabase SQL Editor (idempotente)
-- =============================================================================

-- 1. Campos de arquivamento com previsão de compra e reativação
alter table public.leads add column if not exists data_reaparecimento date;
alter table public.leads add column if not exists motivo_arquivamento text;
alter table public.leads add column if not exists observacao_arquivamento text;
alter table public.leads add column if not exists status_anterior text;
alter table public.leads add column if not exists reativado_em timestamptz;
alter table public.leads add column if not exists arquivado_por uuid references public.usuarios(id) on delete set null;
alter table public.leads add column if not exists reativacoes_count integer not null default 0;
alter table public.leads add column if not exists consentimento_contato boolean not null default true;
alter table public.leads add column if not exists sem_interesse_permanente boolean not null default false;

-- 2. Índices para performance na busca diária do job de reativação e tela de arquivados
create index if not exists idx_leads_arquivados_reaparecimento 
  on public.leads (arquivado_em, data_reaparecimento) 
  where arquivado_em is not null;

create index if not exists idx_leads_reativado_em 
  on public.leads (reativado_em) 
  where reativado_em is not null;

-- 3. Comentários explicativos
comment on column public.leads.data_reaparecimento is 'Data programada para o lead reaparecer no funil como novo lead (fuso America/Sao_Paulo)';
comment on column public.leads.motivo_arquivamento is 'Motivo selecionado: quer comprar em data futura, sem orçamento agora, sem interesse, outro';
comment on column public.leads.status_anterior is 'Status em que o lead se encontrava antes de ser arquivado';
comment on column public.leads.reativado_em is 'Data/hora da última reativação automática para identificação visual e avisos';
comment on column public.leads.reativacoes_count is 'Total de vezes que o lead foi arquivado e reativado no CRM';
comment on column public.leads.consentimento_contato is 'Indica se há consentimento LGPD ativo para contatar o lead';
comment on column public.leads.sem_interesse_permanente is 'Se verdadeiro, impede qualquer reativação automática futura';
