-- =============================================================================
-- 026_automacao_followup.sql — 2ª automação: follow-up de leads sem resposta
-- Rodar SOMENTE depois que o worker novo (com a Fase 1-B de follow-up) estiver no ar.
-- =============================================================================

-- Template da mensagem de follow-up (voz da Patrícia, coerente com a 1ª automação)
insert into public.automation_message_templates (id, name, channel, content, variables, status)
values (
  'a0000000-0000-0000-0000-000000000002',
  'Follow-up — Leads sem resposta',
  'whatsapp',
  'Oi {{primeiro_nome}}, tudo bem? 😊

Passando aqui só pra saber se você ainda tem interesse em ver algumas opções de imóveis que separei pra você.

Se quiser, é só me responder que já te encaminho — sem compromisso!',
  '["primeiro_nome","nome_lead","cidade_lead","origem_lead","telefone_lead","data_atual","hora_atual"]',
  'active'
) on conflict (id) do nothing;

-- Automação de follow-up. Gatilho próprio: pega os jobs da automação-mãe (a de reativação)
-- que foram enviados e não tiveram resposta há mais de 24h. O worker cria os jobs; o envio
-- reusa o fluxo normal, respeitando horário comercial e o teto diário.
insert into public.automations (
  id, name, slug, description, category, status, priority,
  trigger_type, trigger_config, conditions, wait_config,
  cancellation_rules, message_template_id, whatsapp_connection_id,
  supervision_enabled, supervisor_user_id, keep_current_agent,
  create_automatic_note, limits_config
) values (
  'b0000000-0000-0000-0000-000000000002',
  'Follow-up — Leads sem resposta (Patricia)',
  'followup-leads-sem-resposta',
  'Reenvia uma mensagem para os leads que receberam a 1ª automação de reativação e não responderam em 24h. Máximo 1 follow-up por lead; cancela se o lead responder.',
  'follow_up',
  'active',
  1,
  'no_response_followup',
  '{"parent_automation_id":"b0000000-0000-0000-0000-000000000001","no_response_hours":24}',
  '{"mode":"and","rules":[]}',
  '{"amount":0,"unit":"minutes","allowed_start_hour":"08:00","allowed_end_hour":"18:00","allowed_days":[1,2,3,4,5],"timezone":"America/Sao_Paulo"}',
  '{"cancel_on_manual_message":true,"cancel_on_lead_replied":true,"cancel_on_stage_change":true,"cancel_on_lost":true,"cancel_on_converted":true,"cancel_on_archived":true}',
  'a0000000-0000-0000-0000-000000000002',
  'cf0b4d97-b783-4c1e-9507-a18214071cd5',
  false,
  '6c2875b4-0d11-4370-b9fd-3c13b5257bd4',
  true,
  false,
  '{"max_sends_per_lead":1,"max_daily_sends":50,"min_interval_between_messages_minutes":60}'
) on conflict (id) do nothing;
