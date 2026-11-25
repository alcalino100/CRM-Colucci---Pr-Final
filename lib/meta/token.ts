import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "@/lib/supabase/config"
import { SUPABASE_SERVER_KEY } from "@/lib/supabase/server-key"

export const META_VERSAO = process.env.META_API_VERSION || "v26.0"
export const META_BASE = `https://graph.facebook.com/${META_VERSAO}`

/** Token da Meta: conexão OAuth salva (meta_conexao) → variável de ambiente. Nunca vai ao navegador. */
export async function resolverTokenMeta(): Promise<string | null> {
  try {
    const { data } = await createClient(SUPABASE_URL, SUPABASE_SERVER_KEY).from("meta_conexao").select("access_token").eq("id", 1).maybeSingle()
    if (data?.access_token) return data.access_token
  } catch { /* tabela pode não existir */ }
  const raw = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  return raw?.trim().replace(/^['"]+|['"]+$/g, "") || null
}
