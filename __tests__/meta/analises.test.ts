import { describe, expect, it } from "vitest"
import { analisarInstagram, analisarPost, formatoDe, partesBRT, porDiaSemana, ranking, variacaoPct, type PostIG } from "@/lib/instagram/analise"
import { classificarCampanha, classificarCampanhas, limitesDoMes, mesAnterior, periodoAnterior, type CampanhaAuditada } from "@/lib/meta/analise-campanhas"

const post = (o: Partial<PostIG> = {}): PostIG => ({ id: "1", permalink: "https://i/x", legenda: "", miniatura: null, formato: "Reels", publicadoEm: "2026-11-02T15:00:00Z", curtidas: 80, comentarios: 10, alcance: 1000, salvamentos: 8, compartilhamentos: 2, visualizacoes: 3000, ...o })

describe("instagram", () => {
  it("classifica o formato", () => {
    expect(formatoDe("VIDEO", "REELS")).toBe("Reels")
    expect(formatoDe("CAROUSEL_ALBUM")).toBe("Carrossel")
    expect(formatoDe("IMAGE")).toBe("Imagem")
  })
  it("engajamento = interações ÷ alcance", () => {
    const p = analisarPost(post())
    expect(p.interacoes).toBe(100)
    expect(p.taxaEngajamento).toBe(10)
    expect(analisarPost(post({ alcance: null })).taxaEngajamento).toBeNull()
  })
  it("usa o fuso de Brasília para dia e hora", () => {
    // 02/11/2026 01:30 UTC = domingo 01/11 22:30 em Brasília
    expect(partesBRT("2026-11-02T01:30:00Z")).toEqual({ diaSemana: 0, hora: 22 })
  })
  it("agrupa por dia e ordena pelo melhor engajamento", () => {
    const ps = [post({ id: "a", publicadoEm: "2026-11-02T15:00:00Z", curtidas: 200 }), post({ id: "b", publicadoEm: "2026-11-03T15:00:00Z", curtidas: 20 })].map(analisarPost)
    const g = porDiaSemana(ps)
    expect(g[0].rotulo).toBe("Segunda")
    expect(g).toHaveLength(2)
  })
  it("ranking separa melhores e piores sem repetir", () => {
    const ps = Array.from({ length: 12 }, (_, i) => analisarPost(post({ id: String(i), curtidas: i * 10 })))
    const { melhores, piores } = ranking(ps, 3)
    expect(melhores).toHaveLength(3)
    expect(melhores[0].curtidas).toBeGreaterThan(piores[0].curtidas)
    expect(piores.some((p) => melhores.includes(p))).toBe(false)
  })
  it("resumo e comparação", () => {
    const a = analisarInstagram([post(), post({ id: "2", alcance: 3000 })], 30)
    expect(a.resumo.totalPosts).toBe(2)
    expect(a.resumo.alcanceTotal).toBe(4000)
    expect(a.resumo.postsPorSemana).toBe(0.5)
    expect(variacaoPct(120, 100)).toBe(20)
    expect(variacaoPct(5, 0)).toBeNull()
  })
})

const camp = (o: Partial<CampanhaAuditada> = {}): CampanhaAuditada => ({ campaignId: "c", campaignName: "Camp", spend: 1000, metaResults: 20, crmLeads: 20, visitas: 5, fechamentos: 0, vgvFechado: 0, comissaoFechada: 0, roasComissao: "0.0x", ...o })

describe("campanhas", () => {
  it("poucos dados abaixo do piso de gasto", () => expect(classificarCampanha(camp({ spend: 50 }), 50).acao).toBe("sem_dados"))
  it("escala quem fechou com retorno >= 3x", () => expect(classificarCampanha(camp({ fechamentos: 2, roasComissao: "4.2x" }), 50).acao).toBe("escalar"))
  it("pausa quem gastou e não gerou lead, citando divergência com a Meta", () => {
    const r = classificarCampanha(camp({ crmLeads: 0, metaResults: 12 }), 50)
    expect(r.acao).toBe("pausar")
    expect(r.motivo).toContain("integração")
  })
  it("otimiza quando o CPL real passa de 1,5x a média", () => expect(classificarCampanha(camp({ spend: 1000, crmLeads: 10 }), 40).acao).toBe("otimizar"))
  it("otimiza muitos leads sem visita", () => expect(classificarCampanha(camp({ spend: 300, crmLeads: 12, visitas: 0 }), 25).acao).toBe("otimizar"))
  it("mantém quando está saudável", () => expect(classificarCampanha(camp({ spend: 400, crmLeads: 20, visitas: 4 }), 20).acao).toBe("manter"))
  it("ordena por prioridade de ação", () => {
    const r = classificarCampanhas([camp({ campaignId: "m", spend: 400, crmLeads: 20, visitas: 4 }), camp({ campaignId: "p", crmLeads: 0 })], { gastoTotalMeta: 1400, leadsReaisNoCrm: 20 })
    expect(r.map((x) => x.campaignId)).toEqual(["p", "m"])
  })
})

describe("períodos", () => {
  it("período anterior tem a mesma duração", () => expect(periodoAnterior("2026-11-01", "2026-11-30")).toEqual({ since: "2026-10-02", until: "2026-10-31" }))
  it("limites do mês e mês anterior", () => {
    expect(limitesDoMes("2026-02")).toEqual({ since: "2026-02-01", until: "2026-02-28" })
    expect(mesAnterior("2026-01")).toBe("2025-12")
    expect(mesAnterior("2026-11")).toBe("2026-10")
  })
})
