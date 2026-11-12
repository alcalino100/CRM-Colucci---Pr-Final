import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = Record<string, any>
const tables: Record<string, Row[]> = {}
let seq = 0

// Banco em memória com a API encadeável do supabase-js que a régua usa.
function from(name: string) {
  const rows = (tables[name] ??= [])
  let op: "select" | "insert" | "update" = "select"
  let payload: Row = {}
  let filtros: ((r: Row) => boolean)[] = []
  let ordem: { col: string; asc: boolean } | null = null
  let faixa: [number, number] | null = null
  let contar = false
  let soContagem = false

  const exec = () => {
    if (op === "insert") {
      const ativo = ["scheduled", "processing", "retrying", "pending_validation", "blocked_hour"]
      const dup = rows.some(
        (r) =>
          r.lead_id === payload.lead_id &&
          r.automation_id === payload.automation_id &&
          ativo.includes(r.status) &&
          ativo.includes(payload.status)
      )
      if (dup) return { data: null, error: { code: "23505", message: "duplicate" } }
      rows.push({ id: `${name}-${++seq}`, ...payload })
      return { data: null, error: null }
    }
    let sel = rows.filter((r) => filtros.every((f) => f(r)))
    if (op === "update") {
      sel.forEach((r) => Object.assign(r, payload))
      return { data: sel.map((r) => ({ id: r.id })), error: null }
    }
    if (ordem) {
      const { col, asc } = ordem
      sel = [...sel].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
    }
    if (faixa) sel = sel.slice(faixa[0], faixa[1] + 1)
    if (soContagem) return { count: sel.length, data: null, error: null }
    return { data: sel.map((r) => ({ ...r })), count: contar ? sel.length : undefined, error: null }
  }

  const q: any = {
    select: (_c?: string, o?: { count?: string; head?: boolean }) => {
      if (o?.count) contar = true
      if (o?.head) soContagem = true
      return q
    },
    insert: (p: Row) => ((op = "insert"), (payload = p), q),
    update: (p: Row) => ((op = "update"), (payload = p), q),
    eq: (c: string, v: unknown) => (filtros.push((r) => r[c] === v), q),
    in: (c: string, vs: unknown[]) => (filtros.push((r) => vs.includes(r[c])), q),
    is: (c: string, v: null) => (filtros.push((r) => (r[c] ?? null) === v), q),
    lte: (c: string, v: string) => (filtros.push((r) => r[c] != null && r[c] <= v), q),
    order: (col: string, o: { ascending: boolean }) => ((ordem = { col, asc: o.ascending }), q),
    range: (a: number, b: number) => ((faixa = [a, b]), q),
    maybeSingle: async () => {
      const r = exec() as any
      return { data: r.data?.[0] ?? null, error: null }
    },
    then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
  }
  return q
}

vi.mock("@/lib/whatsapp/server", () => ({ wsupabase: { from } }))
vi.mock("@/lib/automation-services", () => ({
  calculateScheduledAt: () => "2099-01-01T11:00:00.000Z",
  getLastHumanInteraction: async () => ({ timestamp: null }),
  createLog: async () => {},
}))
vi.mock("@/lib/automation-worker/ia-coordination", () => ({
  leadTemIAAtiva: () => false,
  tagsDoLead: (refs: unknown) =>
    Array.isArray(refs) ? refs.map((r) => String((r as { ref?: string })?.ref ?? r).toLowerCase()) : [],
}))

import { criarJobsFollowup } from "@/lib/automation-worker/followup-creator"
import { MAX_FILA_FOLLOWUP } from "@/lib/automation-worker/constants"

const AUTO = { id: "auto-fu", supervisor_user_id: null, wait_config: {} }
const horas = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const id = (n: number) => `lead-${String(n).padStart(4, "0")}`

function lead(n: number, extra: Row = {}): Row {
  return {
    id: id(n),
    nome: `Lead ${n}`,
    status: "em_automacao",
    origem: "Tráfego Pago",
    telefone: "18996917711",
    corretor_id: null,
    arquivado_em: null,
    fechado_em: null,
    referencias: [],
    observacoes: "",
    atualizado_em: horas(24 * 30 + (1000 - n)), // n maior = mais novo
    ...extra,
  }
}

