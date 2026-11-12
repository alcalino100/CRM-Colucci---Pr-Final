-- =============================================================================
-- Migration: 20261112120000_fase4_performance_indexes.sql
-- FASE 4 — Índices de Performance para o CRM Colucci
-- 
-- ATENÇÃO: NÃO APLICAR DIRETAMENTE NO BANCO DE PRODUÇÃO SEM JANELA DE MANUTENÇÃO.
-- Este script foi gerado para revisão e aplicação via Supabase Dashboard ou CLI.
-- =============================================================================

-- 1. Leads: Filtro do Kanban por corretor e status ativo
-- Ganho esperado: Reduz o scan sequencial de leads por corretor de O(N) para index scan O(log N).
CREATE INDEX IF NOT EXISTS idx_leads_corretor_status_arquivado 
  ON public.leads (corretor_id, status, arquivado_em);

-- 2. Leads: Índice parcial para hibernação e reativação de leads arquivados
-- Utilizado pelo cron job diário /api/leads/reativar-arquivados.
-- Ganho esperado: Transforma uma varredura completa da tabela em busca de datas de reaparecimento
-- em uma busca direta por índice contendo apenas os leads hibernados (tamanho ínfimo do índice).
CREATE INDEX IF NOT EXISTS idx_leads_hibernacao_reaparecimento
  ON public.leads (data_reaparecimento)
  WHERE data_reaparecimento IS NOT NULL AND arquivado_em IS NOT NULL;

-- 3. Leads: Ordenação por data de criação e atualização (/cadastros e dashboards)
-- Ganho esperado: Elimina ordenação em memória (Sort key: criado_em DESC) em queries paginadas.
CREATE INDEX IF NOT EXISTS idx_leads_criado_em_desc 
  ON public.leads (criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_leads_atualizado_em_desc 
  ON public.leads (atualizado_em DESC);

-- 4. Conversas e Mensagens de IA (Inbox & Atendimento Automatizado)
-- Ganho esperado: Carregamento do histórico de conversas (/api/conversations/[id]/messages) 
-- sem table scan em messages_ia, permitindo renderização instantânea do chat.
CREATE INDEX IF NOT EXISTS idx_conversations_ia_ai_last_message 
  ON public.conversations_ia (ai_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_ia_conv_created 
  ON public.messages_ia (conversation_id, created_at DESC);

-- 5. Fila de Automações (Worker Dispatcher)
-- Utilizado pelo worker executado a cada minuto para buscar jobs agendados.
-- Ganho esperado: Busca de jobs prontos (scheduled/retrying) sem escanear todo o histórico de automações.
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status_scheduled 
  ON public.automation_jobs (status, scheduled_at ASC);

CREATE INDEX IF NOT EXISTS idx_automation_logs_job_lead 
  ON public.automation_logs (automation_id, lead_id, created_at DESC);

-- 6. Notificações por Usuário e Role
-- Utilizado no carregamento inicial de notificações da barra superior.
CREATE INDEX IF NOT EXISTS idx_notificacoes_destinatario_timestamp 
  ON public.notificacoes (para_usuario_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_notificacoes_role_timestamp 
  ON public.notificacoes (para_role, timestamp DESC);

-- 7. Métricas e Insights do Meta Ads
-- Utilizado nos dashboards de ROI e relatórios de tráfego pago.
CREATE INDEX IF NOT EXISTS idx_meta_insights_campaign_daily_camp_data 
  ON public.meta_insights_campaign_daily (campanha_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_meta_insights_ad_daily_ad_data 
  ON public.meta_insights_ad_daily (ad_id, data DESC);
