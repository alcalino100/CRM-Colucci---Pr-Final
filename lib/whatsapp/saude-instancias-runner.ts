import { notifyGestorWhatsApp, wsupabase } from "@/lib/whatsapp/server"
import {
  COOLDOWN_HORAS,
  JANELA_MEDIA_DIAS,
  avaliarInstancias,
  textoAlerta,
  type InstanciaParaAvaliar,
  type ProblemaInstancia,
} from "@/lib/whatsapp/saude-instancias"

export const TIPO_NOTIFICACAO_SAUDE = "whatsapp_instancia_problema"

export interface ResultadoSaude {
  verificadas: number
  problemas: ProblemaInstancia[]
  alertados: string[]
  emCooldown: string[]
  simulacao: boolean
}

function instanciasIgnoradas(): Set<string> {
  return new Set(
    (process.env.WHATSAPP_SAUDE_IGNORAR || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

async function carregarInstancias(agora: Date): Promise<InstanciaParaAvaliar[]> {
  const { data: instancias } = await wsupabase
    .from("whatsapp_instancias")
    .select("instance_name, corretor_id, status, atualizado_em")
    .in("status", ["conectado", "conectando"])
  const ignoradas = instanciasIgnoradas()
  const alvo = (instancias ?? []).filter((i) => !ignoradas.has(String(i.instance_name).toLowerCase()))
  const desde = new Date(agora.getTime() - JANELA_MEDIA_DIAS * 86400_000).toISOString()

  return Promise.all(
    alvo.map(async (i) => {
      const filtroRecebida = "de_mim.is.false,de_mim.is.null"
      const [{ data: ultima }, { count }] = await Promise.all([
        wsupabase
          .from("whatsapp_mensagens")
          .select("criado_em")
          .eq("instance_name", i.instance_name)
          .or(filtroRecebida)
          .order("criado_em", { ascending: false })
          .limit(1),
        wsupabase
          .from("whatsapp_mensagens")
          .select("id", { count: "exact", head: true })
          .eq("instance_name", i.instance_name)
          .or(filtroRecebida)
          .gte("criado_em", desde),
      ])
      const ultimaRecebida = ultima?.[0]?.criado_em ?? null
      return {
        instanceName: i.instance_name as string,
        corretorId: (i.corretor_id as string | null) ?? null,
        status: String(i.status),
        atualizadoEm: (i.atualizado_em as string | null) ?? null,
        // Se a última mensagem é mais antiga que a janela, não há movimento recente.
        ultimaRecebida: ultimaRecebida && ultimaRecebida >= desde ? ultimaRecebida : null,
        recebidasNaJanela: count ?? 0,
      }
    }),
  )
}

async function jaAlertadoRecentemente(instanceName: string, agora: Date): Promise<boolean> {
  const corte = new Date(agora.getTime() - COOLDOWN_HORAS * 3600_000).toISOString()
  const { data } = await wsupabase
    .from("notificacoes")
    .select("id")
    .eq("tipo", TIPO_NOTIFICACAO_SAUDE)
    .ilike("mensagem", `%(${instanceName})%`)
    .gte("timestamp", corte)
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function verificarSaudeInstancias(opts: { agora?: Date; simulacao?: boolean } = {}): Promise<ResultadoSaude> {
  const agora = opts.agora ?? new Date()
  const simulacao = opts.simulacao ?? false

  const instancias = await carregarInstancias(agora)
  const problemas = avaliarInstancias(instancias, agora)

  const alertados: string[] = []
  const emCooldown: string[] = []
  const novos: { problema: ProblemaInstancia; nome: string }[] = []

  for (const p of problemas) {
    if (await jaAlertadoRecentemente(p.instanceName, agora)) {
      emCooldown.push(p.instanceName)
      continue
    }
    let nome = p.instanceName
    if (p.corretorId) {
      const { data: u } = await wsupabase.from("usuarios").select("nome").eq("id", p.corretorId).maybeSingle()
      if (u?.nome) nome = u.nome
    }
    novos.push({ problema: p, nome })
  }

  if (!simulacao && novos.length > 0) {
    const notifs: Record<string, unknown>[] = []
    for (const { problema, nome } of novos) {
      const mensagem = textoAlerta(nome, problema)
      if (problema.corretorId) {
        notifs.push({ mensagem, tipo: TIPO_NOTIFICACAO_SAUDE, modulo: "vendas", para_usuario_id: problema.corretorId })
      }
      notifs.push({ mensagem, tipo: TIPO_NOTIFICACAO_SAUDE, modulo: "vendas", para_role: "gestor" })
      alertados.push(problema.instanceName)
    }
    await wsupabase.from("notificacoes").insert(notifs)

    const linhas = novos.map(({ problema, nome }) => `• ${nome} (${problema.instanceName}): ${problema.detalhe}`)
    const horario = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    await notifyGestorWhatsApp(
      ["⚠️ ALERTA: WHATSAPP SEM RECEBER MENSAGENS ⚠️", "", ...linhas, "", `🕒 ${horario}`, "Leads de anúncio dessas linhas podem estar se perdendo. Reconecte o quanto antes."].join("\n"),
      "todos",
    ).catch(() => undefined)
  }

  return { verificadas: instancias.length, problemas, alertados, emCooldown, simulacao }
}
