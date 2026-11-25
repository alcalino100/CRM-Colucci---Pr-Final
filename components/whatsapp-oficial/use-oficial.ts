"use client"
import { useCallback, useEffect, useState } from "react"

export type Canal = { id: string; nome: string; phone_number_id: string; waba_id: string | null; numero: string | null; nome_verificado: string | null; qualidade: string | null; ativo: boolean; modo?: string; ai_agent_id?: string | null }
export type DadosOficial = { canais: Canal[]; agentes: { id: string; name: string }[]; configuracao: { token: boolean; appSecret: boolean; verifyToken: boolean }; webhookUrl: string; aviso?: string }

/** Carrega canais, agentes e estado do servidor da API oficial (uma fonte para todas as abas). */
export function useOficial() {
  const [dados, setDados] = useState<DadosOficial | null>(null)
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/oficial/canais")
      const j = await r.json()
      if (r.ok) setDados({ canais: j.canais ?? [], agentes: j.agentes ?? [], configuracao: j.configuracao, webhookUrl: j.webhookUrl, aviso: j.aviso })
    } catch { /* mantém o último estado */ }
    setCarregando(false)
  }, [])
  useEffect(() => { void recarregar() }, [recarregar])
  return { dados, carregando, recarregar }
}

export async function chamar(url: string, metodo: string, corpo?: unknown): Promise<{ ok: boolean; erro?: string; [k: string]: any }> {
  try {
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
    return await r.json()
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede" }
  }
}
