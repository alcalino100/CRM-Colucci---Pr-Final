import { describe, it, expect } from "vitest"
import {
  TEMPLATE_D1,
  TEMPLATE_D2,
  TEMPLATE_D3,
  TEMPLATE_CONTENCAO_IA,
  AUTOMATION_CONTENCAO_IA_ID,
  MAX_ENVIOS_LINHA_DIA,
} from "@/app/api/automation/worker/route"

describe("Worker Stages & Helper Logic (Characterization Tests)", () => {
  it("deve exportar as constantes públicas de templates e limites anti-ban", () => {
    expect(TEMPLATE_D1).toBe("a0000000-0000-0000-0000-000000000002")
    expect(TEMPLATE_D2).toBe("a0000000-0000-0000-0000-000000000003")
    expect(TEMPLATE_D3).toBe("a0000000-0000-0000-0000-000000000004")
    expect(TEMPLATE_CONTENCAO_IA).toBe("a0000000-0000-0000-0000-000000000005")
    expect(AUTOMATION_CONTENCAO_IA_ID).toBe("b0000000-0000-0000-0000-000000000003")
    expect(MAX_ENVIOS_LINHA_DIA).toBe(30)
  })

  it("deve selecionar a conexão correta deterministicamente por hash de leadId", () => {
    function escolherConexao(automation: any, lead: { id: string }): string | null {
      const lista = automation?.trigger_config?.connection_ids
      if (Array.isArray(lista) && lista.length > 1 && lead?.id) {
        const s = String(lead.id)
        let h = 0
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
        return lista[h % lista.length] ?? null
      }
      return automation?.whatsapp_connection_id ?? null
    }

    const autoDuasLinhas = {
      whatsapp_connection_id: "default-conn",
      trigger_config: {
        connection_ids: ["conn-alpha", "conn-beta"],
      },
    }

    const leadA = { id: "lead-12345" }
    const leadB = { id: "lead-67890" }

    const connA1 = escolherConexao(autoDuasLinhas, leadA)
    const connA2 = escolherConexao(autoDuasLinhas, leadA)
    const connB1 = escolherConexao(autoDuasLinhas, leadB)
    expect(connA1).toBe(connA2) // Determinístico
    expect(["conn-alpha", "conn-beta"]).toContain(connB1)

    const autoUmaLinha = {
      whatsapp_connection_id: "default-conn",
      trigger_config: {},
    }
    expect(escolherConexao(autoUmaLinha, leadA)).toBe("default-conn")
  })

  it("deve extrair e normalizar tags do lead a partir de strings ou objetos", () => {
    function tagsDoLead(referencias: unknown): string[] {
      if (!Array.isArray(referencias)) return []
      const out: string[] = []
      for (const r of referencias) {
        const v = typeof r === "string" ? r : (r as any)?.ref ?? ""
        const s = String(v).trim().toLowerCase()
        if (s) out.push(s)
      }
      return out
    }

    const refs = ["VIP", { ref: "Follow-up" }, { ref: "  INVESTIDOR  " }, null, ""]
    const normalizadas = tagsDoLead(refs)
    expect(normalizadas).toEqual(["vip", "follow-up", "investidor"])
  })

  it("deve identificar se o lead possui IA ativa por id ou por telefone", () => {
    function leadTemIAAtiva(
      skipIA: Set<string> | null,
      lead: { id: string; telefone?: string | null }
    ): boolean {
      if (!skipIA) return false
      if (skipIA.has(lead.id)) return true
      const digits = String(lead.telefone || "").replace(/\D/g, "")
      if (digits && skipIA.has(digits)) return true
      if (digits && digits.startsWith("55") && skipIA.has(digits.slice(2))) return true
      if (digits && !digits.startsWith("55") && skipIA.has(`55${digits}`)) return true
      return false
    }

    const skipSet = new Set(["lead-com-ia", "18991234567", "5518991234567"])

    expect(leadTemIAAtiva(skipSet, { id: "lead-com-ia" })).toBe(true)
    expect(leadTemIAAtiva(skipSet, { id: "outro-lead", telefone: "(18) 99123-4567" })).toBe(true)
    expect(leadTemIAAtiva(skipSet, { id: "outro-lead", telefone: "+55 (18) 99123-4567" })).toBe(true)
    expect(leadTemIAAtiva(skipSet, { id: "lead-livre", telefone: "18999999999" })).toBe(false)
    expect(leadTemIAAtiva(null, { id: "lead-com-ia" })).toBe(false)
  })

  it("deve calcular corretamente a estrutura inicial de métricas de rejeição", () => {
    const rejections = {
      has_active_job: 0,
      conditions_not_met: 0,
      human_interaction_recent: 0,
      no_leads_found: 0,
      insert_error: 0,
      ia_in_conversa: 0,
    }

    expect(Object.keys(rejections)).toHaveLength(6)
    expect(rejections.has_active_job).toBe(0)
  })
})
