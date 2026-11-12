// app/api/relatorios/teste/route.ts
// Disparo de teste imediato do relatório do dia via WhatsApp

import { z } from "zod"
import { ok, fail } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import { limitesDiaAnteriorBRT, limitesDiaBRT } from "@/lib/relatorios/periodo"
import { consolidarRelatorioDia, type SecoesAtivasConfig } from "@/lib/relatorios/montar"
import { enviarRelatorioParaDestinatario } from "@/lib/relatorios/enviar"
import { onlyDigits } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const testeSchema = z.object({
  destino: z.string().trim().optional(),
  tipo: z.enum(["numero", "grupo"]).optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato deve ser YYYY-MM-DD").optional(),
  instance_name: z.string().trim().optional(),
})

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  const parsed = await parseBody(request, testeSchema)
  if (!parsed.success) return parsed.response

  const { destino, tipo, data: dataParam, instance_name: instParam } = parsed.data

  try {
    const admin = getSupabaseAdmin()
    const periodo = dataParam ? limitesDiaBRT(dataParam) : limitesDiaAnteriorBRT()

    // Carregar config geral
    const { data: config } = await admin
      .from("relatorio_config")
      .select("*")
      .eq("id", "main")
      .maybeSingle()

    // Resolver instância
    let instanceName = instParam || config?.instance_name
    if (!instanceName) {
      const { data: insts } = await admin
        .from("whatsapp_instancias")
        .select("instance_name, status")
        .or("status.eq.open,status.eq.connected")
        .limit(1)

      if (insts && insts.length > 0) {
        instanceName = insts[0].instance_name
      }
    }

    if (!instanceName) {
      return fail("Nenhuma instância conectada para envio de teste", 400)
    }

    // Consolidar dados do período
    const dadosConsolidados = await consolidarRelatorioDia(admin, periodo, {
      secoes: (config?.secoes as Partial<SecoesAtivasConfig>) ?? undefined,
      incluirGestoresNoTempo: Boolean(config?.incluir_gestores_no_tempo),
      listarNomesLeads: Boolean(config?.listar_nomes_leads),
    })

    if (destino) {
      // Envio avulso de teste para um número ou grupo específico
      const tipoDestino = tipo || (destino.includes("@g.us") ? "grupo" : "numero")
      const destinoSanitizado = tipoDestino === "numero" ? onlyDigits(destino) : destino.trim()

      const resultado = await enviarRelatorioParaDestinatario(admin, {
        destinatario: {
          id: "00000000-0000-0000-0000-000000000000",
          nome: `Teste manual (${tipoDestino})`,
          tipo: tipoDestino,
          destino: destinoSanitizado,
          ativo: true,
        },
        instanceName,
        origem: "teste",
        dadosConsolidados,
      })

      if (!resultado.ok) {
        return fail(`Falha ao enviar mensagem de teste: ${resultado.erro}`, 400, resultado)
      }

      logger.info("Teste manual de relatório enviado", { destino: destinoSanitizado, instanceName })
      return ok({
        resultado,
        periodo: dadosConsolidados.periodo,
      })
    }

    // Se nenhum destino específico foi passado, envia para todos os destinatários ativos
    const { data: destinatarios } = await admin
      .from("relatorio_destinatarios")
      .select("*")
      .eq("ativo", true)

    if (!destinatarios || destinatarios.length === 0) {
      return fail("Nenhum destinatário ativo configurado. Adicione um destinatário ou informe um destino.", 400)
    }

    const resultados = await Promise.all(
      destinatarios.map((d) =>
        enviarRelatorioParaDestinatario(admin, {
          destinatario: d,
          instanceName: instanceName!,
          origem: "teste",
          dadosConsolidados,
        })
      )
    )

    const falhas = resultados.filter((r) => !r.ok)
    return ok({
      total: resultados.length,
      enviados: resultados.filter((r) => r.ok).length,
      falhas: falhas.length,
      detalhes: resultados,
      periodo: dadosConsolidados.periodo,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("Erro no teste de relatório", { error: msg })
    return fail(`Erro ao processar envio de teste: ${msg}`, 500)
  }
}
