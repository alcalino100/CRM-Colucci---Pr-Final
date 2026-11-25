import crypto from "crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const registrar = vi.fn(async (..._a: unknown[]) => {})
const status = vi.fn(async (..._a: unknown[]) => {})
vi.mock("@/lib/whatsapp-oficial/recebimento", () => ({ registrarMensagemRecebida: (...a: unknown[]) => registrar(...a), registrarStatusOficial: (...a: unknown[]) => status(...a) }))

import { GET, POST } from "@/app/api/whatsapp/oficial/webhook/route"

const SEG = "segredo-app"
const corpo = JSON.stringify({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN1" }, messages: [{ from: "55", id: "w1", timestamp: "1", type: "text", text: { body: "oi" } }], statuses: [{ id: "w0", status: "read" }] } }] }] })
const assinar = (c: string) => "sha256=" + crypto.createHmac("sha256", SEG).update(c).digest("hex")
const post = (c: string, sig?: string) => POST(new Request("http://x/api/whatsapp/oficial/webhook", { method: "POST", body: c, headers: sig ? { "x-hub-signature-256": sig } : {} }))

describe("webhook da API oficial", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.META_APP_SECRET = SEG; process.env.WHATSAPP_CLOUD_VERIFY_TOKEN = "tok" })

  it("verificação: devolve o challenge com o token certo e recusa o errado", async () => {
    const ok = await GET(new Request("http://x/w?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=12345"))
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe("12345")
    const ruim = await GET(new Request("http://x/w?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1"))
    expect(ruim.status).toBe(403)
  })

  it("recusa evento sem assinatura ou com assinatura inválida (nada é processado)", async () => {
    expect((await post(corpo)).status).toBe(401)
    expect((await post(corpo, "sha256=00")).status).toBe(401)
    expect(registrar).not.toHaveBeenCalled()
  })

  it("com assinatura válida processa mensagens e status", async () => {
    const r = await post(corpo, assinar(corpo))
    expect(r.status).toBe(200)
    expect(registrar).toHaveBeenCalledTimes(1)
    expect(status).toHaveBeenCalledTimes(1)
  })

  it("um evento com erro não derruba a resposta (a Meta não reentrega em loop)", async () => {
    registrar.mockRejectedValueOnce(new Error("boom"))
    const r = await post(corpo, assinar(corpo))
    expect(r.status).toBe(200)
    expect(status).toHaveBeenCalledTimes(1)
  })
})
