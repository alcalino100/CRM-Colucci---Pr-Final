import { describe, expect, it } from "vitest"
import {
  extrairMetaArquivado,
  rowToLead,
  leadPatchToRow,
  rowToVisit,
  rowToUser,
  rowToNotification,
  rowToJustification,
  rowToQuality,
  rowToAudit,
  isPhoneUniqueViolation,
} from "@/lib/leads-store/mappers"

describe("leads-store mappers - extrairMetaArquivado", () => {
  it("extrai valores de chave no formato [Hibernação: ... chave=valor]", () => {
    const obs = "Obs anterior.\n\n[Hibernação: data=2026-06-01; motivo=sem orçamento agora; status_anterior=novo]"
    expect(extrairMetaArquivado(obs, "data")).toBe("2026-06-01")
    expect(extrairMetaArquivado(obs, "motivo")).toBe("sem orçamento agora")
    expect(extrairMetaArquivado(obs, "status_anterior")).toBe("novo")
    expect(extrairMetaArquivado(obs, "inexistente")).toBeNull()
  })

  it("retorna null para obs nula ou vazia", () => {
    expect(extrairMetaArquivado(null, "data")).toBeNull()
    expect(extrairMetaArquivado("", "data")).toBeNull()
  })
})

describe("leads-store mappers - rowToLead e leadPatchToRow", () => {
  it("converte row do banco para objeto Lead tipado", () => {
    const row = {
      id: "lead-1",
      nome: "Carlos Silva",
      telefone: "5518991234567",
      email: "carlos@teste.com",
      referencia_imovel: "REF100",
      referencias: [{ ref: "REF100", principal: true }],
      temperatura: "quente",
      status: "novo",
      origem: "Tráfego Pago",
      observacoes: "Teste",
      corretor_id: "corretor-1",
      criado_em: "2026-01-01T10:00:00Z",
      atualizado_em: "2026-01-01T10:00:00Z",
      arquivado_em: "2026-04-01T10:00:00Z",
      data_reaparecimento: "2026-05-15",
      motivo_arquivamento: "outro",
    }

    const lead = rowToLead(row)
    expect(lead.id).toBe("lead-1")
    expect(lead.nome).toBe("Carlos Silva")
    expect(lead.imovelRef).toBe("REF100")
    expect(lead.status).toBe("novo")
    expect(lead.dataReaparecimento).toBe("2026-05-15")
  })

  it("converte patch camelCase em colunas do banco (snake_case)", () => {
    const patch = {
      nome: "Carlos Editado",
      imovelRef: "REF200",
      dataReaparecimento: "2026-07-01",
      corretorId: "corretor-2",
    }

    const row = leadPatchToRow(patch)
    expect(row.nome).toBe("Carlos Editado")
    expect(row.referencia_imovel).toBe("REF200")
    expect(row.data_reaparecimento).toBe("2026-07-01")
    expect(row.corretor_id).toBe("corretor-2")
  })
})

describe("leads-store mappers - rowToVisit e rowToUser", () => {
  it("converte visita do banco para objeto Visit", () => {
    const row = {
      id: "v-1",
      lead_id: "lead-1",
      data: "2026-05-20",
      horario: "14:30",
      corretor_id: "corretor-1",
      referencias: "REF01",
      observacoes: "Cliente pontual",
    }
    const visit = rowToVisit(row)
    expect(visit.id).toBe("v-1")
    expect(visit.hora).toBe("14:30")
    expect(visit.leadId).toBe("lead-1")
  })

  it("converte usuario do banco para User (omitindo senha_hash crua)", () => {
    const row = {
      id: "u-1",
      nome: "Admin",
      email: "admin@colucci.com",
      senha_hash: "$2a$10$xyz",
      role: "gestor_master",
      status: "ativo",
      criado_em: "2026-01-01T00:00:00Z",
    }
    const user = rowToUser(row)
    expect(user.id).toBe("u-1")
    expect(user.ativo).toBe(true)
    expect(user.role).toBe("gestor_master")
  })
})

describe("leads-store mappers - rowToNotification, rowToJustification, rowToAudit", () => {
  it("converte notificacao calculando campo read com base no lida_por", () => {
    const row = {
      id: "notif-1",
      mensagem: "Novo lead",
      timestamp: "2026-05-10T10:00:00Z",
      lida_por: ["u-1"],
      lida: false,
    }
    expect(rowToNotification(row, "u-1").read).toBe(true)
    expect(rowToNotification(row, "u-2").read).toBe(false)
  })

  it("identifica erro de duplicidade de telefone pelo código ou mensagem", () => {
    expect(isPhoneUniqueViolation({ code: "23505" })).toBe(true)
    expect(isPhoneUniqueViolation({ message: "duplicate key value violates unique constraint idx_telefone_normalizado" })).toBe(true)
    expect(isPhoneUniqueViolation({ code: "42P01" })).toBe(false)
    expect(isPhoneUniqueViolation(null)).toBe(false)
  })
})
