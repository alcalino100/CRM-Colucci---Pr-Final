import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "./config"

// Client privilegiado do Supabase — usa a chave secreta, nunca a publishable.
// Só pode ser importado de código que roda no servidor (rotas de API, scripts).
// O import "server-only" acima faz o build falhar se isso vazar para o bundle do navegador.
let _adminClient: SupabaseClient<any, any, any> | null = null

export function getSupabaseAdmin(): SupabaseClient<any, any, any> {
  if (!_adminClient) {
    const secretKey = process.env.SUPABASE_SECRET_KEY
    if (!secretKey) {
      throw new Error(
        "SUPABASE_SECRET_KEY não configurada. Defina essa variável de ambiente com a chave secreta do Supabase (Project Settings > API Keys)."
      )
    }
    _adminClient = createClient(SUPABASE_URL, secretKey, {
      auth: { persistSession: false },
    })
  }
  return _adminClient
}

export const supabaseAdmin = new Proxy({} as SupabaseClient<any, any, any>, {
  get(_target, prop) {
    const client = getSupabaseAdmin()
    const value = (client as any)[prop]
    return typeof value === "function" ? value.bind(client) : value
  },
})
