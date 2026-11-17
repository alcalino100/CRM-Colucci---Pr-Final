import { describe, expect, it } from "vitest"
import { HORAS_RESUMO_BRT, montarResumoAlertas } from "@/lib/whatsapp/resumo-alertas"
import vercel from "@/vercel.json"

const AGORA = new Date("2026-11-17T15:00:00Z") // 12h BRT

describe("resumo de alertas do WhatsApp", () => {
  it("não gera mensagem quando está tudo bem", () => {
    expect(montarResumoAlertas({ caidas: [], problemas: [] }, AGORA)).toBeNull()
  })

  it("junta desconectadas e linhas travadas em UM texto", () => {
    const texto = montarResumoAlertas(
      {
        caidas: [{ nome: "Diego", instanceName: "diego-7735934c", desdeIso: "2026-11-16T15:00:00Z" }],
        problemas: [{ nome: "Jessica", instanceName: "jessica-borin-a74b1118", detalhe: "sem receber mensagens." }],
      },
      AGORA,
    )!
    expect(texto).toContain("RESUMO DE ALERTAS")
    expect(texto).toContain("Diego (diego-7735934c) (há 24h)")
    expect(texto).toContain("Jessica (jessica-borin-a74b1118): sem receber mensagens.")
    expect(texto.match(/RESUMO DE ALERTAS/g)).toHaveLength(1)
  })

  it("cron do resumo roda só às 08h, 12h e 18h de Brasília (11h, 15h e 21h UTC)", () => {
    const cron = (vercel as { crons: { path: string; schedule: string }[] }).crons.find((c) => c.path === "/api/whatsapp/resumo-alertas")
    expect(cron?.schedule).toBe("0 11,15,21 * * *")
    expect(HORAS_RESUMO_BRT).toEqual([8, 12, 18])
  })
})
