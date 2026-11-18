-- Relatório diário: cada destinatário pode receber só uma equipe (Vendas / Locação) ou corretores escolhidos.
-- ATENÇÃO (Regra Inegociável #3): gerado para revisão; aplicar via Supabase Dashboard (SQL Editor).
-- NULL = todos os corretores (comportamento atual). Formato: {"modo":"todos|vendas|locacao|selecionados","ids":["<usuario_id>", ...]}
ALTER TABLE public.relatorio_destinatarios
  ADD COLUMN IF NOT EXISTS equipe_filtro jsonb NULL;
