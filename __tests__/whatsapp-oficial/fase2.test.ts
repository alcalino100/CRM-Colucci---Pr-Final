import { beforeEach, describe, expect, it, vi } from "vitest"

const state = { ultimaEntrada: null as string | null, canal: { ativo: true, modo: "manual" } as any, jaExiste: null as any }
const inserts: any[] = []
const textoOficial = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, wamid: "wamid.X" }))
const modeloOficial = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, wamid: "wamid.M" }))
const assistente = vi.fn(async (..._a: unknown[]) => true)
const patricia = vi.fn(async (..._a: unknown[]) => {})

vi.mock("@/lib/whatsapp/server", () => {
  const b = (t: string): any => {
    const q: any = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, ilike: () => q,
      maybeSingle: async () => ({ data: t === "whatsapp_mensagens" ? (q._ins ? null : state.jaExiste ?? (state.ultimaEntrada ? { criado_em: state.ultimaEntrada } : null)) : state.canal, error: null }),
      insert: async (row: any) => { inserts.push(row); return { error: null } },
      update: () => q,
    }
    return q
  }
  return { wsupabase: { from: b, storage: {} }, onlyDigits: (v: string) => v.replace(/\D/g, ""), sendPresence: vi.fn(), sendWhatsAppText: vi.fn() }
})
vi.mock("@/lib/whatsapp-oficial/client", () => ({
  enviarTextoOficial: (...a: unknown[]) => textoOficial(...a),
  enviarModeloOficial: (...a: unknown[]) => modeloOficial(...a),
  marcarComoLida: vi.fn(async () => {}),
  baixarMidiaOficial: vi.fn(async () => null),
  renderizarModelo: (c: string, v: string[]) => c.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => v[Number(n) - 1] ?? ""),
}))
vi.mock("@/lib/whatsapp-webhook/lead-attribution", () => ({ encontrarLeadPorTelefone: vi.fn(async () => "lead-1") }))
vi.mock("@/lib/automation-services", () => ({ registrarStatusEntrega: vi.fn(async () => {}) }))
vi.mock("@/lib/assistente/whatsapp", () => ({ handleAssistenteInbound: (...a: unknown[]) => assistente(...a) }))
vi.mock("@/lib/ai/inboxHandler", () => ({ handlePatriciaInbound: (...a: unknown[]) => patricia(...a) }))
vi.mock("@/lib/auth/sessao", () => ({ exigirSessao: () => ({ ok: true, sessao: { id: "u", role: "gestor", exp: 0 } }), negarAcesso: () => new Response("", { status: 401 }) }))

import { modeloPuro } from "./modelo-helper"
import { enviarTextoPorCanalOficial } from "@/lib/whatsapp-oficial/despacho"
import { registrarMensagemRecebida } from "@/lib/whatsapp-oficial/recebimento"
import { POST as enviar } from "@/app/api/whatsapp/send/route"

const agora = () => new Date().toISOString()
const ev = (over: Record<string, unknown> = {}) => ({ tipo: "mensagem" as const, phoneNumberId: "PN1", wamid: "wamid.REAL", telefone: "5518", nome: "Gui", corpo: "oi", em: agora(), midia: null, anuncio: null, ...over })

describe("modelos", () => {
  it("aplica variáveis no corpo", () => expect(modeloPuro("Olá {{1}}, vence {{2}}", ["Ana", "10/12"])).toBe("Olá Ana, vence 10/12"))
})

