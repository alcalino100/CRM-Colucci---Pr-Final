import { beforeEach, describe, expect, it, vi } from "vitest"

// Regressão: número interno (bloqueado) que é número de TESTE do assistente precisa chegar ao assistente,
// sem nunca virar lead nem acionar a IA de leads. Antes, o desvio dos bloqueados encerrava antes do gancho.
const inserts: { table: string; row: any }[] = []
function builder(table: string): any {
  const b: any = {
    select: () => b, ilike: () => b, eq: () => b, in: () => b, gt: () => b, update: () => b,
    limit: async () => ({ data: table === "whatsapp_instancias" ? [{ corretor_id: "c1", instance_name: "patricia2" }] : [] }),
    maybeSingle: async () => ({ data: null }),
    insert: async (row: any) => { inserts.push({ table, row }); return { data: null, error: null } },
  }
  return b
}

vi.mock("@/lib/whatsapp/server", () => ({
  detectarMidia: () => null,
  onlyDigits: (v: string) => String(v ?? "").replace(/\D/g, ""),
  wsupabase: { from: (t: string) => builder(t) },
}))
const patricia = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/ai/inboxHandler", () => ({
  handlePatriciaInbound: (...a: unknown[]) => patricia(...a),
  isNumeroTesteIA: async () => false,
  agenteParaInstancia: async () => null,
  pausarIaMensagemManual: vi.fn().mockResolvedValue(undefined),
  saudarLeadCTWA: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/automation-services", () => ({ registrarRespostaDeLead: vi.fn() }))
const criarLead = vi.fn().mockResolvedValue({ leadId: "novo" })
vi.mock("@/lib/whatsapp-webhook/lead-attribution", () => ({
  encontrarLeadPorTelefone: async () => null,
  transicaoRespostaAutomacao: vi.fn(),
  reengajarOuCriarLeadTráfego: (...a: unknown[]) => criarLead(...a),
}))
vi.mock("@/lib/whatsapp-webhook/media-helpers", () => ({
  camposMidia: () => ({}),
  preencherMidiaUrl: async () => {},
  processarCorpoMidia: async (p: { msg: any }) => p.msg?.message?.conversation ?? "",
}))
vi.mock("@/lib/whatsapp-webhook/connection-handler", () => ({ getInstanceName: (p: any) => p?.instance ?? null }))
const assistente = vi.fn()
const assistenteHumano = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/assistente/whatsapp", () => ({
  handleAssistenteInbound: (...a: unknown[]) => assistente(...a),
  handleAssistenteMensagemHumana: (...a: unknown[]) => assistenteHumano(...a),
}))

import { BLOCKED_NUMBERS } from "@/lib/whatsapp-webhook/contact-filters"
import { handleMessageUpsert } from "@/lib/whatsapp-webhook/inbound-handler"

const interno = [...BLOCKED_NUMBERS][0]
const normal = "5511900001111"
const payload = (tel: string, extra: Record<string, unknown> = {}) => ({
  instance: "patricia2",
  data: { key: { remoteJid: `${tel}@s.whatsapp.net`, fromMe: false, id: `m-${Math.random()}` }, message: { conversation: "oi" }, pushName: "Contato", ...extra },
})

beforeEach(() => { inserts.length = 0; vi.clearAllMocks(); assistente.mockResolvedValue(false) })

describe("webhook × Assistente Virtual", () => {
  it("número interno bloqueado: grava a mensagem, tenta o assistente SÓ para teste e nunca cria lead nem aciona a IA de leads", async () => {
    assistente.mockResolvedValue(true)
    await handleMessageUpsert(payload(interno))
    expect(inserts.filter((i) => i.table === "whatsapp_mensagens")).toHaveLength(1)
    expect(assistente).toHaveBeenCalledWith({ telefone: interno, texto: "oi", instanceName: "patricia2" }, { exigirTeste: true })
    expect(patricia).not.toHaveBeenCalled()
    expect(criarLead).not.toHaveBeenCalled()
  })

  it("número interno que NÃO é de teste: assistente recusa (false) e nada mais acontece", async () => {
    await handleMessageUpsert(payload(interno))
    expect(assistente).toHaveBeenCalledTimes(1)
    expect(patricia).not.toHaveBeenCalled()
    expect(criarLead).not.toHaveBeenCalled()
  })

  it("contato normal: assistente assume e a IA de leads não responde", async () => {
    assistente.mockResolvedValue(true)
    await handleMessageUpsert(payload(normal))
    expect(assistente).toHaveBeenCalledWith({ telefone: normal, texto: "oi", instanceName: "patricia2" }, {})
    expect(patricia).not.toHaveBeenCalled()
  })

  it("contato normal e assistente não assume: fluxo de leads segue como antes", async () => {
    await handleMessageUpsert(payload(normal))
    expect(patricia).toHaveBeenCalledTimes(1)
  })

  it("falha ao carregar o assistente não derruba o webhook e o fluxo de leads segue", async () => {
    assistente.mockRejectedValue(new Error("boom"))
    await handleMessageUpsert(payload(normal))
    expect(patricia).toHaveBeenCalledTimes(1)
  })

  it("reprocessamento (semIA): nem o assistente nem a IA são acionados", async () => {
    await handleMessageUpsert(payload(normal), { semIA: true })
    expect(assistente).not.toHaveBeenCalled()
    expect(patricia).not.toHaveBeenCalled()
  })
})
