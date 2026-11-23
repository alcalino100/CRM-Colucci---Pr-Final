import "server-only"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { normalizarCapacidades } from "./capacidades"
import { calcularIndicadores, montarResumo } from "./indicadores"
import {
  CONFIG_PADRAO,
  dentroDoTtl,
  TTL_CONVERSA_HORAS,
  type ConfigAssistente,
  type Conversa,
  type MensagemRegistro,
  type RepositorioAssistente,
  type SalvarTurno,
} from "./repositorio"
import { sanitizarEstado } from "./persistencia"
import { estadoInicial } from "./orquestrador"

/** As tabelas do assistente ainda não estão nos tipos gerados do Supabase: acesso solto, validado na leitura. */
const db = () => getSupabaseAdmin() as any

/** Erro de "tabela inexistente" (migration ainda não aplicada) — a API usa isso para cair em demonstração. */
export function tabelaAusente(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(e.message ?? ""))
}

function linhaParaConversa(r: any): Conversa {
  return {
    id: r.id,
    telefone: r.telefone,
    instanceName: r.instance_name ?? "",
    estado: r.estado ?? estadoInicial(),
    status: r.status,
    intencaoAtual: r.intencao_atual ?? undefined,
    criadoEm: r.criado_em,
    ultimaMsgEm: r.ultima_msg_em,
  }
}

