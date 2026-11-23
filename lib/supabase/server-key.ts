import { SUPABASE_KEY } from "./config"

/**
 * Chave do Supabase para código que roda NO SERVIDOR (rotas de API, webhook, crons e libs chamadas por eles).
 *
 * Usa a chave secreta (SUPABASE_SECRET_KEY): ela ignora RLS e permite trancar as tabelas para a chave PÚBLICA.
 * Sem a variável (testes, desenvolvimento local), cai na chave pública e o comportamento continua o mesmo de antes.
 *
 * NUNCA importe isto em componente de navegador. Mesmo que alguém importe por engano, o Next.js só embute variáveis
 * NEXT_PUBLIC_*: no navegador `SUPABASE_SECRET_KEY` é undefined e cai na chave pública, então nada vaza.
 */
export const SUPABASE_SERVER_KEY: string = process.env.SUPABASE_SECRET_KEY || SUPABASE_KEY
