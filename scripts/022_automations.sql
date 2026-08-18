-- =============================================================================
-- 022_automations.sql — Módulo de Automações de Leads
-- CRM Colucci — Execute no SQL Editor do Supabase
-- =============================================================================

-- 1) Configurações globais de automação por organização
create table if not exists public.automation_global_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000' unique,
  default_timezone text not null default 'America/Sao_Paulo',
  default_supervisor_user_id uuid references public.usuarios(id) on delete set null,
  default_start_hour time not null default '08:00',
  default_end_hour time not null default '18:00',
  default_allowed_days jsonb not null default '[1,2,3,4,5]',
  default_max_daily_sends integer not null default 50,
  default_max_sends_per_lead integer not null default 3,
  default_min_interval_minutes integer not null default 10,
  default_retry_limit integer not null default 3,
  default_retry_interval_minutes integer not null default 30,
  system_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Templates de mensagem
create table if not exists public.automation_message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  name text not null,
  channel text not null default 'whatsapp',
  content_type text not null default 'text',
  content text not null,
  variables jsonb not null default '[]',
  media_url text,
  whatsapp_template_name text,
  status text not null default 'active',
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Automações (regras)
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  name text not null,
  slug text not null,
  description text,
  category text not null default 'reativacao',
  status text not null default 'draft',
  priority integer not null default 0,
  trigger_type text not null default 'lead_inactive',
  trigger_config jsonb not null default '{}',
  conditions jsonb not null default '{"mode":"and","rules":[]}',
  wait_config jsonb not null default '{"amount":10,"unit":"minutes"}',
  cancellation_rules jsonb not null default '{}',
  message_template_id uuid references public.automation_message_templates(id) on delete set null,
  whatsapp_connection_id uuid,
  supervision_enabled boolean not null default true,
  supervisor_user_id uuid references public.usuarios(id) on delete set null,
  keep_current_agent boolean not null default true,
  create_automatic_note boolean not null default true,
  automatic_note_template text default 'Automação {{nome_automacao}} enviada com sucesso em {{data_atual}} às {{hora_atual}}. Gestor {{nome_gestor}} assumiu a supervisão do lead.',
  limits_config jsonb not null default '{}',
  is_test_mode boolean not null default false,
  is_simulation_mode boolean not null default false,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists automations_org_idx on public.automations (organization_id);
create index if not exists automations_status_idx on public.automations (status);

-- 4) Jobs da fila (a tabela mais importante)
create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  automation_id uuid not null references public.automations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_agent_id uuid references public.usuarios(id) on delete set null,
  supervisor_user_id uuid references public.usuarios(id) on delete set null,
  status text not null default 'pending_validation',
  scheduled_at timestamptz not null,
  validated_at timestamptz,
  processing_started_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  responded_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  next_retry_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  cancellation_reason text,
  failure_reason text,
  failure_code text,
  cancellation_event_id uuid,
  message_content_rendered text,
  provider_message_id text,
  provider_response jsonb,
  last_human_interaction_at timestamptz,
  eligible_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  supervision_status text,
  supervision_applied_at timestamptz,
  supervision_error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists aj_org_idx on public.automation_jobs (organization_id);
create index if not exists aj_automation_idx on public.automation_jobs (automation_id);
create index if not exists aj_lead_idx on public.automation_jobs (lead_id);
create index if not exists aj_status_idx on public.automation_jobs (status);
create index if not exists aj_scheduled_idx on public.automation_jobs (scheduled_at);
create index if not exists aj_retry_idx on public.automation_jobs (next_retry_at);
create index if not exists aj_created_idx on public.automation_jobs (created_at);
create index if not exists aj_supervisor_idx on public.automation_jobs (supervisor_user_id);
create index if not exists aj_agent_idx on public.automation_jobs (assigned_agent_id);
-- Busca de jobs pendentes
create index if not exists aj_pending_idx on public.automation_jobs (status, scheduled_at) where status in ('scheduled', 'pending_validation', 'retrying');

-- 5) Logs de automação
create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  automation_id uuid references public.automations(id) on delete set null,
  job_id uuid references public.automation_jobs(id) on delete set null,
  lead_id uuid,
  event_type text not null,
  event_title text not null,
  event_description text,
  previous_status text,
  new_status text,
  actor_type text not null default 'system',
  actor_user_id uuid references public.usuarios(id) on delete set null,
  related_user_id uuid references public.usuarios(id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists al_org_idx on public.automation_logs (organization_id);
create index if not exists al_automation_idx on public.automation_logs (automation_id);
create index if not exists al_job_idx on public.automation_logs (job_id);
create index if not exists al_lead_idx on public.automation_logs (lead_id);
create index if not exists al_event_idx on public.automation_logs (event_type);
create index if not exists al_created_idx on public.automation_logs (created_at);

-- 6) Configurações por lead (pausa, bloqueio, contadores)
create table if not exists public.lead_automation_settings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  automation_paused boolean not null default false,
  automation_paused_reason text,
  automation_paused_at timestamptz,
  automation_paused_by uuid references public.usuarios(id) on delete set null,
  do_not_contact boolean not null default false,
  do_not_contact_reason text,
  last_automation_sent_at timestamptz,
  total_automation_messages_sent integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists las_lead_idx on public.lead_automation_settings (lead_id);

