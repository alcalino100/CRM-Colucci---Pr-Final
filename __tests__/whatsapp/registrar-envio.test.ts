import { beforeEach, describe, expect, it, vi } from "vitest"

const inserts: any[] = []
let jaExiste: any = null

vi.mock("@/lib/whatsapp/server", () => {
  const builder = (tabela: string) => {
    const b: any = {
      select: () => b, eq: () => b, ilike: () => b, limit: () => b,
      maybeSingle: async () => ({ data: tabela === "whatsapp_mensagens" ? jaExiste : null }),
      insert: async (row: any) => { inserts.push(row); return { error: null } },
      then: (res: any) => res({ data: tabela === "whatsapp_instancias" ? [{ corretor_id: "c1" }] : null }),
    }
    return b
  }
  return { wsupabase: { from: builder } }
})
vi.mock("@/lib/ai/inboxHandler", () => ({ pausarIaMensagemManual: vi.fn(async () => {}) }))
vi.mock("@/lib/whatsapp-webhook/lead-attribution", () => ({ encontrarLeadPorTelefone: vi.fn(async () => "lead-1") }))
vi.mock("@/lib/assistente/whatsapp", () => ({ handleAssistenteMensagemHumana: vi.fn(async () => {}) }))

import { registrarEnvioManual } from "@/lib/whatsapp-webhook/registrar-envio"
import { pausarIaMensagemManual } from "@/lib/ai/inboxHandler"

describe("registrarEnvioManual", () => {
  beforeEach(() => { inserts.length = 0; jaExiste = null; vi.clearAllMocks() })

  it("grava a mensagem enviada pelo Inbox e pausa a IA", async () => {
    await registrarEnvioManual({ instanceName: "i1", telefone: "5518", texto: "oi", keyId: "K1" })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ de_mim: true, mensagem_id: "K1", corpo: "oi", lead_id: "lead-1", telefone: "5518" })
    expect(pausarIaMensagemManual).toHaveBeenCalled()
  })

  it("não duplica quando o id já existe (eco do webhook chegou antes)", async () => {
    jaExiste = { id: 1 }
    await registrarEnvioManual({ instanceName: "i1", telefone: "5518", texto: "oi", keyId: "K1" })
    expect(inserts).toHaveLength(0)
  })

  it("sem id da Evolução não grava (deixa para o webhook)", async () => {
    await registrarEnvioManual({ instanceName: "i1", telefone: "5518", texto: "oi" })
    expect(inserts).toHaveLength(0)
  })
})
