import { describe, expect, it } from "vitest"
import {
  avaliarInstancia,
  ehHorarioUtil,
  limiarSilencioMinutos,
  minutosUteisEntre,
  textoAlerta,
  type InstanciaParaAvaliar,
} from "@/lib/whatsapp/saude-instancias"

// Todas as datas abaixo em UTC; Brasília = UTC-3.
// Terça 17/11/2026 11:00 UTC = 08:00 BRT
const TERCA_8H = new Date("2026-11-17T11:00:00Z")
const TERCA_12H = new Date("2026-11-17T15:00:00Z")
const TERCA_15H = new Date("2026-11-17T18:00:00Z")

function inst(p: Partial<InstanciaParaAvaliar>): InstanciaParaAvaliar {
  return {
    instanceName: "jessica-borin-a74b1118",
    corretorId: "u1",
    status: "conectado",
    atualizadoEm: null,
    ultimaRecebida: null,
    recebidasNaJanela: 900,
    ...p,
  }
}

describe("minutosUteisEntre / ehHorarioUtil", () => {
  it("conta só 08h–20h de segunda a sábado", () => {
    // terça 08:00 → 12:00 BRT = 240 min
    expect(minutosUteisEntre(TERCA_8H, TERCA_12H)).toBe(240)
    // segunda 19:00 BRT → terça 09:00 BRT = 60 (segunda) + 60 (terça) = 120
    expect(minutosUteisEntre(new Date("2026-11-16T22:00:00Z"), new Date("2026-11-17T12:00:00Z"))).toBe(120)
  })

  it("ignora a noite e o domingo", () => {
    // sábado 19:00 BRT → segunda 09:00 BRT = 60 (sáb) + 0 (dom) + 60 (seg) = 120
    expect(minutosUteisEntre(new Date("2026-11-14T22:00:00Z"), new Date("2026-11-16T12:00:00Z"))).toBe(120)
    expect(ehHorarioUtil(new Date("2026-11-15T15:00:00Z"))).toBe(false) // domingo 12h
    expect(ehHorarioUtil(new Date("2026-11-17T01:00:00Z"))).toBe(false) // segunda 22h BRT
    expect(ehHorarioUtil(TERCA_12H)).toBe(true)
  })

  it("intervalo invertido ou vazio vale 0", () => {
    expect(minutosUteisEntre(TERCA_12H, TERCA_8H)).toBe(0)
    expect(minutosUteisEntre(TERCA_12H, TERCA_12H)).toBe(0)
  })
})

describe("limiarSilencioMinutos", () => {
  it("linha movimentada dispara cedo, linha parada espera mais, com teto e piso", () => {
    const movimentada = limiarSilencioMinutos(900, TERCA_15H)
    const calma = limiarSilencioMinutos(60, TERCA_15H)
    expect(movimentada).toBe(120) // piso
    expect(calma).toBeGreaterThan(movimentada)
    expect(limiarSilencioMinutos(0, TERCA_15H)).toBe(720) // teto
    expect(limiarSilencioMinutos(1, TERCA_15H)).toBe(720)
  })
})

describe("avaliarInstancia", () => {
  it("caso Jéssica: conectada, linha movimentada, sem mensagens há mais de 2h úteis", () => {
    const p = avaliarInstancia(inst({ ultimaRecebida: "2026-11-15T09:19:23Z" }), TERCA_15H)
    expect(p?.tipo).toBe("conectada_sem_mensagens")
    expect(p?.detalhe).toContain("travada")
  })

  it("linha movimentada com mensagem recente não alerta", () => {
    expect(avaliarInstancia(inst({ ultimaRecebida: "2026-11-17T17:50:00Z" }), TERCA_15H)).toBeNull()
  })

  it("não alerta de manhã cedo só porque a noite foi silenciosa", () => {
    // última mensagem ontem 19:30 BRT; agora 08:30 BRT → 30 min úteis de ontem + 30 de hoje = 60
    const agora = new Date("2026-11-17T11:30:00Z")
    expect(avaliarInstancia(inst({ ultimaRecebida: "2026-11-16T22:30:00Z" }), agora)).toBeNull()
  })

  it("fora do horário útil não verifica silêncio", () => {
    const domingo = new Date("2026-11-15T15:00:00Z")
    expect(avaliarInstancia(inst({ ultimaRecebida: "2026-11-10T12:00:00Z" }), domingo)).toBeNull()
  })

  it("conectada sem nenhuma mensagem na janela alerta", () => {
    const p = avaliarInstancia(inst({ ultimaRecebida: null, recebidasNaJanela: 0 }), TERCA_15H)
    expect(p?.detalhe).toContain("nenhuma mensagem")
  })

  it("caso Daline: presa em conectando há mais de 1h alerta; menos de 1h não", () => {
    const presa = inst({ instanceName: "daline-fba44ec9", status: "conectando", atualizadoEm: "2026-11-10T17:10:00Z" })
    const p = avaliarInstancia(presa, TERCA_15H)
    expect(p?.tipo).toBe("presa_conectando")
    expect(p?.detalhe).toContain("conectando")
    expect(avaliarInstancia({ ...presa, atualizadoEm: "2026-11-17T17:30:00Z" }, TERCA_15H)).toBeNull()
  })

  it("presa em conectando alerta mesmo fora do horário útil (leads de anúncio chegam à noite)", () => {
    const madrugada = new Date("2026-11-17T05:00:00Z")
    const p = avaliarInstancia(inst({ status: "conectando", atualizadoEm: "2026-11-16T12:00:00Z" }), madrugada)
    expect(p?.tipo).toBe("presa_conectando")
  })

  it("desconectada é assunto do aviso antigo e não entra aqui", () => {
    expect(avaliarInstancia(inst({ status: "desconectado" }), TERCA_15H)).toBeNull()
  })

  it("texto do alerta cita corretor e instância", () => {
    const p = avaliarInstancia(inst({ ultimaRecebida: "2026-11-15T09:19:23Z" }), TERCA_15H)!
    const t = textoAlerta("Jéssica", p)
    expect(t).toContain("Jéssica")
    expect(t).toContain("(jessica-borin-a74b1118)")
  })
})