export const repositorioSupabase: RepositorioAssistente = {
  async obterConfig() {
    const { data, error } = await db().from("assistente_config").select("*").eq("id", "main").maybeSingle()
    if (error) throw error
    if (!data) return { ...CONFIG_PADRAO }
    return {
      ativo: !!data.ativo,
      instancias: data.instancias ?? [],
      numerosTeste: data.numeros_teste ?? [],
      capacidades: normalizarCapacidades(data.capacidades),
      usarIa: !!data.usar_ia,
      aiAgentId: data.ai_agent_id ?? undefined,
    }
  },

  async salvarConfig(p: Partial<ConfigAssistente>) {
    const linha: Record<string, unknown> = { id: "main", atualizado_em: new Date().toISOString() }
    if (p.ativo !== undefined) linha.ativo = p.ativo
    if (p.instancias) linha.instancias = p.instancias
    if (p.numerosTeste) linha.numeros_teste = p.numerosTeste
    if (p.capacidades) linha.capacidades = p.capacidades
    if (p.usarIa !== undefined) linha.usar_ia = p.usarIa
    if (p.aiAgentId !== undefined) linha.ai_agent_id = p.aiAgentId || null
    const { error } = await db().from("assistente_config").upsert(linha, { onConflict: "id" })
    if (error) throw error
    return this.obterConfig()
  },

  async buscarConversaRecente(telefone, instanceName, agora) {
    const { data, error } = await db()
      .from("assistente_conversas").select("*")
      .eq("telefone", telefone).eq("instance_name", instanceName)
      .order("ultima_msg_em", { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!data) return null
    const c = linhaParaConversa(data)
    return dentroDoTtl(c.ultimaMsgEm, agora) ? c : null
  },

  async criarConversa(telefone, instanceName, agora) {
    const iso = agora.toISOString()
    const { data, error } = await db()
      .from("assistente_conversas")
      .insert({ telefone, instance_name: instanceName, estado: estadoInicial(), status: "ativa", criado_em: iso, atualizado_em: iso, ultima_msg_em: iso })
      .select("*").single()
    if (error) throw error
    return linhaParaConversa(data)
  },

  async salvarTurno(conversaId, t: SalvarTurno, agora) {
    const iso = agora.toISOString()
    const estado = sanitizarEstado(t.estado)
    const { error } = await db().from("assistente_conversas").update({
      estado, status: t.status, atualizado_em: iso, ...(t.renovar === false ? {} : { ultima_msg_em: iso }),
      cliente_nome: estado.cliente?.nome ?? null, cliente_perfil: estado.cliente?.perfil ?? null,
      protocolo: estado.protocolo ?? null, departamento: estado.departamento ?? null,
      ...(t.intencao ? { intencao_atual: t.intencao } : {}),
    }).eq("id", conversaId)
    if (error) throw error
    if (t.mensagens.length) {
      const { error: e2 } = await db().from("assistente_mensagens").insert(t.mensagens.map((m, i) => ({ conversa_id: conversaId, papel: m.papel, conteudo: m.conteudo, criado_em: (m.em ?? new Date(agora.getTime() + i)).toISOString() })))
      if (e2) throw e2
    }
    if (t.eventos.length) {
      const { error: e3 } = await db().from("assistente_eventos").insert(t.eventos.map((e) => ({ conversa_id: conversaId, tipo: e.tipo, dados: e, criado_em: iso })))
      if (e3) throw e3
    }
  },

  async contarRespostasAssistente(conversaId, desde) {
    const { count } = await db().from("assistente_mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", conversaId).eq("papel", "assistente").gte("criado_em", desde.toISOString())
    return count ?? 0
  },

  async historico(conversaId, limite) {
    const { data } = await db().from("assistente_mensagens").select("papel,conteudo,criado_em").eq("conversa_id", conversaId).order("criado_em", { ascending: false }).limit(limite)
    return [...(data ?? [])].reverse().map((m: { papel: "cliente" | "assistente" | "sistema"; conteudo: string }) => ({ papel: m.papel, conteudo: m.conteudo }))
  },

  async ultimasMensagensAssistente(conversaId, limite) {
    const { data } = await db().from("assistente_mensagens").select("conteudo").eq("conversa_id", conversaId).eq("papel", "assistente").order("criado_em", { ascending: false }).limit(limite)
    return (data ?? []).map((m: { conteudo: string }) => m.conteudo)
  },

  async marcarHumano(telefone, instanceName, agora) {
    const desde = new Date(agora.getTime() - TTL_CONVERSA_HORAS * 3_600_000).toISOString()
    await db().from("assistente_conversas").update({ status: "humano", atualizado_em: agora.toISOString() })
      .eq("telefone", telefone).eq("instance_name", instanceName).gte("ultima_msg_em", desde).in("status", ["ativa", "resolvida_ia", "transferida"])
  },

  async listarAtendimentos({ limite, status }) {
    let q = db().from("assistente_conversas").select("*").order("ultima_msg_em", { ascending: false }).limit(limite)
    if (status) q = q.eq("status", status)
    const { data, error } = await q
    if (error) throw error
    const conversas = (data ?? []).map(linhaParaConversa)
    const ids = conversas.map((c: Conversa) => c.id)
    const contagem = new Map<string, number>()
    if (ids.length) {
      const { data: ms } = await db().from("assistente_mensagens").select("conversa_id").in("conversa_id", ids).limit(5000)
      for (const m of ms ?? []) contagem.set(m.conversa_id, (contagem.get(m.conversa_id) ?? 0) + 1)
    }
    return conversas.map((c: Conversa) => ({ ...montarResumo(c, []), mensagens: contagem.get(c.id) ?? 0 }))
  },

  async calcularIndicadores(desde) {
    const { data, error } = await db().from("assistente_conversas").select("*").gte("criado_em", desde.toISOString()).limit(5000)
    if (error) throw error
    const conversas = (data ?? []).map(linhaParaConversa)
    const ids = new Set(conversas.map((c: Conversa) => c.id))
    const porConversa = new Map<string, MensagemRegistro[]>()
    if (ids.size) {
      // Filtra por data (não por milhares de ids, que estouraria a URL) e cruza em memória.
      const { data: ms } = await db().from("assistente_mensagens").select("conversa_id,papel,criado_em").gte("criado_em", desde.toISOString()).order("criado_em", { ascending: true }).limit(20000)
      for (const m of ms ?? []) if (ids.has(m.conversa_id)) porConversa.set(m.conversa_id, [...(porConversa.get(m.conversa_id) ?? []), { papel: m.papel, conteudo: "", criadoEm: m.criado_em }])
    }
    // Saúde da IA no período (eventos do tipo "ia" das conversas da janela).
    const { data: evs } = await db().from("assistente_eventos").select("conversa_id,dados,criado_em").eq("tipo", "ia").gte("criado_em", desde.toISOString()).order("criado_em", { ascending: true }).limit(20000)
    const eventosIa = (evs ?? []).filter((e: { conversa_id: string }) => ids.has(e.conversa_id)).map((e: { dados: { funcao: string; ok: boolean; erro?: string } }) => e.dados)
    return calcularIndicadores(conversas, porConversa, eventosIa)
  },
}