function jobsDoLead(leadId: string): Row[] {
  return tables.automation_jobs.filter((j) => j.lead_id === leadId)
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  tables.leads = []
  tables.automation_jobs = []
  seq = 0
})

describe("criarJobsFollowup — fila não trava mais nos leads mais antigos", () => {
  it("D+1 chega aos leads novos mesmo com 120 leads antigos que já têm job", async () => {
    for (let n = 1; n <= 150; n++) tables.leads.push(lead(n))
    // Os 120 mais antigos já foram tratados (têm job concluído da régua)
    for (let n = 1; n <= 120; n++) {
      tables.automation_jobs.push({
        id: `old-${n}`, automation_id: AUTO.id, lead_id: id(n), status: "sent",
        sent_at: horas(24 * 20), responded_at: null, metadata: { step: 3 },
      })
    }
    const results = { created: 0 }
    await criarJobsFollowup(AUTO, results, null)

    expect(results.created).toBe(30)
    for (let n = 121; n <= 150; n++) {
      const novos = jobsDoLead(id(n)).filter((j) => j.status === "scheduled")
      expect(novos).toHaveLength(1)
      expect(novos[0].metadata).toMatchObject({ step: 1, followup_stage: "D+1" })
    }
    // Os leads já tratados não ganham job novo
    expect(jobsDoLead(id(1)).filter((j) => j.status === "scheduled")).toHaveLength(0)
  })

  it("quem entra no D+1 sai de Em Automação e vai para Em Follow-up", async () => {
    tables.leads.push(lead(1))
    await criarJobsFollowup(AUTO, { created: 0 }, null)
    expect(tables.leads[0].status).toBe("em_followup")
  })

  it("respeita o teto da fila: com a fila cheia não cria nada", async () => {
    for (let n = 1; n <= 10; n++) tables.leads.push(lead(n))
    for (let n = 1; n <= MAX_FILA_FOLLOWUP; n++) {
      tables.automation_jobs.push({
        id: `fila-${n}`, automation_id: AUTO.id, lead_id: `outro-${n}`, status: "scheduled", metadata: { step: 1 },
      })
    }
    const results = { created: 0 }
    await criarJobsFollowup(AUTO, results, null)
    expect(results.created).toBe(0)
  })

  it("não cria job para lead que o despachante cancelaria (outra origem, sem tag)", async () => {
    tables.leads.push(lead(1, { origem: "Indicação" }))
    tables.leads.push(lead(2, { status: "novo" }))
    tables.leads.push(lead(3, { telefone: "123" }))
    const results = { created: 0 }
    await criarJobsFollowup(AUTO, results, null, new Set())
    expect(results.created).toBe(0)
  })
})

