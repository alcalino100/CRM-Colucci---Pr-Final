import { describe, it, expect } from "vitest"
import {
  etapaDoJob,
  folgaDaFila,
  leadElegivelParaFollowup,
  leadPrecisaDaEtapa,
  leadPrecisaDeD1,
} from "@/lib/automation-worker/followup-selection"
import { MAX_FILA_FOLLOWUP } from "@/lib/automation-worker/constants"

describe("etapaDoJob", () => {
  it("lê step numérico ou followup_stage; jobs antigos sem metadata contam como D+1", () => {
    expect(etapaDoJob({ step: 2 })).toBe(2)
    expect(etapaDoJob({ followup_stage: "D+3" })).toBe(3)
    expect(etapaDoJob({})).toBe(1)
    expect(etapaDoJob(null)).toBe(1)
  })
})

describe("leadPrecisaDeD1", () => {
  it("sim quando nunca teve job", () => {
    expect(leadPrecisaDeD1([])).toBe(true)
  })

  it("não quando já recebeu algum envio ou tem job aberto", () => {
    expect(leadPrecisaDeD1([{ status: "sent" }])).toBe(false)
    expect(leadPrecisaDeD1([{ status: "scheduled" }])).toBe(false)
    expect(leadPrecisaDeD1([{ status: "cancelled_human" }])).toBe(false)
  })

  it("sim quando todos os jobs falharam por erro transitório", () => {
    expect(
      leadPrecisaDeD1([{ status: "failed", failure_code: "HTTP_500", failure_reason: "Connection Closed" }])
    ).toBe(true)
  })

  it("não quando a falha foi permanente (número sem WhatsApp)", () => {
    expect(
      leadPrecisaDeD1([
        { status: "failed", failure_code: "HTTP_400", failure_reason: '[{"exists":false,"number":"1"}]' },
      ])
    ).toBe(false)
  })

  it("não quando já estourou o limite de tentativas", () => {
    const falha = { status: "failed", failure_code: "HTTP_500", failure_reason: "Connection Closed" }
    expect(leadPrecisaDeD1([falha, falha, falha])).toBe(false)
  })
})

describe("leadPrecisaDaEtapa", () => {
  it("só precisa se ainda não existe job da etapa", () => {
    expect(leadPrecisaDaEtapa([{ status: "sent", metadata: { step: 1 } }], 2)).toBe(true)
    expect(leadPrecisaDaEtapa([{ status: "sent", metadata: { step: 2 } }], 2)).toBe(false)
    expect(leadPrecisaDaEtapa([{ status: "cancelled_human", metadata: { step: 3 } }], 3)).toBe(false)
  })
})

describe("folgaDaFila", () => {
  it("limita a fila aberta e nunca fica negativa", () => {
    expect(folgaDaFila(0)).toBe(MAX_FILA_FOLLOWUP)
    expect(folgaDaFila(MAX_FILA_FOLLOWUP - 5)).toBe(5)
    expect(folgaDaFila(MAX_FILA_FOLLOWUP + 40)).toBe(0)
  })
})

describe("leadElegivelParaFollowup", () => {
  const base = { status: "em_automacao", origem: "Tráfego Pago", telefone: "18996917711" }

  it("aceita Tráfego Pago nos estágios válidos", () => {
    expect(leadElegivelParaFollowup(base, [], new Set())).toBe(true)
    expect(leadElegivelParaFollowup({ ...base, status: "em_followup" }, [], new Set())).toBe(true)
  })

  it("aceita outra origem somente com tag de follow-up", () => {
    const outra = { ...base, origem: "Indicação" }
    expect(leadElegivelParaFollowup(outra, [], new Set(["followup"]))).toBe(false)
    expect(leadElegivelParaFollowup(outra, ["followup"], new Set(["followup"]))).toBe(true)
  })

  it("rejeita estágios que o despachante cancelaria, telefone inválido, fechado ou arquivado", () => {
    expect(leadElegivelParaFollowup({ ...base, status: "novo" }, [], new Set())).toBe(false)
    expect(leadElegivelParaFollowup({ ...base, status: "atendimento_ia" }, [], new Set())).toBe(false)
    expect(leadElegivelParaFollowup({ ...base, telefone: "123" }, [], new Set())).toBe(false)
    expect(leadElegivelParaFollowup({ ...base, fechado_em: "2026-01-01" }, [], new Set())).toBe(false)
    expect(leadElegivelParaFollowup({ ...base, arquivado_em: "2026-01-01" }, [], new Set())).toBe(false)
  })
})