describe("envio por canal oficial (despacho)", () => {
  beforeEach(() => { vi.clearAllMocks(); state.ultimaEntrada = null; state.jaExiste = null; inserts.length = 0 })
  it("bloqueia fora da janela de 24h e não chama a Meta", async () => {
    state.ultimaEntrada = new Date(Date.now() - 30 * 3600_000).toISOString()
    const r = await enviarTextoPorCanalOficial("oficial:PN1", "5518", "oi")
    expect(r.ok).toBe(false)
    expect(textoOficial).not.toHaveBeenCalled()
  })
  it("envia dentro da janela, devolvendo o wamid como keyId", async () => {
    state.ultimaEntrada = agora()
    const r = await enviarTextoPorCanalOficial("oficial:PN1", "5518", "oi")
    expect(r).toEqual({ ok: true, keyId: "wamid.X" })
    expect(textoOficial).toHaveBeenCalledWith("PN1", "5518", "oi")
  })
})

describe("rota /api/whatsapp/send no canal oficial", () => {
  const req = (b: unknown) => new Request("http://x/api/whatsapp/send", { method: "POST", body: JSON.stringify(b) })
  beforeEach(() => { vi.clearAllMocks(); state.ultimaEntrada = null; state.jaExiste = null; inserts.length = 0 })
  it("fora da janela devolve 409 JANELA_EXPIRADA", async () => {
    const r = await enviar(req({ instanceName: "oficial:PN1", telefone: "5518", texto: "oi" }))
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe("JANELA_EXPIRADA")
  })
  it("modelo é enviado mesmo fora da janela e gravado com o texto renderizado", async () => {
    const r = await enviar(req({ instanceName: "oficial:PN1", telefone: "5518", modelo: { nome: "cobranca", idioma: "pt_BR", variaveis: ["Ana"], corpo: "Olá {{1}}" } }))
    expect(r.status).toBe(200)
    expect(modeloOficial).toHaveBeenCalledWith("PN1", "5518", "cobranca", "pt_BR", ["Ana"])
    expect(inserts[0]).toMatchObject({ corpo: "Olá Ana", de_mim: true, mensagem_id: "wamid.M", status_entrega: "sent" })
  })
})

describe("atendimento automático por modo do canal", () => {
  beforeEach(() => { vi.clearAllMocks(); state.jaExiste = null; state.ultimaEntrada = null; inserts.length = 0 })
  it("manual: grava e não aciona ninguém", async () => {
    state.canal = { ativo: true, modo: "manual" }
    await registrarMensagemRecebida(ev())
    expect(inserts).toHaveLength(1)
    expect(assistente).not.toHaveBeenCalled(); expect(patricia).not.toHaveBeenCalled()
  })
  it("assistente: aciona o Assistente Virtual com o id do canal", async () => {
    state.canal = { ativo: true, modo: "assistente" }
    await registrarMensagemRecebida(ev())
    expect(assistente).toHaveBeenCalledWith(expect.objectContaining({ instanceName: "oficial:PN1", telefone: "5518", texto: "oi" }))
    expect(patricia).not.toHaveBeenCalled()
  })
  it("ia: aciona a IA conversacional com o lead", async () => {
    state.canal = { ativo: true, modo: "ia" }
    await registrarMensagemRecebida(ev())
    expect(patricia).toHaveBeenCalledWith(expect.objectContaining({ instanceName: "oficial:PN1", leadId: "lead-1" }))
    expect(assistente).not.toHaveBeenCalled()
  })
  it("mensagem de TESTE nunca aciona IA/assistente, mesmo em modo automático", async () => {
    state.canal = { ativo: true, modo: "assistente" }
    await registrarMensagemRecebida(ev({ wamid: "wamid.TESTE.123" }))
    expect(inserts).toHaveLength(1)
    expect(assistente).not.toHaveBeenCalled()
  })
  it("canal inativo ou desconhecido: ignora", async () => {
    state.canal = { ativo: false, modo: "assistente" }
    await registrarMensagemRecebida(ev())
    expect(inserts).toHaveLength(0)
  })
  it("não duplica quando o wamid já existe", async () => {
    state.canal = { ativo: true, modo: "assistente" }; state.jaExiste = { id: 1 }
    await registrarMensagemRecebida(ev())
    expect(inserts).toHaveLength(0); expect(assistente).not.toHaveBeenCalled()
  })
})
