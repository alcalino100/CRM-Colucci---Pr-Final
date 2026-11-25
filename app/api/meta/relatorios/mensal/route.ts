import { NextResponse } from "next/server"
import { exigirServicoOuGestor, negarAcesso } from "@/lib/auth/sessao"
import { mesAnterior } from "@/lib/meta/analise-campanhas"
import { gerarRelatorioMensal } from "@/lib/meta/relatorios"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// Cron (dia 1º): fecha o mês anterior para Instagram e campanhas. Cada relatório é independente: um erro não impede o outro.
export async function GET(request: Request) {
  const auth = exigirServicoOuGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const hoje = new Date()
  const mes = new URL(request.url).searchParams.get("mes") ?? mesAnterior(`${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`)
  const resultado: Record<string, string> = {}
  for (const tipo of ["campanhas", "instagram"] as const) {
    try {
      const r = await gerarRelatorioMensal(tipo, mes, "cron")
      resultado[tipo] = r.aviso ?? "ok"
    } catch (e) {
      resultado[tipo] = `erro: ${e instanceof Error ? e.message : "falha"}`
    }
  }
  return NextResponse.json({ ok: true, mes, resultado })
}
