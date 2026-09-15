import { NextResponse } from "next/server"
import { comTagsEntradaAutomacao, normalizePhone, semTagsFluxo } from "@/lib/labels"
import { onlyDigits, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// Regressão por inatividade (cron diário). Duas regras:
// - TRÁFEGO PAGO em "em_atendimento" parado 3d → esfria (frio) e entra na
//   automação de reativação de base (em_automacao + tag automacao). Mexida de
//   corretor só reinicia a contagem (atualizado_em); nada isenta — só job
//   aberto e contato recente seguram.
// - Demais origens em atendimento paradas 3d → volta p/ Novo Lead (frio),
//   com travas: regressão nos últimos 7d, job aberto, obs humana, contato recente.
const DIAS_INATIVIDADE = 3
const DIAS_ANTI_LOOP = 7
const DIAS_FOLLOWUP_PERDIDO = 7
const ESTAGIOS = ["em_atendimento", "atendimento_humano"]
const LIMITE = 500

const TERMINAL_JOBS = ["sent", "delivered", "read", "responded", "cancelled_human", "cancelled_condition", "cancelled_manual", "blocked_limit", "failed", "cancelled"]

function dataBR(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    const qs = url.searchParams.get("secret")
    const ok = auth === `Bearer ${secret}` || qs === secret
    if (!ok) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 })
  }
  const dry = url.searchParams.get("dry") === "1"
  const dias = Math.max(1, Number(url.searchParams.get("dias") ?? DIAS_INATIVIDADE) || DIAS_INATIVIDADE)
  const corte = new Date(Date.now() - dias * 86400000)

  const { data: leads, error } = await wsupabase
    .from("leads")
    .select("id,nome,telefone,temperatura,observacoes,atualizado_em,status,corretor_id,origem,referencias")
    .in("status", ESTAGIOS)
    .is("arquivado_em", null)
    .is("fechado_em", null)
    .lt("atualizado_em", corte.toISOString())
    .order("atualizado_em", { ascending: true })
    .limit(LIMITE)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  const lista = (leads ?? []) as {
    id: string; nome: string; telefone: string; temperatura: string;
    observacoes: string; atualizado_em: string; status: string; corretor_id: string | null; origem: string;
    referencias: { ref: string }[] | null;
  }[]
  if (!lista.length) return NextResponse.json({ ok: true, avaliados: 0, regredidos: 0, dry })

  const ids = lista.map((l) => l.id)

  // Regressões recentes (anti-loop 7d) + jobs abertos — em lote.
  const ha7d = new Date(Date.now() - DIAS_ANTI_LOOP * 86400000).toISOString()
  const [{ data: regs }, { data: jobs }] = await Promise.all([
    wsupabase.from("automation_logs").select("lead_id").eq("event_type", "lead_regressado_inatividade").in("lead_id", ids).gte("created_at", ha7d).limit(2000),
    wsupabase.from("automation_jobs").select("lead_id").in("lead_id", ids).not("status", "in", `(${TERMINAL_JOBS.join(",")})`).limit(2000),
  ])
  const regredidosRecente = new Set(((regs ?? []) as { lead_id: string }[]).map((r) => r.lead_id))
  const comJobAberto = new Set(((jobs ?? []) as { lead_id: string }[]).map((j) => j.lead_id))

  // Último contato WhatsApp (por lead_id) + por telefone (variações) + visitas — em lote.
  const [{ data: zapPorLead }, { data: visitas }] = await Promise.all([
    wsupabase.from("whatsapp_mensagens").select("lead_id,criado_em").in("lead_id", ids).order("criado_em", { ascending: false }).limit(5000),
    wsupabase.from("visitas").select("lead_id,data,horario").in("lead_id", ids).order("data", { ascending: false }).limit(2000),
  ])
  const ultimoZap = new Map<string, number>()
  for (const w of ((zapPorLead ?? []) as { lead_id: string; criado_em: string }[])) {
    if (!ultimoZap.has(w.lead_id)) ultimoZap.set(w.lead_id, new Date(w.criado_em).getTime())
  }
  const telefonesUnicos = Array.from(new Set(lista.map((l) => onlyDigits(l.telefone || "")).filter(Boolean)))
  const condTel = telefonesUnicos.flatMap((t) => {
    const sem55 = t.startsWith("55") ? t.slice(2) : t
    return [`telefone.ilike.%${t}%`, `telefone.ilike.%${sem55}%`]
  })
  if (condTel.length) {
    const { data: zapPorTel } = await wsupabase
      .from("whatsapp_mensagens")
      .select("telefone,criado_em")
      .or(condTel.join(","))
      .order("criado_em", { ascending: false })
      .limit(5000)
    const porTel = new Map<string, number>()
    for (const w of ((zapPorTel ?? []) as { telefone: string; criado_em: string }[])) {
      const k = normalizePhone(w.telefone || "")
      const t = new Date(w.criado_em).getTime()
      if (k && (!porTel.has(k) || (porTel.get(k) ?? 0) < t)) porTel.set(k, t)
    }
    for (const l of lista) {
      const k = normalizePhone(l.telefone || "")
      const t = porTel.get(k)
      if (t && (!ultimoZap.has(l.id) || (ultimoZap.get(l.id) ?? 0) < t)) ultimoZap.set(l.id, t)
    }
  }
  const ultimaVisita = new Map<string, number>()
  for (const v of ((visitas ?? []) as { lead_id: string; data: string; horario: string }[])) {
    const dt = new Date(`${v.data}T${String(v.horario || "00:00").slice(0, 5)}:00`)
    const t = isNaN(dt.getTime()) ? 0 : dt.getTime()
    if (!ultimaVisita.has(v.lead_id) || (ultimaVisita.get(v.lead_id) ?? 0) < t) ultimaVisita.set(v.lead_id, t)
  }

  let regredidos = 0
  const pulados: Record<string, number> = { com_obs: 0, contato_recente: 0, regressao_recente: 0, job_aberto: 0, trafego_pago: 0, entrariam_automacao: 0, aguardando_humano: 0 }
  const detalhes: { id: string; nome: string; de: string; ultimo_contato: string | null }[] = []
  const corteMs = corte.getTime()

  for (const l of lista) {
    const ultimoContato = Math.max(ultimoZap.get(l.id) ?? 0, ultimaVisita.get(l.id) ?? 0)
    const ultimoTxt = ultimoContato ? dataBR(new Date(ultimoContato)) : "nenhum contato registrado"

    // REGRA TRÁFEGO PAGO (só em_atendimento, 3d parado → reativação de base).
    if (l.origem === "Tráfego Pago" && l.status === "em_atendimento") {
      pulados.trafego_pago++
      if (comJobAberto.has(l.id)) { pulados.job_aberto++; continue }
      if (ultimoContato > corteMs) { pulados.contato_recente++; continue }
      if (dry) { pulados.entrariam_automacao++; continue }
      {
        // Reativação de base: entra em automação (em_automacao) como FRIO
        // (esfriou após 3d parado), permanecendo no funil de Tráfego Pago.
        // Se responder, a IA assume em "Atendimento IA" (transição por resposta no webhook).
        const obsTrafego = `${(l.observacoes ?? "").trim()}\nReativação de base: Tráfego Pago entrou em "Em Automação" após ${dias}d parado em atendimento sem contato/movimentação no CRM (último contato: ${ultimoTxt}). Temperatura: frio (esfriou). Se responder, a IA assume em "Atendimento IA".`.trim().slice(-6000)
        const { error: upErr } = await wsupabase
          .from("leads")
          .update({ status: "em_automacao", temperatura: "frio", observacoes: obsTrafego, referencias: comTagsEntradaAutomacao(l.referencias), atualizado_em: new Date().toISOString() })
          .eq("id", l.id)
        if (upErr) continue
        await wsupabase.from("automation_logs").insert({
          lead_id: l.id,
          event_type: "lead_reativado_trafego_pago_reativacao_base",
          event_title: `Tráfego Pago entrou na reativação de base (Em Automação): ${l.nome}`,
          event_description: `Lead de Tráfego Pago parado ${dias}d em atendimento entrou na automação de reativação de base. Temperatura: frio (esfriou). Permanecerá no funil de Tráfego Pago; se responder, a IA assume em "Atendimento IA".`,
          actor_type: "system",
        }).then(() => {}, () => {})
      }
      continue
    }
    // Tráfego Pago fora de em_atendimento (ex.: Aguardando Atendimento):
    // fora do escopo da automação — não mexe.
    if (l.origem === "Tráfego Pago") { pulados.aguardando_humano++; continue }

    // Legado (demais origens): regressão p/ novo+frio, com as travas antigas.
    if (regredidosRecente.has(l.id)) { pulados.regressao_recente++; continue }
    if (comJobAberto.has(l.id)) { pulados.job_aberto++; continue }
    // Espelho da conversa IA ("[IA ...]") NÃO conta como observação humana —
    // senão nenhum lead atendido pela IA jamais regrediria por inatividade.
    const obsHumana = String(l.observacoes ?? "").split("\n").filter((ln) => !ln.trimStart().startsWith("[IA ")).join("\n").trim()
    if (obsHumana) { pulados.com_obs++; continue }
    if (ultimoContato > corteMs) { pulados.contato_recente++; continue }
    const linha = `🔄 [${dataBR(new Date())}] Retornado para Novo Lead por inatividade: ${dias} dias sem contato e sem movimentação no CRM (último contato: ${ultimoTxt}). Temperatura ajustada para frio.`
    if (!dry) {
      const obs = `${(l.observacoes ?? "").trim()}\n${linha}`.trim().slice(-6000)
      const { error: upErr } = await wsupabase
        .from("leads")
        .update({ status: "novo", temperatura: "frio", observacoes: obs, atualizado_em: new Date().toISOString() })
        .eq("id", l.id)
      if (upErr) continue
      try {
        await wsupabase.from("automation_logs").insert({
          lead_id: l.id,
          event_type: "lead_regressado_inatividade",
          event_title: `Lead voltou para Novo (inatividade): ${l.nome}`,
          event_description: `De "${l.status}" para "novo" + frio após ${dias}d sem contato e sem alteração (último contato: ${ultimoTxt}).`,
          actor_type: "system",
        })
      } catch { /* log é best-effort */ }
    }
    regredidos++
    detalhes.push({ id: l.id, nome: l.nome, de: l.status, ultimo_contato: ultimoContato ? new Date(ultimoContato).toISOString() : null })
  }

  // Follow-up sem resposta em X dias → perdido (fim do fluxo automático).
  // Trava: ignora quem tem job de automação aberto (pode ter envio agendado)
  // e quem teve contato (WhatsApp/visita) após entrar em follow-up.
  const diasFollowup = Math.max(1, Number(url.searchParams.get("dias_followup") ?? DIAS_FOLLOWUP_PERDIDO) || DIAS_FOLLOWUP_PERDIDO)
  const corteFollowup = new Date(Date.now() - diasFollowup * 86400000)
  let perdidos = 0
  const { data: emFollowup } = await wsupabase
    .from("leads")
    .select("id,nome,observacoes,atualizado_em,referencias")
    .eq("status", "em_followup")
    .is("arquivado_em", null)
    .is("fechado_em", null)
    .lt("atualizado_em", corteFollowup.toISOString())
    .order("atualizado_em", { ascending: true })
    .limit(LIMITE)
  const listaFollowup = ((emFollowup ?? []) as { id: string; nome: string; observacoes: string; atualizado_em: string; referencias: { ref: string }[] | null }[])
  if (listaFollowup.length) {
    const idsF = listaFollowup.map((l) => l.id)
    const [{ data: jobsF }, { data: zapF }, { data: visF }] = await Promise.all([
      wsupabase.from("automation_jobs").select("lead_id").in("lead_id", idsF).not("status", "in", `(${TERMINAL_JOBS.join(",")})`).limit(2000),
      wsupabase.from("whatsapp_mensagens").select("lead_id,criado_em").in("lead_id", idsF).order("criado_em", { ascending: false }).limit(5000),
      wsupabase.from("visitas").select("lead_id,data,horario").in("lead_id", idsF).order("data", { ascending: false }).limit(2000),
    ])
    const jobAbertoF = new Set(((jobsF ?? []) as { lead_id: string }[]).map((j) => j.lead_id))
    const ultimoZapF = new Map<string, number>()
    for (const w of ((zapF ?? []) as { lead_id: string; criado_em: string }[])) {
      if (!ultimoZapF.has(w.lead_id)) ultimoZapF.set(w.lead_id, new Date(w.criado_em).getTime())
    }
    const ultimaVisitaF = new Map<string, number>()
    for (const v of ((visF ?? []) as { lead_id: string; data: string; horario: string }[])) {
      const dt = new Date(`${v.data}T${String(v.horario || "00:00").slice(0, 5)}:00`)
      const t = isNaN(dt.getTime()) ? 0 : dt.getTime()
      if (!ultimaVisitaF.has(v.lead_id) || (ultimaVisitaF.get(v.lead_id) ?? 0) < t) ultimaVisitaF.set(v.lead_id, t)
    }
    const corteFMs = corteFollowup.getTime()
    for (const l of listaFollowup) {
      if (jobAbertoF.has(l.id)) continue
      const ultimoContato = Math.max(ultimoZapF.get(l.id) ?? 0, ultimaVisitaF.get(l.id) ?? 0)
      if (ultimoContato > corteFMs) continue
      if (!dry) {
        const linha = `🔻 [${dataBR(new Date())}] Movido para Perdido: ${diasFollowup} dias em follow-up sem resposta e sem contato (fim do fluxo automático).`
        const obs = `${(l.observacoes ?? "").trim()}\n${linha}`.trim().slice(-6000)
        const { error: upErr } = await wsupabase
          .from("leads")
          .update({ status: "perdido", observacoes: obs, referencias: semTagsFluxo(l.referencias), atualizado_em: new Date().toISOString() })
          .eq("id", l.id)
        if (upErr) continue
        try {
          await wsupabase.from("automation_logs").insert({
            lead_id: l.id,
            event_type: "lead_perdido_followup_sem_resposta",
            event_title: `Lead perdido (follow-up sem resposta): ${l.nome}`,
            event_description: `De "em_followup" para "perdido" após ${diasFollowup}d sem resposta e sem contato. Fim do fluxo automático.`,
            actor_type: "system",
          })
        } catch { /* log é best-effort */ }
      }
      perdidos++
    }
  }

  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "regressao_resumo",
      event_title: dry ? "Regressão por inatividade (simulação)" : "Regressão por inatividade executada",
      event_description: `Avaliados: ${lista.length} | Regredidos: ${regredidos} | Perdidos (follow-up): ${perdidos} | Pulados: ${JSON.stringify(pulados)}`,
      actor_type: "system",
    })
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: true, avaliados: lista.length, regredidos, perdidos, pulados, dry, detalhes: detalhes.slice(0, 50) })
}
