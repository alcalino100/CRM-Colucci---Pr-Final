import "server-only"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "./config"

// Client privilegiado do Supabase — usa a chave secreta, nunca a publishable.
// Só pode ser importado de código que roda no servidor (rotas de API, scripts).
// O import "server-only" acima faz o build falhar se isso vazar para o bundle do navegador.
const secretKey = process.env.SUPABASE_SECRET_KEY
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY não configurada. Defina essa variável de ambiente com a chave secreta do Supabase (Project Settings > API Keys).")
}

export const supabaseAdmin = createClient(SUPABASE_URL, secretKey, {
  auth: { persistSession: false },
})
