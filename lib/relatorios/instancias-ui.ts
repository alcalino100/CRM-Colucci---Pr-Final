// lib/relatorios/instancias-ui.ts
// Lista de instâncias WhatsApp para o seletor da tela de relatórios.

export interface InstanciaOpcao {
  instance_name: string
  status: string
  numero?: string | null
  corretorNome?: string | null
}

/** "HH:mm:ss" (coluna `time` do banco) → "HH:mm", que é o que o campo de hora da tela entende. */
export function horaParaCampo(valor: string | null | undefined, padrao: string): string {
  return typeof valor === "string" && /^\d{2}:\d{2}/.test(valor) ? valor.slice(0, 5) : padrao
}

/**
 * A API /api/whatsapp/instancias responde { data: [...] }. A tela esperava { ok, instancias } e a lista
 * nunca carregava (só aparecia "Automático"). Aceita os dois formatos.
 */
export function extrairInstancias(json: unknown): InstanciaOpcao[] {
  const bruto = json as { data?: unknown; instancias?: unknown } | null
  const lista = Array.isArray(bruto?.data) ? bruto.data : Array.isArray(bruto?.instancias) ? bruto.instancias : []
  return (lista as Array<Record<string, unknown>>)
    .filter((i) => typeof i?.instance_name === "string" && i.instance_name.length > 0)
    .map((i) => ({
      instance_name: i.instance_name as string,
      status: typeof i.status === "string" ? i.status : "desconhecido",
      numero: typeof i.numero === "string" ? i.numero : null,
      corretorNome: typeof i.corretorNome === "string" && i.corretorNome !== "—" ? i.corretorNome : null,
    }))
}

export function instanciaConectada(status: string): boolean {
  return ["conectado", "open", "connected"].includes(status)
}

/** Ex.: "Patrícia · patricia-6c2875b4 · 5518991976332 (conectado)". */
export function rotuloInstancia(i: InstanciaOpcao): string {
  return [i.corretorNome, i.instance_name, i.numero].filter(Boolean).join(" · ") + ` (${i.status})`
}
