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

// Transforma o nome do corretor em um slug seguro para nome de instância
export function slugify(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

// Nome da instância baseado no nome do corretor + sufixo do id (garante unicidade)
export function instanceNameFor(corretorId: string, nome?: string) {
  const base = nome ? slugify(nome) : ""
  const suffix = corretorId.slice(0, 8)
  return base ? `${base}-${suffix}` : `corretor-${suffix}`
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
