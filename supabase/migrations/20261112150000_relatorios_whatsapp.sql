-- ============================================================================
-- Migração: Relatórios Automáticos no WhatsApp (Envio Diário 08:00 + Painel de Controle)
-- Arquivo: supabase/migrations/20261112150000_relatorios_whatsapp.sql
--
-- ATENÇÃO (Regra Inegociável #3):
-- Este script foi GERADO para revisão e NÃO deve ser executado diretamente em produção.
-- Para aplicar: execute via Supabase Dashboard (SQL Editor) ou CLI de migração após validação.
-- ============================================================================

-- 1. Tabela de Configuração Geral dos Relatórios
CREATE TABLE IF NOT EXISTS public.relatorio_config (
  id text PRIMARY KEY DEFAULT 'main',
  ativo boolean NOT NULL DEFAULT true,
  hora_envio time NOT NULL DEFAULT '08:00',
  dias_semana integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0=Domingo, 1=Segunda, ..., 6=Sábado
  instance_name text NULL,                                  -- Instância da Evolution API selecionada para envio
  secoes jsonb NOT NULL DEFAULT '{"trafego":true,"automacao":true,"ia":true,"arquivados":true,"tempo":true}'::jsonb,
  incluir_gestores_no_tempo boolean NOT NULL DEFAULT false,
  listar_nomes_leads boolean NOT NULL DEFAULT false,         -- Padrão FALSE por privacidade / LGPD
  resumo_ia boolean NOT NULL DEFAULT false,
  limite_tentativa time NOT NULL DEFAULT '12:00',           -- Limite para retentativa do dia
  updated_by text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Linha padrão garantida (id = 'main')
INSERT INTO public.relatorio_config (id, ativo, hora_envio, dias_semana, secoes, incluir_gestores_no_tempo, listar_nomes_leads, resumo_ia)
VALUES (
  'main',
  true,
  '08:00',
  '{0,1,2,3,4,5,6}',
  '{"trafego":true,"automacao":true,"ia":true,"arquivados":true,"tempo":true}'::jsonb,
  false,
  false,
  false
)
ON CONFLICT (id) DO NOTHING;

-- 2. Tabela de Destinatários dos Relatórios (Números ou Grupos)
CREATE TABLE IF NOT EXISTS public.relatorio_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('numero', 'grupo')),
  destino text NOT NULL, -- Telefone com DDI 55 (somente dígitos) ou JID do WhatsApp (@g.us)
  ativo boolean NOT NULL DEFAULT true,
  secoes jsonb NULL,     -- Overrides por destinatário; NULL ou vazio = herda da config geral
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relatorio_destinatarios_ativo ON public.relatorio_destinatarios (ativo);

-- 3. Tabela de Histórico e Auditoria de Envios
CREATE TABLE IF NOT EXISTS public.relatorio_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,                             -- Data do relatório enviado (dia anterior, YYYY-MM-DD)
  destinatario_id uuid NULL REFERENCES public.relatorio_destinatarios(id) ON DELETE SET NULL,
  instance_name text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('automatico', 'teste', 'reenvio')),
  status text NOT NULL CHECK (status IN ('enviado', 'falhou', 'pulado')),
  erro text NULL,
  texto text NOT NULL,
  secoes_enviadas text[] NOT NULL DEFAULT '{}',
  metricas jsonb NOT NULL DEFAULT '{}'::jsonb,              -- Snapshot exato dos números consolidados
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relatorio_envios_data_ref ON public.relatorio_envios (data_referencia DESC);
CREATE INDEX IF NOT EXISTS idx_relatorio_envios_destinatario ON public.relatorio_envios (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_relatorio_envios_status ON public.relatorio_envios (status);

-- Índice único parcial garantindo IDEMPOTÊNCIA absoluta para envios automáticos
-- Evita envio duplicado para o mesmo destinatário na mesma data de referência em caso de concorrência
CREATE UNIQUE INDEX IF NOT EXISTS idx_relatorio_envios_auto_unique 
  ON public.relatorio_envios (data_referencia, destinatario_id) 
  WHERE origem = 'automatico' AND status = 'enviado';

-- 4. Segurança: Row Level Security (RLS)
-- Todas as tabelas têm RLS ativado e zero policies públicas para anon/authenticated.
-- O acesso deve ser feito exclusivamente no servidor via getSupabaseAdmin() (chave service_role).
ALTER TABLE public.relatorio_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorio_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorio_envios ENABLE ROW LEVEL SECURITY;
