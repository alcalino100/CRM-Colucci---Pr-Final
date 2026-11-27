/** Textos de ajuda sobre o estado do número na Meta (puros: usados no servidor e na tela). */
export type Gravidade = "ok" | "atencao" | "erro"

export function explicarNomeExibicao(status: string | null | undefined, novo?: string | null, statusNovo?: string | null): { gravidade: Gravidade; titulo: string; ajuda: string } {
  const s = (status ?? "").toUpperCase()
  const sn = (statusNovo ?? "").toUpperCase()
  if (novo && sn === "PENDING_REVIEW") return { gravidade: "atencao", titulo: `Novo nome "${novo}" em análise`, ajuda: "A Meta está analisando o nome enviado. Costuma levar de algumas horas a 2 dias úteis. Enquanto isso o envio pode ser recusado (erro 131037)." }
  if (novo && sn === "DECLINED") return { gravidade: "erro", titulo: `Novo nome "${novo}" recusado`, ajuda: "Envie outro nome que corresponda à empresa (ex.: Colucci Imóveis), sem frases, telefone, só maiúsculas ou termos genéricos." }
  switch (s) {
    case "APPROVED": return { gravidade: "ok", titulo: "Nome de exibição aprovado", ajuda: "O número já pode enviar mensagens." }
    case "AVAILABLE_WITHOUT_REVIEW": return { gravidade: "ok", titulo: "Nome disponível (sem revisão)", ajuda: "O número já pode enviar mensagens." }
    case "PENDING_REVIEW": return { gravidade: "atencao", titulo: "Nome de exibição em análise", ajuda: "Aguarde a aprovação da Meta (horas a 2 dias úteis). Até lá o envio é recusado com o erro 131037." }
    case "DECLINED": return { gravidade: "erro", titulo: "Nome de exibição recusado", ajuda: "No WhatsApp Manager › Números de telefone, edite o nome para corresponder à empresa e envie de novo." }
    case "EXPIRED": return { gravidade: "erro", titulo: "Nome de exibição expirado", ajuda: "Reenvie o nome para análise no WhatsApp Manager." }
    case "NONE": case "": return { gravidade: "erro", titulo: "Sem nome de exibição aprovado", ajuda: "No WhatsApp Manager › Números de telefone, cadastre o nome de exibição (ex.: Colucci Imóveis) e aguarde a aprovação. Pode exigir a verificação da empresa." }
    default: return { gravidade: "atencao", titulo: `Nome de exibição: ${status}`, ajuda: "Estado não mapeado; confira no WhatsApp Manager." }
  }
}

export function explicarStatusNumero(status: string | null | undefined): { gravidade: Gravidade; titulo: string } {
  switch ((status ?? "").toUpperCase()) {
    case "CONNECTED": return { gravidade: "ok", titulo: "Número conectado" }
    case "PENDING": return { gravidade: "atencao", titulo: "Número pendente de registro" }
    case "FLAGGED": return { gravidade: "atencao", titulo: "Número sinalizado (qualidade baixa)" }
    case "RESTRICTED": return { gravidade: "erro", titulo: "Número restrito (limite atingido)" }
    case "BANNED": return { gravidade: "erro", titulo: "Número banido" }
    case "DISCONNECTED": case "UNVERIFIED": case "MIGRATED": return { gravidade: "erro", titulo: `Número ${String(status).toLowerCase()}` }
    default: return { gravidade: "atencao", titulo: status ? `Status: ${status}` : "Status desconhecido" }
  }
}

export const LIMITE_LEGIVEL: Record<string, string> = { TIER_50: "50 conversas/24h", TIER_250: "250 conversas/24h", TIER_1K: "1.000 conversas/24h", TIER_10K: "10.000 conversas/24h", TIER_100K: "100.000 conversas/24h", TIER_UNLIMITED: "ilimitado" }
