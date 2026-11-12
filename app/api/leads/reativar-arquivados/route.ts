import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { logger } from "@/lib/logger"
import { LEAD_COLUMNS } from "@/lib/supabase/projections"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export function getHojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function normalizarTelefone(tel?: string | null): string {
  if (!tel) return ""
  const d = tel.replace(/\D/g, "")
  if (d.startsWith("55") && d.length >= 12) return d.slice(2)
  return d
}

function extrairDataReaparecimentoFallback(obs?: string | null): string | null {
  if (!obs) return null
  const match = obs.match(/data_reaparecimento:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/)
  return match ? match[1] : null
}

export async function GET(request: Request) {
  return processarReativacao(request)
}

export async function POST(request: Request) {
  return processarReativacao(request)
}

async function processarReativacao(request: Request) {
  const url = new URL(request.url)
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    const qs = url.searchParams.get("secret")
    const ok = auth === `Bearer ${secret}` || qs === secret
    if (!ok) {
      return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 })
    }
  }

  const dry = url.searchParams.get("dry") === "1"
  const hojeBrasilia = getHojeBrasilia()

  // 1. Buscar todos os leads arquivados
  const { data: leadsArquivados, error: errLeads } = await wsupabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .not("arquivado_em", "is", null)

  if (errLeads) {
    return NextResponse.json({ ok: false, erro: errLeads.message }, { status: 500 })
  }

  const lista = leadsArquivados || []
  if (lista.length === 0) {
    return NextResponse.json({
      ok: true,
      hojeBrasilia,
      avaliados: 0,
      reativados: 0,
      conflitos: 0,
      pulados: 0,
      dry,
    })
  }

  // 2. Buscar usuários para validar corretores ativos e identificar gestor padrão
  const { data: usuarios } = await wsupabase
    .from("usuarios")
    .select("id, nome, role, status")

  const usuariosMap = new Map<string, { id: string; nome: string; role: string; status: string }>()
  let gestorPadraoId: string | null = null
  for (const u of usuarios || []) {
    usuariosMap.set(u.id, u)
    if ((u.role === "gestor" || u.role === "admin" || u.role === "master") && u.status !== "inativo" && !gestorPadraoId) {
      gestorPadraoId = u.id
    }
  }

  // 3. Buscar leads ativos para checagem anti-duplicidade
  const { data: leadsAtivos } = await wsupabase
    .from("leads")
    .select("id, nome, telefone, email, corretor_id")
    .is("arquivado_em", null)

  const telefonesAtivosMap = new Map<string, any>()
  const emailsAtivosMap = new Map<string, any>()

  for (const la of leadsAtivos || []) {
    const dig = normalizarTelefone(la.telefone)
    if (dig) telefonesAtivosMap.set(dig, la)
    if (la.email) {
      const em = la.email.trim().toLowerCase()
      if (em) emailsAtivosMap.set(em, la)
    }
  }

  let reativados = 0
  let conflitos = 0
  let pulados = 0
  const detalhes: Array<{ id: string; nome: string; motivo: string }> = []

  for (const lead of lista) {
    // a. Determinar data de reaparecimento (coluna direta ou observações fallback)
    const dataReap = lead.data_reaparecimento || extrairDataReaparecimentoFallback(lead.observacoes)

    // Se não tiver data ou a data ainda não chegou no horário de Brasília, pula
    if (!dataReap || dataReap > hojeBrasilia) {
      pulados++
      continue
    }

    // b. Se foi marcado como sem interesse permanente, NÃO reativar
    if (lead.sem_interesse_permanente === true) {
      pulados++
      detalhes.push({ id: lead.id, nome: lead.nome, motivo: "sem_interesse_permanente" })
      continue
    }

    // c. Se foi convertido/fechado, não reativar
    if (lead.status === "fechado") {
      pulados++
      detalhes.push({ id: lead.id, nome: lead.nome, motivo: "ja_fechado" })
      continue
    }

    // d. Idempotência: verificar se já foi reativado hoje
    if (lead.reativado_em) {
      const dataUltimaReativacao = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(lead.reativado_em))

      if (dataUltimaReativacao === hojeBrasilia && !lead.arquivado_em) {
        pulados++
        continue
      }
    }

    // e. Checagem Anti-Duplicidade
    const telLead = normalizarTelefone(lead.telefone)
    const emailLead = (lead.email || "").trim().toLowerCase()
    const duplicadoAtivo = (telLead && telefonesAtivosMap.get(telLead)) || (emailLead && emailsAtivosMap.get(emailLead))

    if (duplicadoAtivo && duplicadoAtivo.id !== lead.id) {
      // NÃO reativar duplicado! Notificar gestor para mesclagem manual
      conflitos++
      detalhes.push({
        id: lead.id,
        nome: lead.nome,
        motivo: `conflito_duplicidade_com_${duplicadoAtivo.id}`,
      })

      if (!dry) {
        try {
          await wsupabase.from("notificacoes").insert({
            mensagem: `⚠️ Conflito na reativação: Lead arquivado "${lead.nome}" reapareceu na data, mas já existe lead ativo "${duplicadoAtivo.nome}" com o mesmo contato (${lead.telefone || lead.email}). Recomendada mesclagem.`,
            tipo: "pipeline",
            modulo: "vendas",
            para_role: "gestor",
            lead_id: duplicadoAtivo.id,
          })

          await wsupabase.from("automation_logs").insert({
            event_type: "conflito_duplicidade_reativacao",
            event_title: "Conflito de duplicidade ao reativar lead",
            event_description: `Lead arquivado ${lead.nome} (${lead.id}) colidiu com lead ativo ${duplicadoAtivo.nome} (${duplicadoAtivo.id}). Reativação automática bloqueada para evitar duplicação.`,
            actor_type: "system",
            lead_id: lead.id,
          })
        } catch {
          // best-effort
        }
      }
      continue
    }

    // f. Verificar se o corretor responsável ainda está ativo
    let corretorDestinoId = lead.corretor_id
    let reatribuido = false
    if (corretorDestinoId) {
      const usuarioCorretor = usuariosMap.get(corretorDestinoId)
      if (!usuarioCorretor || usuarioCorretor.status === "inativo") {
        corretorDestinoId = gestorPadraoId || corretorDestinoId
        reatribuido = true
      }
    } else if (gestorPadraoId) {
      corretorDestinoId = gestorPadraoId
      reatribuido = true
    }

    const corretorNome = usuariosMap.get(corretorDestinoId || "")?.nome || "Corretor"
    const novoCount = (Number(lead.reativacoes_count) || 0) + 1
    const agoraIso = new Date().toISOString()

    if (!dry) {
      // g. Executar reativação no banco
      // Tentativa 1: update com todas as novas colunas
      const patchCompleto: Record<string, unknown> = {
        arquivado_em: null,
        status: "novo",
        reativado_em: agoraIso,
        reativacoes_count: novoCount,
        atualizado_em: agoraIso,
      }
      if (reatribuido && corretorDestinoId) {
        patchCompleto.corretor_id = corretorDestinoId
      }

      let updateRes = await wsupabase.from("leads").update(patchCompleto).eq("id", lead.id)

      // Fallback gracioso se as colunas novas ainda não estiverem no banco
      if (updateRes.error && updateRes.error.message.includes("does not exist")) {
        const patchMinimo: Record<string, unknown> = {
          arquivado_em: null,
          status: "novo",
          atualizado_em: agoraIso,
          observacoes: `${lead.observacoes || ""}\n[Reativado automaticamente em ${hojeBrasilia} | Ciclo ${novoCount}]`.trim(),
        }
        if (reatribuido && corretorDestinoId) {
          patchMinimo.corretor_id = corretorDestinoId
        }
        updateRes = await wsupabase.from("leads").update(patchMinimo).eq("id", lead.id)
      }

      if (updateRes.error) {
        detalhes.push({ id: lead.id, nome: lead.nome, motivo: `erro_update: ${updateRes.error.message}` })
        continue
      }

      // h. Registrar auditoria
      try {
        await wsupabase.from("auditoria").insert({
          lead_id: lead.id,
          lead_nome: lead.nome,
          usuario_nome: "Sistema (Reativação Automática)",
          tipo: "reativacao",
          descricao: `Lead reativado automaticamente pelo cronograma de hibernação na data prevista (${hojeBrasilia}).${reatribuido ? " Corretor original inativo; redistribuído." : ""}`,
          referencias: lead.referencias ? JSON.stringify(lead.referencias) : null,
          motivo: lead.motivo_arquivamento || "Hibernação programada concluída",
          criado_em: agoraIso,
        })
      } catch {
        // auditoria best-effort
      }

      // i. Notificações in-app (corretor + gestor)
      try {
        const consentWarning = lead.consentimento_contato === false
          ? " (⚠️ Atenção LGPD: Confirmar consentimento antes de contatar)"
          : ""

        if (corretorDestinoId) {
          await wsupabase.from("notificacoes").insert({
            mensagem: `🔔 Lead reativado: "${lead.nome}" retornou ao funil como Novo Lead. Tarefa: Retomar contato.${consentWarning}`,
            tipo: "pipeline",
            modulo: "vendas",
            para_usuario_id: corretorDestinoId,
            lead_id: lead.id,
          })
        }

        await wsupabase.from("notificacoes").insert({
          mensagem: `🔔 Lead reativado: "${lead.nome}" reapareceu na carteira de ${corretorNome}.`,
          tipo: "pipeline",
          modulo: "vendas",
          para_role: "gestor",
          lead_id: lead.id,
        })
      } catch {
        // notificacoes best-effort
      }

      // IMPORTANTE: Nenhum envio automático de WhatsApp/SMS/E-mail.
      // O contato deve ser iniciado manualmente pelo corretor responsável.
    }

    reativados++
    detalhes.push({
      id: lead.id,
      nome: lead.nome,
      motivo: `reativado_para_${corretorNome}`,
    })
  }

  // Registrar log de resumo da execução
  if (!dry && reativados > 0) {
    try {
      await wsupabase.from("automation_logs").insert({
        event_type: "reativacao_arquivados_resumo",
        event_title: "Cron de Reativação de Arquivados executado",
        event_description: `Data: ${hojeBrasilia} | Avaliados: ${lista.length} | Reativados: ${reativados} | Conflitos duplicidade: ${conflitos} | Pulados: ${pulados}`,
        actor_type: "system",
      })
    } catch (err) {
      logger.warn("Falha ao registrar log de resumo de reativação", { error: err })
    }
  }

  return NextResponse.json({
    ok: true,
    hojeBrasilia,
    avaliados: lista.length,
    reativados,
    conflitos,
    pulados,
    detalhes,
    dry,
  })
}
