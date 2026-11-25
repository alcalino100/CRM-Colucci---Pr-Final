import { NextResponse } from "next/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { listarContasInstagram, permissoesConcedidas, PERMISSOES_INSTAGRAM } from "@/lib/instagram/client"
import { resolverTokenMeta } from "@/lib/meta/token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Contas do Instagram disponíveis + diagnóstico das permissões do token (o que falta reconectar).
export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const token = await resolverTokenMeta()
  if (!token) return NextResponse.json({ ok: false, conectado: false, erro: "A Meta ainda não está conectada ao CRM." })
  const [perm, contas] = await Promise.all([permissoesConcedidas(token), listarContasInstagram(token)])
  const faltando = perm ? PERMISSOES_INSTAGRAM.filter((p) => !perm.includes(p)) : null
  if (!contas.ok) return NextResponse.json({ ok: false, conectado: true, erro: contas.erro, faltaPermissao: !!contas.faltaPermissao || (faltando?.length ?? 0) > 0, permissoesFaltando: faltando })
  return NextResponse.json({ ok: true, conectado: true, contas: contas.contas, permissoesFaltando: faltando, aviso: contas.contas.length === 0 ? "Nenhuma conta do Instagram profissional está ligada às Páginas que este token enxerga. Ligue o Instagram à Página no Gerenciador de Negócios e reconecte." : undefined })
}