describe("criarJobsFollowup — D+2 e D+3 também andam", () => {
  it("D+2 alcança os leads além dos 100 primeiros envios de D+1", async () => {
    for (let n = 1; n <= 130; n++) {
      tables.leads.push(lead(n, { status: "em_followup" }))
      tables.automation_jobs.push({
        id: `d1-${n}`, automation_id: AUTO.id, lead_id: id(n), status: "sent",
        sent_at: horas(24 * 10 - n / 100), responded_at: null, metadata: { step: 1 },
      })
    }
    // Os 110 primeiros já têm D+2 enviado (há 10h: ainda não é hora do D+3)
    for (let n = 1; n <= 110; n++) {
      tables.automation_jobs.push({
        id: `d2-${n}`, automation_id: AUTO.id, lead_id: id(n), status: "sent",
        sent_at: horas(10), responded_at: null, metadata: { step: 2 },
      })
    }
    const results = { created: 0 }
    await criarJobsFollowup(AUTO, results, null)

    const d2Novos = tables.automation_jobs.filter(
      (j) => j.status === "scheduled" && j.metadata.step === 2
    )
    expect(d2Novos.map((j) => j.lead_id).sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => id(111 + i))
    )
    expect(d2Novos[0].metadata.template_id).toBe("a0000000-0000-0000-0000-000000000003")
  })

  it("backlog: lead preso em Em Automação que já passou do D+1 entra em Follow-up ao ganhar o D+2", async () => {
    tables.leads.push(lead(1, { status: "em_automacao" }))
    tables.automation_jobs.push({
      id: "d1", automation_id: AUTO.id, lead_id: id(1), status: "sent",
      sent_at: horas(48), responded_at: null, metadata: { step: 1 },
    })
    await criarJobsFollowup(AUTO, { created: 0 }, null)
    expect(jobsDoLead(id(1)).some((j) => j.status === "scheduled" && j.metadata.step === 2)).toBe(true)
    expect(tables.leads[0].status).toBe("em_followup")
  })

  it("D+3 vem antes do D+1 quando a fila tem pouca folga", async () => {
    // Fila com folga de apenas 1 vaga
    for (let n = 1; n <= MAX_FILA_FOLLOWUP - 1; n++) {
      tables.automation_jobs.push({
        id: `fila-${n}`, automation_id: AUTO.id, lead_id: `outro-${n}`, status: "scheduled", metadata: { step: 1 },
      })
    }
    tables.leads.push(lead(1, { status: "em_followup" }), lead(2))
    tables.automation_jobs.push({
      id: "d2", automation_id: AUTO.id, lead_id: id(1), status: "sent",
      sent_at: horas(30), responded_at: null, metadata: { step: 2 },
    })
    await criarJobsFollowup(AUTO, { created: 0 }, null)
    expect(jobsDoLead(id(1)).some((j) => j.metadata?.step === 3 && j.status === "scheduled")).toBe(true)
    expect(jobsDoLead(id(2))).toHaveLength(0)
  })
})

describe("criarJobsFollowup — falhas e encerramento", () => {
  it("lead cujo único job falhou por 'Connection Closed' recebe novo D+1", async () => {
    tables.leads.push(lead(1), lead(2))
    tables.automation_jobs.push(
      { id: "f1", automation_id: AUTO.id, lead_id: id(1), status: "failed", failure_code: "HTTP_500", failure_reason: "Connection Closed", metadata: null },
      { id: "f2", automation_id: AUTO.id, lead_id: id(2), status: "failed", failure_code: "HTTP_400", failure_reason: '[{"exists":false,"number":"1"}]', metadata: null }
    )
    await criarJobsFollowup(AUTO, { created: 0 }, null)
    expect(jobsDoLead(id(1)).filter((j) => j.status === "scheduled")).toHaveLength(1)
    expect(jobsDoLead(id(2)).filter((j) => j.status === "scheduled")).toHaveLength(0)
  })

  it("D+3 sem resposta há 48h+ leva o lead para Frio, inclusive o que estava em Em Automação", async () => {
    tables.leads.push(lead(1, { status: "em_automacao" }), lead(2, { status: "em_followup" }), lead(3, { status: "atendimento_ia" }))
    for (const n of [1, 2, 3]) {
      tables.automation_jobs.push({
        id: `d3-${n}`, automation_id: AUTO.id, lead_id: id(n), status: "sent",
        sent_at: horas(72), responded_at: null, metadata: { step: 3 },
      })
    }
    await criarJobsFollowup(AUTO, { created: 0 }, null)
    expect(tables.leads.find((l) => l.id === id(1))!.status).toBe("frio")
    expect(tables.leads.find((l) => l.id === id(2))!.status).toBe("frio")
    expect(tables.leads.find((l) => l.id === id(3))!.status).toBe("atendimento_ia")
  })

  it("não encerra quem recebeu o D+3 há menos de 48h", async () => {
    tables.leads.push(lead(1, { status: "em_followup" }))
    tables.automation_jobs.push({
      id: "d3", automation_id: AUTO.id, lead_id: id(1), status: "sent",
      sent_at: horas(30), responded_at: null, metadata: { step: 3 },
    })
    await criarJobsFollowup(AUTO, { created: 0 }, null)
    expect(tables.leads[0].status).toBe("em_followup")
  })
})
