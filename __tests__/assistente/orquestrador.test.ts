import { describe, expect, it } from "vitest"
import { criarMockProvider, estadoInicial, processarMensagem, type Estado } from "@/lib/assistente"

const agora = new Date("2026-11-19T10:00:00")
const gerarProtocolo = () => "COL-TESTE-0001"
const base = (telefone: string, indisponivel = false) => ({ provider: criarMockProvider({ indisponivel }), telefone, agora, gerarProtocolo })

async function conversa(telefone: string, falas: string[], indisponivel = false) {
  let estado: Estado = estadoInicial()
  const respostas: string[] = []
  const eventos: any[] = []
  for (const f of falas) {
    const s = await processarMensagem(estado, f, base(telefone, indisponivel))
    estado = s.estado
    respostas.push(...s.respostas)
    eventos.push(...s.eventos)
  }
  return { estado, respostas: respostas.join("\n"), eventos }
}

describe("orquestrador", () => {
  it("segunda via: pede confirmação, confirma e entrega o boleto", async () => {
    const r = await conversa("5511999990001", ["preciso da segunda via do boleto", "o final do meu cpf é 8901"])
    expect(r.respostas).toContain("4 últimos dígitos")
    expect(r.respostas).toMatch(/Mariana, (tudo certo|já confirmei|confirmado)|Perfeito, Mariana|Obrigado, Mariana|Pronto, Mariana/)
    expect(r.respostas).toContain("23793.38128")
    expect(r.estado.etapa).toBe("identificado")
    expect(r.eventos).toContainEqual({ tipo: "resolvido_automaticamente" })
  })

  it("não revela dados antes da confirmação", async () => {
    const r = await conversa("5511999990001", ["segunda via do boleto"])
    expect(r.respostas).not.toContain("23793")
    expect(r.estado.etapa).toBe("aguardando_confirmacao")
  })

  it("3 confirmações erradas bloqueiam e escalam", async () => {
    const r = await conversa("5511999990001", ["boleto", "0000", "1111", "2222"])
    expect(r.estado.etapa).toBe("transferido")
    expect(r.respostas).not.toContain("23793")
    expect(r.eventos).toContainEqual({ tipo: "identidade", resultado: "bloqueada" })
  })

  it("telefone desconhecido vai para a equipe sem expor dados", async () => {
    const r = await conversa("5511900000000", ["segunda via do boleto"])
    expect(r.estado.etapa).toBe("transferido")
    expect(r.respostas).toContain("COL-TESTE-0001")
  })

  it("pedido de atendente escala imediatamente", async () => {
    const r = await conversa("5511999990001", ["quero falar com um atendente"])
    expect(r.estado.etapa).toBe("transferido")
    expect(r.estado.protocolo).toBe("COL-TESTE-0001")
  })

  it("manutenção abre protocolo para o departamento certo", async () => {
    const r = await conversa("5511999990001", ["tem um vazamento na pia"])
    expect(r.estado.departamento).toBe("manutencao")
  })

  it("duas mensagens ininteligíveis escalam; a primeira pede para reformular, sem menu", async () => {
    const um = await conversa("5511999990001", ["asdf"])
    expect(um.estado.etapa).toBe("inicio")
    expect(um.respostas).toMatch(/boleto, (informe|contrato)/)
    expect(um.respostas).not.toContain("•")
    const dois = await conversa("5511999990001", ["asdf", "qwer"])
    expect(dois.estado.etapa).toBe("transferido")
  })

  it("Immobillis fora do ar: pede desculpas e escala, sem erro técnico", async () => {
    const r = await conversa("5511999990001", ["segunda via do boleto"], true)
    expect(r.estado.etapa).toBe("transferido")
    expect(r.respostas).toContain("instabilidade")
    expect(r.respostas).not.toMatch(/undefined|Error|500/)
  })

  it("informe de rendimentos para proprietário", async () => {
    const r = await conversa("5511999990002", ["informe de rendimentos 2025", "meu cpf termina em 2100"])
    expect(r.respostas).toContain("Informe de rendimentos 2025")
  })

  it("informe indisponível para inquilino escala", async () => {
    const r = await conversa("5511999990001", ["informe de rendimentos", "8901"])
    expect(r.estado.etapa).toBe("transferido")
  })

  it("reajuste lista estimativa do contrato do cliente", async () => {
    const r = await conversa("5511999990001", ["qual o reajuste do meu aluguel", "8901"])
    expect(r.respostas).toContain("IGP-M")
    expect(r.respostas).toContain("Estimativa")
  })

  it("contrato próximo do vencimento menciona renovação", async () => {
    const r = await conversa("5511999990003", ["dados do meu contrato", "3344"])
    expect(r.respostas).toMatch(/Faltam \d+ dias/)
  })

  it("FAQ responde sem exigir identidade", async () => {
    const r = await conversa("5511900000000", ["qual o horário de atendimento?"])
    expect(r.respostas).toContain("24h")
    expect(r.estado.etapa).toBe("inicio")
  })

  it("após transferência, não responde sozinho de novo", async () => {
    const r = await conversa("5511999990001", ["quero falar com humano", "e o boleto?"])
    expect(r.respostas).toMatch(/já está com a nossa equipe|Já passei o seu caso/)
    expect(r.respostas).toContain("COL-")
  })
})
