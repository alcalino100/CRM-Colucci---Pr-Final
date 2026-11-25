import crypto from "crypto"
import { describe, expect, it } from "vitest"
import { parsearWebhook } from "@/lib/whatsapp-oficial/parse"
import { assinaturaValida } from "@/lib/whatsapp-oficial/assinatura"
import { dentroDaJanela, horasRestantes } from "@/lib/whatsapp-oficial/janela"
import { ehCanalOficial, instanceDoCanal, phoneNumberIdDoCanal } from "@/lib/whatsapp-oficial/config"

const payload = (value: unknown) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value }] }] })
const meta = { display_phone_number: "551833334444", phone_number_id: "PN1" }

describe("parsearWebhook", () => {
  it("lê texto com nome do contato e horário", () => {
    const ev = parsearWebhook(payload({ metadata: meta, contacts: [{ wa_id: "5518996647087", profile: { name: "Gui" } }], messages: [{ from: "5518996647087", id: "wamid.A", timestamp: "1764000000", type: "text", text: { body: "oi" } }] }))
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ tipo: "mensagem", phoneNumberId: "PN1", wamid: "wamid.A", telefone: "5518996647087", nome: "Gui", corpo: "oi", midia: null })
    expect((ev[0] as any).em).toBe(new Date(1764000000 * 1000).toISOString())
  })

  it("lê áudio, imagem com legenda e documento", () => {
    const ev = parsearWebhook(payload({ metadata: meta, messages: [
      { from: "55", id: "a", timestamp: "1", type: "audio", audio: { id: "M1", mime_type: "audio/ogg; codecs=opus" } },
      { from: "55", id: "b", timestamp: "1", type: "image", image: { id: "M2", mime_type: "image/jpeg", caption: "olha" } },
      { from: "55", id: "c", timestamp: "1", type: "document", document: { id: "M3", filename: "boleto.pdf", mime_type: "application/pdf" } },
    ] }))
    expect(ev.map((e: any) => e.midia?.tipo)).toEqual(["audio", "image", "document"])
    expect((ev[1] as any).corpo).toBe("olha")
    expect((ev[2] as any).midia.nomeArquivo).toBe("boleto.pdf")
  })

  it("lê resposta de botão/lista e marca anúncio (referral)", () => {
    const ev = parsearWebhook(payload({ metadata: meta, messages: [
      { from: "55", id: "a", timestamp: "1", type: "interactive", interactive: { button_reply: { title: "Sim" } } },
      { from: "55", id: "b", timestamp: "1", type: "text", text: { body: "quero" }, referral: { source_url: "https://fb.me/x", headline: "Apê Centro" } },
    ] }))
    expect((ev[0] as any).corpo).toBe("Sim")
    expect((ev[1] as any).anuncio).toEqual({ titulo: "Apê Centro" })
  })

  it("lê status de entrega e falha com motivo", () => {
    const ev = parsearWebhook(payload({ metadata: meta, statuses: [
      { id: "w1", status: "delivered", recipient_id: "55" },
      { id: "w2", status: "failed", recipient_id: "55", errors: [{ code: 131047, title: "Re-engagement message" }] },
    ] }))
    expect(ev[0]).toMatchObject({ tipo: "status", status: "delivered", erro: null })
    expect(ev[1]).toMatchObject({ tipo: "status", status: "failed", erro: "131047 · Re-engagement message" })
  })

  it("ignora reação, campos desconhecidos e payload inválido", () => {
    expect(parsearWebhook(payload({ metadata: meta, messages: [{ from: "55", id: "r", timestamp: "1", type: "reaction", reaction: {} }] }))).toEqual([])
    expect(parsearWebhook({ entry: [{ changes: [{ field: "account_update", value: {} }] }] })).toEqual([])
    expect(parsearWebhook(null)).toEqual([])
    expect(parsearWebhook(payload({ messages: [{ from: "55", id: "x", type: "text", text: { body: "sem metadata" } }] }))).toEqual([])
  })
})

describe("assinaturaValida", () => {
  const corpo = '{"a":1}'
  const sig = (s: string, c = corpo) => "sha256=" + crypto.createHmac("sha256", s).update(c).digest("hex")
  it("aceita assinatura correta", () => expect(assinaturaValida(corpo, sig("seg"), "seg")).toBe(true))
  it("recusa segredo errado, corpo alterado, ausente e sem segredo configurado", () => {
    expect(assinaturaValida(corpo, sig("outro"), "seg")).toBe(false)
    expect(assinaturaValida(corpo + " ", sig("seg"), "seg")).toBe(false)
    expect(assinaturaValida(corpo, null, "seg")).toBe(false)
    expect(assinaturaValida(corpo, sig("seg"), "")).toBe(false)
  })
})

describe("janela de 24h", () => {
  const agora = Date.parse("2026-11-25T12:00:00Z")
  it("aberta até 24h após a última mensagem do cliente", () => {
    expect(dentroDaJanela("2026-11-25T00:00:00Z", agora)).toBe(true)
    expect(dentroDaJanela("2026-11-24T11:59:00Z", agora)).toBe(false)
    expect(dentroDaJanela(null, agora)).toBe(false)
  })
  it("calcula horas restantes", () => {
    expect(horasRestantes("2026-11-25T00:00:00Z", agora)).toBe(12)
    expect(horasRestantes("2026-11-20T00:00:00Z", agora)).toBe(0)
  })
})

describe("identificação do canal", () => {
  it("prefixa e reconhece instâncias oficiais", () => {
    expect(instanceDoCanal("PN1")).toBe("oficial:PN1")
    expect(ehCanalOficial("oficial:PN1")).toBe(true)
    expect(ehCanalOficial("patricia-6c2875b4")).toBe(false)
    expect(phoneNumberIdDoCanal("oficial:PN1")).toBe("PN1")
  })
})
