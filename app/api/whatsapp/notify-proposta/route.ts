// Avisa no WhatsApp (gestor + Pati + Kleber) quando um lead entra em negociação com valor.
// Exclusivo da pipeline de VENDA — locação não chama esta rota (ver kanban-board-locacao.tsx).
// POST best-effort: nunca derruba o fluxo do CRM.
import { NextResponse } from "next/server"
import { notifyGestorWhatsApp, resolveNotifyTarget, sendWhatsAppText, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const brl = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

// Kleber - Colucci: recebe também os avisos de negociação (configurável via WHATSAPP_NOTIFY_NEGOCIO_EXTRA).
const NEGOCIO_EXTRA = (process.env.WHATSAPP_NOTIFY_NEGOCIO_EXTRA || "5518991975661").replace(/\D/g, "")

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false })
  }
  const { nome, valor, corretorNome, corretorId, refProposta, modulo } = body ?? {}
  if (!nome) return NextResponse.json({ ok: false, erro: "nome é obrigatório" })

  // Blindagem "somente venda": a partir deste deploy, SÓ envia com modulo:"venda"
  // explícito. Chamadas antigas (bundle em cache da locação — ou de venda desatualizado)
  // são RECUSADAS e registradas na auditoria, em vez de disparar WhatsApp indevido.
  if (modulo !== "venda") {
    try {
      await wsupabase.from("automation_logs").insert({
        event_type: "notificacao_negociacao_bloqueada",
        event_title: `Aviso de negociação BLOQUEADO (${nome})`,
        event_description: `Tentativa de aviso sem modulo="venda" (modulo=${JSON.stringify(modulo ?? null)}) — provavelmente aba desatualizada. Recarregue o CRM (Ctrl/Cmd+Shift+R). Proposta: ${nome} · ${brl(valor)} · Ref ${String(refProposta ?? "—").trim() || "—"}.`,
        actor_type: "system",
      })
    } catch { /* log é best-effort */ }
    return NextResponse.json({ ok: false, erro: "Aviso de negociação é exclusivo de vendas (atualize a página)." }, { status: 400 })
  }

  // Nome do corretor com fallback no banco (a tela pode não ter a lista carregada).
  let corretor = (corretorNome ?? "").trim()
  if ((!corretor || corretor === "—") && corretorId) {
    try {
      const { data: u } = await wsupabase.from("usuarios").select("nome").eq("id", String(corretorId)).maybeSingle()
      if (u?.nome) corretor = u.nome
    } catch { /* mantém fallback abaixo */ }
  }
  if (!corretor) corretor = "—"

  const linhas = [
    "🤝 LEAD EM NEGOCIAÇÃO 🤝",
    "",
    `👤 Cliente: ${nome}`,
    `💰 Valor: ${brl(valor)}`,
    `🧑‍💼 Corretor: ${corretor}`,
  ]
  if (refProposta?.trim()) linhas.push(`🏷️ Ref: ${refProposta.trim()}`)
  const texto = linhas.join("\n")

  const [res, alvo] = await Promise.all([notifyGestorWhatsApp(texto, "todos"), resolveNotifyTarget()])

  let extraOk = true
  let extraErro: string | undefined
  if (alvo && NEGOCIO_EXTRA) {
    const r = await sendWhatsAppText(alvo.instanceName, NEGOCIO_EXTRA, texto)
    extraOk = r.ok
    extraErro = r.erro
  }

  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "notificacao_negociacao",
      event_title: `Aviso de negociação (venda): ${nome}`,
      event_description: `Proposta de VENDA — ${nome} · ${brl(valor)} · ${corretor}${refProposta?.trim() ? ` · Ref ${refProposta.trim()}` : ""} · gestor:${res.ok ? "ok" : "falha"} extra:${extraOk ? "ok" : "falha"}`,
      actor_type: "system",
    })
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: res.ok && extraOk, erro: res.erro ?? extraErro ?? null })
}
