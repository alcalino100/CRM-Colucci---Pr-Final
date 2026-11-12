import { logger } from "@/lib/logger"
import { TAG_FOLLOWUP, TAG_NAO_RESPONDEU_AUTOMACAO, TAG_RESPONDEU_AUTOMACAO, comRef, normalizePhone, semRef } from "@/lib/labels"
import { onlyDigits, wsupabase } from "@/lib/whatsapp/server"
import { enviarLeadCapi } from "@/lib/meta/capi"
import { extrairReferenciaDoTexto } from "./ad-detection"
export { mapStatusEntrega } from "./connection-handler"

// Acha o lead cujo telefone bate com o do contato (para vincular a mensagem ao registro do CRM).
// Prioriza o lead pertencente ao corretor da instância, evitando vincular mensagens cruzadas entre corretores.
export async function encontrarLeadPorTelefone(telefone: string, corretorId?: string | null): Promise<string | null> {
  const digits = onlyDigits(telefone)
  if (!digits) return null
  const semDdi = digits.startsWith("55") ? digits.slice(2) : digits
  const ultimos8 = digits.slice(-8)
  const variantes = Array.from(new Set([digits, `55${semDdi}`, semDdi, ultimos8]))
  const { data: candidatos } = await wsupabase
    .from("leads")
    .select("id, telefone, corretor_id, criado_em")
    .or(variantes.map((v) => `telefone.ilike.%${v}%`).join(","))
    .order("criado_em", { ascending: false })
    .limit(30)

  const comp = normalizePhone(telefone)
  const matches = (candidatos ?? []).filter((l) => normalizePhone(l.telefone) === comp)
  if (!matches.length) return null

  if (corretorId) {
    const doCorretor = matches.find((l) => l.corretor_id === corretorId)
    if (doCorretor) return doCorretor.id
  }

  return matches[0].id
}

const RESPOSTA_NAO_PATTERNS = [
  "nao", "não", "nao quero", "não quero", "nao tenho interesse", "não tenho interesse",
  "sem interesse", "nao obrigado", "não obrigado", "nao obrigada", "não obrigada",
  "pare", "para", "stop", "sair", "remover", "excluir", "cancela", "cancelar",
  "nao me interessa", "não me interessa", "deixa pra la", "deixa pra lá",
  "agora nao", "agora não", "nao precisa", "não precisa",
]

