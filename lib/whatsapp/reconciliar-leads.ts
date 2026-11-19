// Rede de segurança: mensagem de anúncio registrada SEM lead.
//
// O webhook grava a mensagem depois de tentar criar o lead. Se a criação falhar (erro de banco, timeout),
// a mensagem fica com veio_de_anuncio = true e lead_id nulo, e o contato nunca aparece para o corretor.
// Este passo roda a cada 30 min (junto da checagem de saúde) e cria o lead que faltou.

import { logger } from "@/lib/logger"
import { onlyDigits, wsupabase } from "@/lib/whatsapp/server"
import { encontrarLeadPorTelefone, reengajarOuCriarLeadTráfego } from "@/lib/whatsapp-webhook/lead-attribution"

export const RECONCILIAR_JANELA_HORAS = 48
export const RECONCILIAR_MAX_POR_EXECUCAO = 25

export interface ResultadoReconciliacao {
  candidatas: number
  leadsCriados: number
  vinculadas: number
  erros: number
}

interface MensagemOrfa {
  id: string
  instance_name: string
  telefone: string
  nome_contato: string | null
  corpo: string | null
  anuncio_id: string | null
  anuncio_titulo: string | null
}

/** Uma entrada por (instância + telefone): a mais antiga, que é quando o lead deveria ter nascido. */
export function agruparOrfas(msgs: MensagemOrfa[]): MensagemOrfa[] {
  const mapa = new Map<string, MensagemOrfa>()
  for (const m of msgs) {
    const k = `${m.instance_name}|${onlyDigits(m.telefone).slice(-8)}`
    if (!mapa.has(k)) mapa.set(k, m)
  }
  return Array.from(mapa.values())
}

export async function reconciliarLeadsDeAnuncio(agora = new Date()): Promise<ResultadoReconciliacao> {
  const resultado: ResultadoReconciliacao = { candidatas: 0, leadsCriados: 0, vinculadas: 0, erros: 0 }
  const desde = new Date(agora.getTime() - RECONCILIAR_JANELA_HORAS * 3600_000).toISOString()

  const { data } = await wsupabase
    .from("whatsapp_mensagens")
    .select("id, instance_name, telefone, nome_contato, corpo, anuncio_id, anuncio_titulo")
    .eq("veio_de_anuncio", true)
    .is("lead_id", null)
    .or("de_mim.is.false,de_mim.is.null")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: true })
    .limit(200)

  const orfas = agruparOrfas((data ?? []) as MensagemOrfa[]).slice(0, RECONCILIAR_MAX_POR_EXECUCAO)
  resultado.candidatas = orfas.length

  for (const m of orfas) {
    try {
      const { data: insts } = await wsupabase
        .from("whatsapp_instancias")
        .select("corretor_id")
        .eq("instance_name", m.instance_name)
        .limit(1)
      const corretorId = insts?.[0]?.corretor_id as string | undefined
      if (!corretorId) continue

      let leadId = await encontrarLeadPorTelefone(m.telefone, corretorId)
      if (leadId) {
        resultado.vinculadas++
      } else {
        const r = await reengajarOuCriarLeadTráfego({
          telefone: m.telefone,
          nome: m.nome_contato || m.telefone,
          corpo: m.corpo ?? "",
          corretorId,
          anuncioId: m.anuncio_id,
          anuncioTitulo: m.anuncio_titulo,
          clique: null,
        })
        leadId = r.leadId
        if (leadId) resultado.leadsCriados++
      }
      if (leadId) {
        await wsupabase
          .from("whatsapp_mensagens")
          .update({ lead_id: leadId })
          .eq("instance_name", m.instance_name)
          .eq("telefone", m.telefone)
          .is("lead_id", null)
          .eq("veio_de_anuncio", true)
      }
    } catch (error) {
      resultado.erros++
      logger.error("Reconciliação: falha ao criar/vincular lead de anúncio", {
        instanceName: m.instance_name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return resultado
}
