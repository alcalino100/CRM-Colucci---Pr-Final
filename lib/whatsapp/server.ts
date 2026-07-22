import { createClient } from "@supabase/supabase-js"
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"

// Cliente Supabase server-side (sem sessão persistida)
export const wsupabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// Configuração da Evolution API. A chave fica em EVOLUTION_API_KEY_2 (com fallback).
export function evolutionConfig() {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "") ?? ""
  const key = process.env.EVOLUTION_API_KEY_2 || process.env.EVOLUTION_API_KEY || ""
  return { url, key, ok: Boolean(url && key) }
}

export function instanceNameFor(corretorId: string) {
  return `corretor-${corretorId.slice(0, 8)}`
}

// Só dígitos, para comparar telefones de forma consistente
export function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "")
}

// Mapeia o estado da Evolution para o status interno
export function mapConnectionState(state?: string): "conectado" | "conectando" | "desconectado" {
  if (state === "open") return "conectado"
  if (state === "connecting") return "conectando"
  return "desconectado"
}
