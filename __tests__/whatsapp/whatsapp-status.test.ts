import { describe, it, expect } from "vitest"
import { playAlertChime, type WhatsAppInstance } from "@/lib/whatsapp-status-context"

describe("WhatsApp Status & Realtime Alert Logic", () => {
  it("deve identificar instâncias da Patricia corretamente", () => {
    const instances: WhatsAppInstance[] = [
      {
        id: "1",
        corretor_id: "abc",
        instance_name: "patricia-6c2875b4",
        numero: "5518991976332",
        status: "conectado",
        isPatricia: true,
      },
      {
        id: "2",
        corretor_id: "def",
        instance_name: "patricia2",
        numero: "5518997095346",
        status: "desconectado",
        isPatricia: true,
      },
      {
        id: "3",
        corretor_id: "ghi",
        instance_name: "diego-7735934c",
        corretorNome: "Diego",
        numero: null,
        status: "desconectado",
        isPatricia: false,
      },
      {
        id: "4",
        corretor_id: "jkl",
        instance_name: "brayon-22b51e92",
        corretorNome: "Brayon",
        numero: "5518991016448",
        status: "conectado",
        isPatricia: false,
      },
    ]

    const patriciaLines = instances.filter((i) => i.isPatricia)
    expect(patriciaLines.length).toBe(2)

    const patriciaDisconnected = patriciaLines.some((i) => i.status !== "conectado")
    expect(patriciaDisconnected).toBe(true)

    const disconnectedCount = instances.filter((i) => i.status !== "conectado").length
    expect(disconnectedCount).toBe(2)

    const brokerDisconnected = instances.filter((i) => !i.isPatricia && i.status !== "conectado")
    expect(brokerDisconnected.length).toBe(1)
    expect(brokerDisconnected[0].corretorNome).toBe("Diego")
  })

  it("playAlertChime não deve lançar erro mesmo se window.AudioContext for simulado ou ausente", () => {
    expect(() => playAlertChime()).not.toThrow()
  })

  it("deve ordenar instâncias desconectadas primeiro para priorização visual do gestor", () => {
    const list: WhatsAppInstance[] = [
      { id: "1", corretor_id: null, instance_name: "inst-a", status: "conectado", corretorNome: "Aline" },
      { id: "2", corretor_id: null, instance_name: "inst-b", status: "desconectado", corretorNome: "Bernardo" },
      { id: "3", corretor_id: null, instance_name: "patricia-1", status: "desconectado", isPatricia: true, corretorNome: "Patricia" },
    ]

    const sorted = [...list].sort((a, b) => {
      if (a.status !== "conectado" && b.status === "conectado") return -1
      if (a.status === "conectado" && b.status !== "conectado") return 1
      if (a.isPatricia && !b.isPatricia) return -1
      if (!a.isPatricia && b.isPatricia) return 1
      return (a.corretorNome || "").localeCompare(b.corretorNome || "")
    })

    // Desconectados primeiro, com Patricia tendo prioridade máxima
    expect(sorted[0].isPatricia).toBe(true)
    expect(sorted[1].corretorNome).toBe("Bernardo")
    expect(sorted[2].status).toBe("conectado")
  })
})