-- 7) RLS off (padrão do projeto)
alter table public.automation_global_settings disable row level security;
alter table public.automation_message_templates disable row level security;
alter table public.automations disable row level security;
alter table public.automation_jobs disable row level security;
alter table public.automation_logs disable row level security;
alter table public.lead_automation_settings disable row level security;

-- 8) Realtime
do $$ begin
  alter publication supabase_realtime add table public.automations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.automation_jobs;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.automation_logs;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.lead_automation_settings;
exception when duplicate_object then null; end $$;

-- 9) Configuração global padrão
insert into public.automation_global_settings (organization_id, system_enabled)
values ('00000000-0000-0000-0000-000000000000', true)
on conflict (organization_id) do nothing;

-- 10) Template de mensagem padrão para reativação de leads frios
insert into public.automation_message_templates (id, name, channel, content, variables, status)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Reativação Lead Frio — Tráfego Pago',
  'whatsapp',
  'Olá, {{primeiro_nome}}! Tudo bem? 😊

Recebemos seu interesse em imóveis e queremos entender melhor o que você procura.

Você ainda está buscando um imóvel em {{cidade_lead}}?

Se preferir, podemos te enviar algumas opções que combinam com o seu perfil.',
  '["primeiro_nome","nome_lead","nome_corretor","nome_imobiliaria","cidade_lead","empreendimento_interesse","origem_lead","telefone_lead","link_atendimento","data_atual","hora_atual"]',
  'active'
) on conflict (id) do nothing;

-- 11) Automação padrão: Reativação de Leads Frios — Tráfego Pago
insert into public.automations (
  id, name, slug, description, category, status, priority,
  trigger_type, trigger_config, conditions, wait_config,
  cancellation_rules, message_template_id,
  supervision_enabled, supervisor_user_id, keep_current_agent,
  create_automatic_note, limits_config
) values (
  'b0000000-0000-0000-0000-000000000001',
  'Reativação de Leads Frios — Tráfego Pago',
  'reativacao-leads-frios-trafego-pago',
  'Envia mensagem automática para leads de tráfego pago classificados como Frios que permaneceram sem interação do corretor por mais de 10 minutos na etapa Novo Lead.',
  'reativacao',
  'active',
  0,
  'lead_inactive',
  '{"check_interval_minutes": 1}',
  '{"mode":"and","rules":[{"field":"tag_origem","operator":"equals","value":"Tráfego Pago"},{"field":"status","operator":"equals","value":"novo"},{"field":"temperatura","operator":"equals","value":"frio"},{"field":"last_human_interaction_minutes","operator":"greater_than","value":10},{"field":"has_valid_phone","operator":"equals","value":true},{"field":"is_not_converted","operator":"equals","value":true},{"field":"is_not_lost","operator":"equals","value":true},{"field":"is_not_archived","operator":"equals","value":true},{"field":"automation_not_blocked","operator":"equals","value":true},{"field":"not_recently_automated","operator":"equals","value":true}]}',
  '{"amount":10,"unit":"minutes","allowed_start_hour":"08:00","allowed_end_hour":"18:00","allowed_days":[1,2,3,4,5],"timezone":"America/Sao_Paulo"}',
  '{"cancel_on_manual_message":true,"cancel_on_note":true,"cancel_on_stage_change":true,"cancel_on_responsible_change":true,"cancel_on_temperature_change":true,"cancel_on_tag_removed":true,"cancel_on_stage_left":true,"cancel_on_became_not_cold":true,"cancel_on_lead_replied":true,"cancel_on_lost":true,"cancel_on_converted":true,"cancel_on_archived":true,"cancel_on_automated_paused":true,"cancel_on_phone_invalid":true}',
  'a0000000-0000-0000-0000-000000000001',
  true,
  (select id from public.usuarios where nome = 'Patricia' limit 1),
  true,
  true,
  '{"max_sends_per_lead":3,"max_daily_sends":50,"min_interval_between_messages_minutes":60,"block_window_hours":24,"pause_on_failure_rate":30}'
) on conflict (id) do nothing;

-- 12) Trigger para atualizar updated_at automaticamente
create or replace function public.update_automation_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger automations_updated_at
  before update on public.automations
  for each row execute function public.update_automation_timestamp();

create trigger automation_jobs_updated_at
  before update on public.automation_jobs
  for each row execute function public.update_automation_timestamp();

create trigger automation_message_templates_updated_at
  before update on public.automation_message_templates
  for each row execute function public.update_automation_timestamp();

create trigger automation_global_settings_updated_at
  before update on public.automation_global_settings
  for each row execute function public.update_automation_timestamp();

create trigger lead_automation_settings_updated_at
  before update on public.lead_automation_settings
  for each row execute function public.update_automation_timestamp();
