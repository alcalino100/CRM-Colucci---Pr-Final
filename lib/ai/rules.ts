// Regras de atendimento da IA (GoHighLevel-style): QUEM responder (tags/origem), QUANDO
// (horário/dias), ONDE (instâncias/canais) e COMO (estilo). Persistidas em
// ai_agents.config.rules como objeto. Defaults seguros — comportamento atual preservado.

export type RulesSchedule = {
  enabled: boolean           // respeitar horário comercial (default true)
  days: number[]             // 0=domingo ... 6=sábado
  start: string              // "HH:MM" hora local
  end: string                // "HH:MM" hora local
  timezone: string
}

export type RulesTarget = {
  // QUEM: só responde a leads com origem nesta lista (vazio = qualquer).
  // A resposta só ocorre se o lead estiver nas origens permitidas E (em modo
  // any) tiver ao menos uma das tags, ou (em modo all) tiver todas as tags.
  origensPermitidas: string[]          // ex.: ["Tráfego Pago"] — vazio = todas
  tags: string[]                       // ex.: ["teste-ia"] — vazio = qualquer tag
  tagsModo: "any" | "all" | "none"     // none = ignora tags (responde p/ qualquer tag da origem)
  numeroTeste: string[]
}

export type RulesStyle = {
  maxLines: number           // tamanho máximo ~linhas da resposta
  maxQuestions: number       // máx. perguntas por mensagem
  emojis: "none" | "poucos" | "normal"
  tom: string                // adj. de tom (passa pro prompt)
  proativarReativacao: boolean  // se true, relembra imóvel/follow-up do lead
  saudacaoDefault: string    // ex.: "Olá! Sou {nome_ia}, da Colucci Imóveis. Como posso ajudar?"
}

export type AgentRules = {
  enable: boolean               // master switch do agente
  schedule: RulesSchedule
  target: RulesTarget
  style: RulesStyle
  channels: string[]            // onde responder (ex.: ["whatsapp"]); vazio = todos habilitados
  whitelistInstances: string[]  // instâncias vinculadas (espelha config.testInstance + extras)
}

export const DAY_LABELS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"]

function parseCfg(cfg: unknown): Record<string, any> {
  if (!cfg) return {}
  if (typeof cfg === "string") { try { return JSON.parse(cfg) } catch { return {} } }
  if (typeof cfg === "object") return cfg as Record<string, any>
  return {}
}

export function getRules(config: unknown): AgentRules {
  const cfg = parseCfg(config)
  const r = cfg?.rules || {}
  const schedule = r?.schedule || {}
  const target = r?.target || {}
  const style = r?.style || {}
  return {
    enable: r?.enable !== false,
    schedule: {
      enabled: schedule?.enabled !== false,
      days: Array.isArray(schedule?.days) && schedule.days.length ? schedule.days : [1,2,3,4,5,6],
      start: schedule?.start || "08:00",
      end: schedule?.end || "19:00",
      timezone: schedule?.timezone || "America/Sao_Paulo",
    },
    target: {
      origensPermitidas: Array.isArray(target?.origensPermitidas) ? target.origensPermitidas : ["Tráfego Pago"],
      tags: Array.isArray(target?.tags) ? target.tags : [],
      tagsModo: (target?.tagsModo === "any" || target?.tagsModo === "all") ? target.tagsModo : "none",
      numeroTeste: Array.isArray(target?.numeroTeste) && target.numeroTeste.length ? target.numeroTeste : ["5518981729340","18981729340"],
    },
    style: {
      maxLines: typeof style?.maxLines === "number" ? style.maxLines : 2,
      maxQuestions: typeof style?.maxQuestions === "number" ? style.maxQuestions : 1,
      emojis: ["none","poucos","normal"].includes(style?.emojis) ? style.emojis : "poucos",
      tom: typeof style?.tom === "string" ? style.tom : "acolhedor, claro e direto",
      proativarReativacao: style?.proativarReativacao !== false,
      saudacaoDefault: typeof style?.saudacaoDefault === "string" ? style.saudacaoDefault : "",
    },
    channels: Array.isArray(r?.channels) ? r.channels : ["whatsapp"],
    whitelistInstances: Array.isArray(r?.whitelistInstances) ? r.whitelistInstances : [],
  }
}

export function getBoundInstances(config: unknown): string[] {
  const cfg = parseCfg(config)
  const rules = getRules(config)
  const extra = cfg?.testInstance ? [cfg.testInstance] : []
  return Array.from(new Set([...extra, ...rules.whitelistInstances])).filter(Boolean)
}

// Verifica se agora está dentro do horário/dia configurado (America/Sao_Paulo).
export function dentroDoHorario(rules: AgentRules, agora = new Date()): boolean {
  const s = rules.schedule
  if (!s.enabled) return true
  const part = new Intl.DateTimeFormat("pt-BR", { timeZone: s.timezone, weekday: "short" as const, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(agora)
  const wk = part.find(p => p.type === "weekday")?.value.toLowerCase() || ""
  const hora = part.find(p => p.type === "hour")?.value || "00"
  const min = part.find(p => p.type === "minute")?.value || "00"
  const idx = wk === "dom" ? 0 : wk === "seg" ? 1 : wk === "ter" ? 2 : wk === "qua" ? 3 : wk === "qui" ? 4 : wk === "sex" ? 5 : 6
  if (!s.days.includes(idx)) return false
  const nowMin = parseInt(hora, 10) * 60 + parseInt(min, 10)
  const [sh, sm] = s.start.split(":").map(Number)
  const [eh, em] = s.end.split(":").map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  if (endMin <= startMin) return nowMin >= startMin || nowMin < endMin // atravessa a meia-noite
  return nowMin >= startMin && nowMin < endMin
}

// QUEM: o lead pode ser respondido? (origem + tags)
const normalize = (v: string) => v.toLowerCase().trim()
export function leadAptoParaResposta(rules: AgentRules, lead: { origem?: string | null; referencias?: string[] | null } | null): boolean {
  if (!lead) return false
  const t = rules.target
  if (t.origensPermitidas.length && !t.origensPermitidas.some(o => normalize(o) === normalize(String(lead.origem || "")))) return false
  const tags = (lead.referencias || []).map(normalize)
  if (t.tagsModo === "none" || !t.tags.length) return true
  if (t.tagsModo === "all") return t.tags.every(tag => tags.includes(normalize(tag)))
  return t.tags.some(tag => tags.includes(normalize(tag)))
}

// Monta o "suplemento de regras" que será anexado ao system prompt da geração.
export function regrasParaPrompt(rules: AgentRules, nomeIA: string): string {
  const s = rules.style
  const linhas: string[] = [
    `[REGRA DE ESTILO — sempre aplicar]`,
    `Respostas com no máximo ${s.maxLines} linhas.`,
    `Faça apenas ${s.maxQuestions === 1 ? "1 pergunta" : `${s.maxQuestions} perguntas`} por mensagem.`,
    s.emojis === "none" ? "Não use emojis." : s.emojis === "poucos" ? "Use no máximo 1 emoji por mensagem, só se fizer sentido." : "Pode usar emojis com moderação.",
    `Tom: consultivo, ${s.tom}.`,
  ]
  if (s.saudacaoDefault) linhas.push(`Quando for a primeira mensagem, use: "${s.saudacaoDefault.replace("{nome_ia}", nomeIA)}"`)
  return linhas.join("\n")
}