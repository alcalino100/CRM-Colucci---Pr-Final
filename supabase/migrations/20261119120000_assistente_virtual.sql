-- Assistente Virtual (Colucci Conecta 360° · item 5.4): configuração, conversas, mensagens e eventos.
-- ATENÇÃO (Regra Inegociável #3): gerado para revisão; aplicar via Supabase Dashboard (SQL Editor).
-- Idempotente (IF NOT EXISTS). Sem dados pessoais sensíveis em claro: o estado da conversa guarda só
-- os 4 últimos dígitos do CPF/CNPJ (mascarado pela aplicação); e-mail e telefone completo do cliente do
-- Immobillis NÃO são gravados no estado.
-- LGPD: as 3 tabelas ficam com RLS LIGADO e SEM políticas = inacessíveis pela chave pública (anon);
-- só o servidor (chave secreta) lê/escreve. Defina uma política de retenção (ex.: apagar mensagens > 12 meses).

CREATE TABLE IF NOT EXISTS public.assistente_config (
  id            text PRIMARY KEY DEFAULT 'main',
  ativo         boolean NOT NULL DEFAULT false,            -- chave geral: desligada por padrão
  instancias    text[]  NOT NULL DEFAULT '{}',             -- instâncias WhatsApp em que o assistente atende
  numeros_teste text[]  NOT NULL DEFAULT '{}',             -- números que sempre podem usar (modo teste)
  capacidades   jsonb   NOT NULL DEFAULT '{"boleto":true,"informe":true,"reajuste":true,"contrato":true,"faq":true}',
  usar_ia       boolean NOT NULL DEFAULT false,            -- humaniza as respostas com Claude
  ai_agent_id   text,                                      -- agente da IA Conversacional de onde reaproveitar chave/modelo do Claude
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.assistente_config (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.assistente_conversas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone        text NOT NULL,
  instance_name   text NOT NULL DEFAULT '',
  estado          jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'ativa'
                  CHECK (status IN ('ativa','resolvida_ia','transferida','humano','encerrada')),
  intencao_atual  text,
  cliente_nome    text,
  cliente_perfil  text,
  protocolo       text,
  departamento    text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  ultima_msg_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistente_conversas_tel ON public.assistente_conversas (telefone, instance_name, ultima_msg_em DESC);
CREATE INDEX IF NOT EXISTS idx_assistente_conversas_criado ON public.assistente_conversas (criado_em DESC);

CREATE TABLE IF NOT EXISTS public.assistente_mensagens (
  id           bigserial PRIMARY KEY,
  conversa_id  uuid NOT NULL REFERENCES public.assistente_conversas(id) ON DELETE CASCADE,
  papel        text NOT NULL CHECK (papel IN ('cliente','assistente','sistema')),
  conteudo     text NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistente_mensagens_conv ON public.assistente_mensagens (conversa_id, criado_em);

CREATE TABLE IF NOT EXISTS public.assistente_eventos (
  id           bigserial PRIMARY KEY,
  conversa_id  uuid NOT NULL REFERENCES public.assistente_conversas(id) ON DELETE CASCADE,
  tipo         text NOT NULL,
  dados        jsonb NOT NULL DEFAULT '{}',
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistente_eventos_conv ON public.assistente_eventos (conversa_id, criado_em);

ALTER TABLE public.assistente_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistente_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistente_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistente_eventos   ENABLE ROW LEVEL SECURITY;