export function pareceRespostaNao(texto: string): boolean {
  const t = (texto || "").toLowerCase().trim()
  if (!t || t.length > 40) return false
  return RESPOSTA_NAO_PATTERNS.some((p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p}.`) || t.startsWith(`${p}!`))
}

// Transições por resposta (fluxo automação → IA): quando um lead parado em
// "em_automacao" ou "em_followup" RESPONDE, ele sai da automação sozinho.
export async function transicaoRespostaAutomacao(leadId: string, texto: string): Promise<void> {
  try {
    const { data: lead } = await wsupabase
      .from("leads")
      .select("id,nome,status,corretor_id,observacoes,referencias")
      .eq("id", leadId)
      .maybeSingle()
    if (!lead) return
    const status = String((lead as { status?: unknown }).status ?? "")
    if (status !== "em_automacao" && status !== "em_followup" && status !== "em_atendimento") return

    // em_atendimento: só entra se for RESPOSTA a mensagem de automação enviada
    // (reativação/follow-up) nos últimos 30d — mesma regra da resposta em automação.
    let recusa = false
    if (status === "em_atendimento") {
      const corte = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: jobEnviado } = await wsupabase
        .from("automation_jobs")
        .select("id")
        .eq("lead_id", leadId)
        .in("status", ["sent", "delivered", "read"])
        .gte("sent_at", corte)
        .limit(1)
      if (!jobEnviado?.length) return
    } else {
      recusa = status === "em_automacao" && pareceRespostaNao(texto)
    }

    const destino = recusa ? "em_followup" : "atendimento_ia"
    const destinoLabel = recusa ? "Em Follow-up" : "Atendimento IA"
    const evento = recusa ? "lead_respondeu_nao_followup" : "lead_respondeu_atendimento_ia"

    // Tags de estágio: NÃO → nao-respondeu-automacao + followup; SIM/resposta →
    // respondeu-automacao (limpa nao-respondeu/followup, mantém automacao).
    const refsBase = (lead as { referencias?: unknown }).referencias
    const novasRefs = recusa
      ? comRef(comRef(refsBase as { ref: string }[], { ref: TAG_NAO_RESPONDEU_AUTOMACAO }), { ref: TAG_FOLLOWUP })
      : comRef(semRef(semRef(refsBase as { ref: string }[], TAG_NAO_RESPONDEU_AUTOMACAO), TAG_FOLLOWUP), { ref: TAG_RESPONDEU_AUTOMACAO })

    const { error: upErr } = await wsupabase
      .from("leads")
      .update({ status: destino, referencias: novasRefs, atualizado_em: new Date().toISOString() })
      .eq("id", (lead as { id: string }).id)
      .eq("status", status)
    if (upErr) return

    // Resposta do lead interrompe os próximos passos de follow-up (D+2, D+3)
    try {
      await wsupabase
        .from("automation_jobs")
        .update({ status: "responded", responded_at: new Date().toISOString() })
        .eq("lead_id", (lead as { id: string }).id)
        .in("status", ["sent", "delivered", "read"])

      await wsupabase
        .from("automation_jobs")
        .update({ status: "cancelled_lead_replied" })
        .eq("lead_id", (lead as { id: string }).id)
        .in("status", ["scheduled", "retrying", "blocked_hour"])
    } catch {
      /* best-effort */
    }

    const nome = String((lead as { nome?: unknown }).nome ?? "Lead")
    const motivo = recusa
      ? `respondeu "NÃO" à reativação — vai para nova tentativa (follow-up)`
      : `respondeu à automação — Patricia assume em "Atendimento IA"`

    try {
      const obs = `${String((lead as { observacoes?: unknown }).observacoes ?? "").trim()}\n[Automação] ${nome} ${motivo}.`.trim().slice(-6000)
      await wsupabase.from("leads").update({ observacoes: obs }).eq("id", (lead as { id: string }).id)
    } catch {
      /* obs é best-effort */
    }

    try {
      await wsupabase.from("automation_logs").insert({
        lead_id: (lead as { id: string }).id,
        event_type: evento,
        event_title: `${nome} respondeu — foi para "${destinoLabel}"`,
        event_description: `Lead em "${status}" respondeu "${texto.slice(0, 120)}" e foi movido para "${destino}".`,
        actor_type: "system",
      })
    } catch {
      /* log é best-effort */
    }

    try {
      const notif: Record<string, unknown> = {
        mensagem: `${nome} respondeu à automação e foi para "${destinoLabel}"`,
        tipo: "pipeline",
        modulo: "vendas",
        para_role: "gestor",
        lead_id: (lead as { id: string }).id,
      }
      const dono = (lead as { corretor_id?: unknown }).corretor_id
      if (typeof dono === "string" && dono) notif.usuario_id = dono
      await wsupabase.from("notificacoes").insert(notif)
    } catch {
      /* notify é best-effort */
    }
  } catch {
    /* nunca derruba o webhook */
  }
}

// Reengaja lead existente do corretor ou cria novo lead via anúncio / tráfego pago
export async function reengajarOuCriarLeadTráfego(params: {
  telefone: string
  nome: string
  corpo: string
  corretorId: string
  anuncioId: string | null
  anuncioTitulo: string | null
  clique: Record<string, any> | null
}): Promise<{ leadId: string | null }> {
  const { telefone, nome, corpo, corretorId, anuncioId, anuncioTitulo, clique } = params

  let metaCampaignId: string | null = clique?.meta_campaign_id ?? null
  let metaAdsetId: string | null = clique?.meta_adset_id ?? null
  const metaAdId: string | null = anuncioId ?? clique?.meta_ad_id ?? null
  let nomeAnuncio: string | null = null
  let nomeCampanha: string | null = null
  let nomeConjunto: string | null = null

  if (anuncioId) {
    const { data: metaAd } = await wsupabase
      .from("meta_ads")
      .select("campanha_id, adset_id, nome")
      .eq("id", anuncioId)
      .maybeSingle()
    if (metaAd) {
      metaCampaignId = metaAd.campanha_id ?? null
      metaAdsetId = metaAd.adset_id ?? null
      nomeAnuncio = metaAd.nome ?? null
    }
  }

  if (metaCampaignId) {
    const { data: campanha } = await wsupabase
      .from("meta_campanhas")
      .select("nome")
      .eq("id", metaCampaignId)
      .maybeSingle()
    nomeCampanha = campanha?.nome ?? null
  }

  if (metaAdsetId) {
    const { data: conjunto } = await wsupabase
      .from("meta_adsets")
      .select("nome")
      .eq("id", metaAdsetId)
      .maybeSingle()
    nomeConjunto = conjunto?.nome ?? null
  }

  const digitsTel = onlyDigits(telefone)
  const semDdiTel = digitsTel.startsWith("55") ? digitsTel.slice(2) : digitsTel
  const ultimos8Tel = digitsTel.slice(-8)
  const variantesTel = Array.from(new Set([digitsTel, `55${semDdiTel}`, semDdiTel, ultimos8Tel]))
  const { data: candidatos } = await wsupabase
    .from("leads")
    .select("id, telefone, corretor_id, status, observacoes, referencias, referencia_imovel")
    .or(variantesTel.map((v) => `telefone.ilike.%${v}%`).join(","))
    .limit(30)

  const compTel = normalizePhone(telefone)
  const matchesTel = (candidatos ?? []).filter((l) => normalizePhone(l.telefone) === compTel)
  const existenteDoCorretor = matchesTel.find((l) => l.corretor_id === corretorId)
  const existente = existenteDoCorretor ?? matchesTel[0] ?? null
  const mesmoCorretor = Boolean(existenteDoCorretor)
  let leadId: string | null = existenteDoCorretor ? existenteDoCorretor.id : null

  let corretorNome = "corretor"
  if (corretorId) {
    const { data: corretor } = await wsupabase.from("usuarios").select("nome").eq("id", corretorId).maybeSingle()
    if (corretor?.nome) corretorNome = corretor.nome
  }

  const referenciaExtraida = extrairReferenciaDoTexto(corpo)
  const tagsLead: { ref: string; principal?: boolean }[] = []
  if (referenciaExtraida) {
    tagsLead.push({ ref: referenciaExtraida, principal: true })
    tagsLead.push({ ref: "Tráfego Pago", principal: false })
  } else {
    tagsLead.push({ ref: "Tráfego Pago", principal: true })
  }

  // Lead já existente DO MESMO CORRETOR
  if (mesmoCorretor && existenteDoCorretor) {
    const refsAtuais = Array.isArray(existenteDoCorretor.referencias) ? existenteDoCorretor.referencias : []
    const refsAtualizadas = comRef(
      referenciaExtraida ? comRef(refsAtuais, { ref: referenciaExtraida, principal: true }) : refsAtuais,
      { ref: "Tráfego Pago" }
    )

    const agoraBr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const reengajamentoMsg = `\n\n[${agoraBr}] Lead reengajado através do anúncio vinculado ao Tráfego Pago no WhatsApp de ${corretorNome}.${referenciaExtraida ? ` Imóvel ref. ${referenciaExtraida}.` : ""}${nomeCampanha ? ` Campanha: ${nomeCampanha}.` : ""}${clique?.utm_campaign ? ` UTM: ${clique.utm_campaign}.` : ""}`
    const obsAtualizada = `${existenteDoCorretor.observacoes || ""}${reengajamentoMsg}`.trim()

    const statusReativar = ["perdido", "frio", "em_followup", "em_automacao", "arquivado"].includes(existenteDoCorretor.status)
      ? "novo"
      : existenteDoCorretor.status

    await wsupabase
      .from("leads")
      .update({
        status: statusReativar,
        temperatura: "morno",
        origem: "Tráfego Pago",
        referencia_imovel: referenciaExtraida || existenteDoCorretor.referencia_imovel || "",
        referencias: refsAtualizadas,
        observacoes: obsAtualizada,
        meta_campaign_id: metaCampaignId || undefined,
        meta_adset_id: metaAdsetId || undefined,
        meta_ad_id: metaAdId || undefined,
        utm_campaign: clique?.utm_campaign ?? undefined,
        utm_adset: clique?.utm_adset ?? undefined,
        utm_ad: clique?.utm_ad ?? undefined,
        fbc: clique?.fbc ?? undefined,
        fbp: clique?.fbp ?? undefined,
        client_ip: clique?.ip ?? undefined,
        client_ua: clique?.user_agent ?? undefined,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", existenteDoCorretor.id)

    await wsupabase.from("notificacoes").insert({
      mensagem: `Lead reengajado via Tráfego Pago (WhatsApp): ${nome} escreveu para ${corretorNome}${referenciaExtraida ? ` (Ref. ${referenciaExtraida})` : ""}`,
      tipo: "lead_reengajado",
      modulo: "vendas",
      usuario_id: corretorId,
      para_role: "gestor",
      lead_id: existenteDoCorretor.id,
    })

    try {
      await Promise.race([
        enviarLeadCapi({
          lead_id: existenteDoCorretor.id,
          telefone,
          nome,
          email: "",
          valor: 0,
          corretor_id: corretorId,
          campanha_id: metaCampaignId,
          adset_id: metaAdsetId,
          ad_id: metaAdId,
          utm_campaign: clique?.utm_campaign ?? null,
          utm_adset: clique?.utm_adset ?? null,
          utm_ad: clique?.utm_ad ?? null,
          fbc: clique?.fbc ?? null,
          fbp: clique?.fbp ?? null,
          ip: clique?.ip ?? null,
          ua: clique?.user_agent ?? null,
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
    } catch {}
  }

  // Novo lead ou lead de outro corretor
  if (!mesmoCorretor) {
    const partesObs: string[] = [
      `Lead criado automaticamente através do anúncio vinculado ao Tráfego Pago no WhatsApp de ${corretorNome}.`,
    ]
    if (referenciaExtraida) partesObs.push(`Imóvel de interesse: ref. ${referenciaExtraida}`)
    if (nomeAnuncio || anuncioTitulo) partesObs.push(`Anúncio: ${nomeAnuncio || anuncioTitulo}`)
    if (nomeCampanha) partesObs.push(`Campanha: ${nomeCampanha}`)
    if (nomeConjunto) partesObs.push(`Conjunto: ${nomeConjunto}`)
    if (clique?.utm_campaign) partesObs.push(`UTM campanha: ${clique.utm_campaign}`)
    if (clique?.utm_adset) partesObs.push(`UTM conjunto: ${clique.utm_adset}`)
    const obs = partesObs.join("\n")

    const baseLead = {
      nome,
      telefone,
      email: "",
      referencia_imovel: referenciaExtraida || "",
      referencias: tagsLead,
      temperatura: "morno",
      origem: "Tráfego Pago",
      observacoes: obs,
      status: "novo",
      corretor_id: corretorId,
      meta_campaign_id: metaCampaignId,
      meta_adset_id: metaAdsetId,
      meta_ad_id: metaAdId,
    }
    const rastreioLead = {
      utm_campaign: clique?.utm_campaign ?? null,
      utm_adset: clique?.utm_adset ?? null,
      utm_ad: clique?.utm_ad ?? null,
      fbc: clique?.fbc ?? null,
      fbp: clique?.fbp ?? null,
      client_ip: clique?.ip ?? null,
      client_ua: clique?.user_agent ?? null,
    }

    let novo: { id: string } | null = null
    const { data: leadInserido, error: errInsert } = await wsupabase
      .from("leads")
      .insert({ ...baseLead, ...rastreioLead })
      .select("id")
      .maybeSingle()
    novo = leadInserido

    if (errInsert) {
      logger.error("Erro ao inserir lead com rastreio no webhook WhatsApp", { error: errInsert.message })
      const resFallback = await wsupabase.from("leads").insert(baseLead).select("id").maybeSingle()
      novo = resFallback.data
      if (resFallback.error) {
        logger.error("Erro ao inserir lead fallback no webhook WhatsApp", { error: resFallback.error.message })
        const resMin = await wsupabase
          .from("leads")
          .insert({
            nome,
            telefone,
            email: "",
            referencia_imovel: referenciaExtraida || "",
            referencias: tagsLead,
            temperatura: "morno",
            origem: "Tráfego Pago",
            observacoes: obs,
            status: "novo",
            corretor_id: corretorId,
          })
          .select("id")
          .maybeSingle()
        novo = resMin.data
      }
    }

    leadId = novo?.id ?? null

    if (leadId) {
      await wsupabase.from("notificacoes").insert({
        mensagem: `Novo lead via Tráfego Pago (WhatsApp): ${nome} (via ${corretorNome})${referenciaExtraida ? ` - Ref. ${referenciaExtraida}` : ""}`,
        tipo: "lead_novo",
        modulo: "vendas",
        usuario_id: corretorId,
        para_role: "gestor",
        lead_id: leadId,
      })

      try {
        await Promise.race([
          enviarLeadCapi({
            lead_id: leadId,
            telefone,
            nome,
            email: "",
            valor: 0,
            corretor_id: corretorId,
            campanha_id: metaCampaignId,
            adset_id: metaAdsetId,
            ad_id: metaAdId,
            utm_campaign: clique?.utm_campaign ?? null,
            utm_adset: clique?.utm_adset ?? null,
            utm_ad: clique?.utm_ad ?? null,
            fbc: clique?.fbc ?? null,
            fbp: clique?.fbp ?? null,
            ip: clique?.ip ?? null,
            ua: clique?.user_agent ?? null,
          }),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ])
      } catch {}

      if (existente && existente.corretor_id && existente.corretor_id !== corretorId) {
        const { data: dono } = await wsupabase.from("usuarios").select("nome").eq("id", existente.corretor_id).maybeSingle()
        await wsupabase.from("notificacoes").insert({
          mensagem: `Lead compartilhado: ${telefone} clicou em anúncio de Tráfego Pago no WhatsApp de ${corretorNome}, mas já possui lead com ${dono?.nome ?? "outro corretor"} (status: ${existente.status}). O novo lead foi criado para ${corretorNome}.`,
          tipo: "possivel_duplicado",
          modulo: "vendas",
          usuario_id: corretorId,
          para_role: "gestor",
          lead_id: leadId,
        })
      }
    }
  }

  return { leadId }
}
