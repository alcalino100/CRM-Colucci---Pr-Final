// Diagnóstico: envia UM teste para o número de teste configurado e retorna a
// resposta crua da Evolution. Opcional: ?nome&valor&corretorNome&refProposta
// montam uma mensagem no formato de negociação. Protegido por CRON_SECRET.
import { evolutionConfig, resolveNotifyTarget } from "@/lib/whatsapp/server"
import { ok, fail } from "@/lib/api/response"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const brl = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return fail("não autorizado", 401)

  const targetNumber = (process.env.WHATSAPP_TEST_NUMBER || process.env.WHATSAPP_NOTIFY_NUMBER || "").trim()
  if (!targetNumber) {
    return fail("Variável WHATSAPP_TEST_NUMBER ou WHATSAPP_NOTIFY_NUMBER não configurada.", 400)
  }

  const alvo = await resolveNotifyTarget()
  if (!alvo) return fail("Instância do gestor não encontrada.", 404)

  const cfg = evolutionConfig()
  if (!cfg.ok) return fail("Evolution não configurada.", 500)

  const nome = url.searchParams.get("nome") || "Lead Teste Negociação"
  const valor = url.searchParams.get("valor") || ""
  const corretorNome = url.searchParams.get("corretorNome") || "Teste"
  const refProposta = url.searchParams.get("refProposta") || ""

  const linhas = [
    "🤝 LEAD EM NEGOCIAÇÃO 🤝",
    "",
    `👤 Cliente: ${nome}`,
    `💰 Valor: ${brl(valor)}`,
    `🧑‍💼 Corretor: ${corretorNome ?? "—"}`,
  ]
  if (refProposta?.trim()) linhas.push(`🏷️ Ref: ${refProposta.trim()}`)

  try {
    const res = await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(alvo.instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({ number: targetNumber, text: linhas.join("\n") }),
    })

    const raw = await res.text().catch(() => "")
    logger.info("Envio de teste de WhatsApp executado", { targetNumber, status: res.status })

    return ok({
      httpStatus: res.status,
      instancia: alvo.instanceName,
      numero: alvo.numero,
      respostaEvolution: raw,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error("Erro no envio de teste de WhatsApp", { error: errorMsg })
    return fail(errorMsg, 500)
  }
}
