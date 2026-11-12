/**
 * Projeções de colunas canônicas para consultas Supabase.
 * Elimina o uso de `select("*")` em consultas de produção, garantindo
 * menor tráfego de rede, serialização mais rápida e maior segurança.
 *
 * NOTA: Cada projeção é declarada com `as const` para que o parser estático de tipos
 * do PostgREST infira os campos exatos em tempo de compilação sem gerar GenericStringError.
 */

export const LEAD_COLUMNS =
  "id, nome, telefone, email, referencia_imovel, referencias, temperatura, ref_proposta, ref_fechamento, tipo_imovel_vendido, meta_campaign_id, meta_adset_id, meta_ad_id, utm_campaign, utm_adset, utm_ad, fbc, fbp, origem, observacoes, status, valor_proposta, valor_comissao, corretor_id, gestor_responsavel, arquivado_em, data_reaparecimento, motivo_arquivamento, observacao_arquivamento, status_anterior, reativado_em, arquivado_por, reativacoes_count, consentimento_contato, sem_interesse_permanente, fechado_em, negociando_em, criado_em, atualizado_em, workspace_id" as const

export const VISITAS_COLUMNS =
  "id, lead_id, data, horario, corretor_id, referencias, observacoes, workspace_id" as const

export const NOTIFICACOES_COLUMNS =
  "id, texto, mensagem, tipo, para_role, para_usuario_id, lead_id, lida_por, criado_em, titulo, prioridade, origem, criado_por, criado_por_nome, modulo, workspace_id, timestamp, lida, usuario_id" as const

export const LOCACAO_LEADS_COLUMNS =
  "id, nome, telefone, email, referencia_imovel, referencias, temperatura, origem, observacoes, status, tipo_imovel_desejado, bairros_desejados, aluguel_max, quartos, garantia, vagas, metragem_min, aceita_condominio, salas, atividade_comercial, valor_proposta, valor_comissao, corretor_id, gestor_responsavel, criado_em, atualizado_em, arquivado_em, locado_em, negociando_em" as const

export const LOCACAO_VISITAS_COLUMNS =
  "id, lead_id, data, horario, corretor_id, gestor_responsavel, referencias, observacoes, criado_em" as const

export const JUSTIFICATIVAS_COLUMNS =
  "id, lead_id, motivo, observacao, etapa, usuario_id, autor_id, autor_nome, criado_em" as const

export const OBSERVACOES_QUALIDADE_COLUMNS =
  "id, lead_id, autor_id, autor_nome, texto, criado_em" as const

export const AUDITORIA_COLUMNS =
  "id, lead_id, lead_nome, usuario_nome, tipo, descricao, referencias, motivo, motivo_detalhe, criado_em" as const

export const AI_AGENTS_COLUMNS =
  "id, name, description, bot_template, channels, response_mode, wait_time_ms, message_cap, api_token, api_endpoint, model_name, system_prompt, additional_instructions, brand_voice, handoff_rules, is_active, config, account_id, created_at, updated_at" as const

export const CONVERSATIONS_IA_COLUMNS =
  "id, ai_id, contact_id, channel, external_id, status, ai_responding, started_at, last_message_at, closed_at, escalation_reason, last_user_message_at, test_mode" as const

export const MESSAGES_IA_COLUMNS =
  "id, conversation_id, role, content, metadata, created_at" as const

export const AUTOMATIONS_COLUMNS =
  "id, organization_id, name, slug, description, category, status, priority, trigger_type, trigger_config, conditions, wait_config, cancellation_rules, message_template_id, whatsapp_connection_id, supervision_enabled, supervisor_user_id, keep_current_agent, create_automatic_note, automatic_note_template, limits_config, is_test_mode, is_simulation_mode, created_by, created_at, updated_at" as const

export const AUTOMATION_JOBS_COLUMNS =
  "id, organization_id, automation_id, lead_id, assigned_agent_id, supervisor_user_id, status, scheduled_at, validated_at, processing_started_at, sent_at, delivered_at, read_at, responded_at, cancelled_at, failed_at, next_retry_at, attempts, max_attempts, cancellation_reason, failure_reason, failure_code, cancellation_event_id, message_content_rendered, created_at, updated_at" as const

export const AUTOMATION_LOGS_COLUMNS =
  "id, job_id, automation_id, lead_id, status, message, created_at" as const

export const AUTOMATION_TEMPLATES_COLUMNS =
  "id, organization_id, name, channel, content_type, content, variables, media_url, whatsapp_template_name, status, created_by, created_at, updated_at, workspace_id" as const

export const AUTOMATION_GLOBAL_SETTINGS_COLUMNS =
  "id, organization_id, default_timezone, default_supervisor_user_id, default_start_hour, default_end_hour, default_allowed_days, default_max_daily_sends, default_max_sends_per_lead, default_min_interval_minutes, default_retry_limit, default_retry_interval_minutes, system_enabled, created_at, updated_at" as const

export const LEAD_AUTOMATION_SETTINGS_COLUMNS =
  "id, lead_id, organization_id, automation_paused, automation_paused_reason, automation_paused_at, automation_paused_by, do_not_contact, do_not_contact_reason, last_automation_sent_at, total_automation_messages_sent, created_at, updated_at" as const

export const ESCALATION_TRIGGERS_COLUMNS =
  "id, name, condition, detection_keywords, action, notification_channels, assign_to, ai_id, created_at" as const

export const GOALS_COLUMNS =
  "id, name, description, type, prompt, questions, ai_id, is_active, config, created_at" as const

export const KNOWLEDGE_BASES_COLUMNS =
  "id, name, description, vector_store_id, ai_id, created_at, updated_at" as const

export const DOCUMENTS_COLUMNS =
  "id, name, type, url, content, file_size, knowledge_base_id, uploaded_at, chunks_count" as const

export const WHATSAPP_INSTANCIAS_COLUMNS =
  "id, corretor_id, instance_name, numero, status, qr_code, criado_em, atualizado_em, notif_grupo, workspace_id" as const

export const META_INSIGHTS_CAMPAIGN_COLUMNS =
  "id, campanha_id, adset_id, ad_id, data, gasto, impressoes, cliques, mensagens_iniciadas" as const

export const META_INSIGHTS_ADSET_COLUMNS =
  "id, campanha_id, adset_id, ad_id, data, gasto, impressoes, cliques, mensagens_iniciadas" as const

export const META_INSIGHTS_AD_COLUMNS =
  "id, campanha_id, adset_id, ad_id, data, gasto, impressoes, cliques, mensagens_iniciadas" as const

export const META_ORCAMENTO_COLUMNS =
  "id, valor_mensal, mes_ano, atualizado_em" as const

export const META_EVENT_LOGS_COLUMNS =
  "id, event_id, event_name, pixel_id, origem, lead_id, nome, telefone_mascarado, valor, corretor_id, campaign_id, adset_id, ad_id, status, http_status, events_received, meta_code, meta_message, event_time, criado_em" as const

export const PIPELINE_STAGES_COLUMNS =
  "id, workspace_id, key, nome, label, ordem, cor, variant, accent, visivel_corretor, ativo, sistema" as const

export const RASTREIO_CLIQUES_COLUMNS =
  "id, click_id, criado_em, expira_em, ip, user_agent, fbc, fbp, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, meta_campaign_id, meta_adset_id, meta_ad_id, telefone, lead_id" as const

export const WORKSPACE_SETTINGS_COLUMNS =
  "id, brand_name, logo_url, favicon_url, cor_primaria, sidebar_bg, sidebar_fg, sidebar_accent, fonte_titulo, fonte_texto, links, updated_at, workspace_id" as const
