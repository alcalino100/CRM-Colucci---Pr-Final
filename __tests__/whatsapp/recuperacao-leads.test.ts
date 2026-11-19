import { describe, expect, it } from "vitest"
import { diagnosticarWebhook, mesmaUrl, normalizarWebhook, origemCanonica, urlWebhookCanonica } from "@/lib/whatsapp/webhook-config"
import { deveReprocessar, extrairRegistros, limitarDesde, RESGATE_MAX_DIAS } from "@/lib/whatsapp/resgate-mensagens"
import { agruparOrfas } from "@/lib/whatsapp/reconciliar-leads"
import { inicioDoResgate } from "@/lib/whatsapp/auto-recuperacao"

describe("webhook canônico", () => {
  it("usa NEXT_PUBLIC_APP_URL sem barra final e inclui o segredo", () => {
    const env = { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com/", WHATSAPP_WEBHOOK_SECRET: "a b" } as unknown as NodeJS.ProcessEnv
    expect(origemCanonica(env)).toBe("https://crm.exemplo.com")
    expect(urlWebhookCanonica(env)).toBe("https://crm.exemplo.com/api/whatsapp/webhook?secret=a%20b")
  })
  it("cai para o domínio de produção da Vercel e depois para o padrão", () => {
    expect(origemCanonica({ VERCEL_PROJECT_PRODUCTION_URL: "crm.vercel.app" } as unknown as NodeJS.ProcessEnv)).toBe("https://crm.vercel.app")
    expect(origemCanonica({} as unknown as NodeJS.ProcessEnv)).toMatch(/^https:\/\//)
  })
  it("normaliza respostas v1 e v2 da Evolution", () => {
    expect(normalizarWebhook({ webhook: { url: "https://x/api/whatsapp/webhook", enabled: true, events: ["messages_upsert"] } })).toEqual({
      url: "https://x/api/whatsapp/webhook",
      enabled: true,
      events: ["MESSAGES_UPSERT"],
    })
    expect(normalizarWebhook({ url: "https://y", enabled: false, events: [] }).enabled).toBe(false)
    expect(normalizarWebhook(null).url).toBeNull()
  })
  it("diagnostica webhook ausente, em outro domínio, desabilitado ou sem evento de mensagem", () => {
    const esperada = "https://crm.com/api/whatsapp/webhook?secret=s1"
    expect(diagnosticarWebhook(null, esperada).ok).toBe(false)
    expect(diagnosticarWebhook({ url: "https://preview-123.vercel.app/api/whatsapp/webhook?secret=s1", enabled: true, events: ["MESSAGES_UPSERT"] }, esperada).motivos).toContain("url diferente da canônica")
    expect(diagnosticarWebhook({ url: esperada, enabled: false, events: ["MESSAGES_UPSERT"] }, esperada).motivos).toContain("webhook desabilitado")
    expect(diagnosticarWebhook({ url: esperada, enabled: true, events: ["CONNECTION_UPDATE"] }, esperada).motivos).toContain("evento MESSAGES_UPSERT ausente")
    expect(diagnosticarWebhook({ url: esperada, enabled: true, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] }, esperada).ok).toBe(true)
  })
  it("compara a URL por origem+caminho e detecta segredo trocado", () => {
    const esperada = "https://crm.com/api/whatsapp/webhook?secret=novo"
    expect(mesmaUrl("https://crm.com/api/whatsapp/webhook?secret=novo", esperada)).toBe(true)
    expect(mesmaUrl("https://crm.com/api/whatsapp/webhook?secret=velho", esperada)).toBe(false)
    expect(mesmaUrl("https://crm.com/api/whatsapp/webhook", esperada)).toBe(true) // Evolution pode omitir a query
    expect(mesmaUrl("https://outro.com/api/whatsapp/webhook?secret=novo", esperada)).toBe(false)
  })
})

describe("resgate de mensagens", () => {
  it("extrai registros dos formatos da Evolution", () => {
    expect(extrairRegistros({ messages: { total: 2, pages: 3, records: [{ a: 1 }, { a: 2 }] } })).toEqual({ registros: [{ a: 1 }, { a: 2 }], totalPaginas: 3 })
    expect(extrairRegistros([{ a: 1 }]).registros).toHaveLength(1)
    expect(extrairRegistros(null)).toEqual({ registros: [], totalPaginas: 1 })
  })
  it("só reprocessa mensagens recebidas de contatos individuais", () => {
    expect(deveReprocessar({ key: { remoteJid: "5518999990000@s.whatsapp.net", fromMe: false } })).toBe(true)
    expect(deveReprocessar({ key: { remoteJid: "5518999990000@s.whatsapp.net", fromMe: true } })).toBe(false)
    expect(deveReprocessar({ key: { remoteJid: "1203@g.us", fromMe: false } })).toBe(false)
    expect(deveReprocessar({ key: { remoteJid: "status@broadcast", fromMe: false } })).toBe(false)
    expect(deveReprocessar({ key: {} })).toBe(false)
  })
  it("limita o resgate a 7 dias", () => {
    const agora = new Date("2026-11-19T12:00:00Z")
    expect(limitarDesde(new Date("2026-10-01T00:00:00Z"), agora).getTime()).toBe(agora.getTime() - RESGATE_MAX_DIAS * 86400_000)
    const recente = new Date("2026-11-18T12:00:00Z")
    expect(limitarDesde(recente, agora).getTime()).toBe(recente.getTime())
  })
  it("início do resgate: última mensagem menos 1h, ou 72h sem dados", () => {
    const agora = new Date("2026-11-19T12:00:00Z")
    expect(inicioDoResgate("2026-11-15T09:13:00Z", agora).toISOString()).toBe("2026-11-15T08:13:00.000Z")
    expect(inicioDoResgate(null, agora).toISOString()).toBe("2026-11-16T12:00:00.000Z")
    expect(inicioDoResgate("lixo", agora).toISOString()).toBe("2026-11-16T12:00:00.000Z")
  })
})

describe("reconciliação de leads de anúncio", () => {
  it("agrupa por instância+telefone e fica com a mensagem mais antiga", () => {
    const base = { nome_contato: "x", corpo: "oi", anuncio_id: null, anuncio_titulo: null }
    const r = agruparOrfas([
      { id: "1", instance_name: "a", telefone: "5518999991111", ...base },
      { id: "2", instance_name: "a", telefone: "5518999991111", ...base },
      { id: "3", instance_name: "b", telefone: "5518999991111", ...base },
      { id: "4", instance_name: "a", telefone: "5518888882222", ...base },
    ])
    expect(r.map((m) => m.id)).toEqual(["1", "3", "4"])
  })
})
