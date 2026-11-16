import { describe, it, expect } from "vitest"
import {
  CATALOGO_SECOES,
  CHAVES_SECOES,
  SECOES_PADRAO,
  SECOES_SOMENTE_LOCACAO,
  SECOES_TODAS,
  resumoSecoesDestinatario,
  secoesEfetivas,
  secoesNecessarias,
  secoesSchema,
} from "@/lib/relatorios/secoes"

describe("blocos do relatório", () => {
  it("o catálogo cobre todas as chaves, e Locação começa desligada na configuração geral", () => {
    expect(CATALOGO_SECOES.map((s) => s.key)).toEqual([...CHAVES_SECOES])
    expect(SECOES_PADRAO.locacao).toBe(false)
    expect(SECOES_PADRAO.trafego).toBe(true)
  })

  it("atalho 'Somente Locação' liga só a Locação, com todas as outras explicitamente desligadas", () => {
    expect(SECOES_SOMENTE_LOCACAO).toEqual({
      trafego: false, automacao: false, ia: false, arquivados: false, tempo: false, locacao: true,
    })
    expect(Object.values(SECOES_TODAS).every(Boolean)).toBe(true)
  })

  it("configuração antiga sem a chave 'locacao' continua válida e vale o padrão", () => {
    const antiga = { trafego: true, automacao: false, ia: true, arquivados: true, tempo: true }
    expect(secoesSchema.safeParse(antiga).success).toBe(true)
    expect(secoesEfetivas(antiga, null).locacao).toBe(false)
    expect(secoesEfetivas(antiga, null).automacao).toBe(false)
  })
})

describe("quem recebe o quê", () => {
  const geral = { trafego: true, automacao: true, ia: true, arquivados: true, tempo: true, locacao: false }
  const kleber = { secoes: null }
  const ricardo = { secoes: SECOES_SOMENTE_LOCACAO }

  it("destinatário sem ajuste segue a configuração geral; o Ricardo recebe só Locação", () => {
    expect(secoesEfetivas(geral, kleber.secoes)).toEqual(geral)
    expect(secoesEfetivas(geral, ricardo.secoes)).toEqual(SECOES_SOMENTE_LOCACAO)
  })

  it("coleta a união: Locação é coletada porque o Ricardo precisa, mesmo desligada na configuração geral", () => {
    const uniao = secoesNecessarias(geral, [kleber, ricardo])
    expect(uniao.locacao).toBe(true)
    expect(uniao.trafego).toBe(true)
  })

  it("sem ninguém pedindo Locação, ela não é coletada", () => {
    expect(secoesNecessarias(geral, [kleber]).locacao).toBe(false)
  })

  it("só destinatários 'somente Locação': não coleta os outros blocos (relatório mais leve)", () => {
    expect(secoesNecessarias(geral, [ricardo])).toEqual(SECOES_SOMENTE_LOCACAO)
  })

  it("texto curto para a lista de destinatários", () => {
    expect(resumoSecoesDestinatario(null)).toBe("Padrão da configuração")
    expect(resumoSecoesDestinatario(SECOES_SOMENTE_LOCACAO)).toBe("Somente Locação")
    expect(resumoSecoesDestinatario(SECOES_TODAS)).toBe("Todos os blocos")
    expect(resumoSecoesDestinatario({ ...SECOES_SOMENTE_LOCACAO, tempo: true })).toBe("2 blocos")
    expect(resumoSecoesDestinatario({ ...SECOES_SOMENTE_LOCACAO, locacao: false })).toBe("Nenhum bloco")
  })
})
