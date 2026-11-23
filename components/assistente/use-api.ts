"use client"

import { useCallback, useEffect, useState } from "react"

/** Carrega JSON de uma rota do assistente. `fonte` diz se os dados vêm do banco ou são demonstração. */
export function useApi<T>(url: string) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch(url, { cache: "no-store" })
      const j = await r.json()
      if (r.status === 401) throw new Error("Sua sessão precisa ser renovada: saia do CRM e entre novamente.")
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar")
      setDados(j as T)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar")
    } finally {
      setCarregando(false)
    }
  }, [url])

  useEffect(() => { recarregar() }, [recarregar])
  return { dados, erro, carregando, recarregar }
}

export function quandoRelativo(iso: string, agora = Date.now()): string {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000))
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`
}
