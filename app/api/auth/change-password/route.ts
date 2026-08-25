import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(req: NextRequest) {
  const { userId, senhaAtual, novaSenha } = await req.json().catch(() => ({}))
  if (!userId || !senhaAtual || !novaSenha) {
    return NextResponse.json({ ok: false, error: "Dados incompletos." }, { status: 400 })
  }
  if (novaSenha.length < 6) {
    return NextResponse.json({ ok: false, error: "A nova senha deve ter pelo menos 6 caracteres." }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, senha_hash")
    .eq("id", userId)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 })
  }

  const senhaAtualOk = await bcrypt.compare(senhaAtual, data.senha_hash)
  if (!senhaAtualOk) {
    return NextResponse.json({ ok: false, error: "Senha atual incorreta." }, { status: 401 })
  }

  const novoHash = await bcrypt.hash(novaSenha, 10)
  const { error: updateError } = await supabaseAdmin
    .from("usuarios")
    .update({ senha_hash: novoHash })
    .eq("id", userId)

  if (updateError) {
    return NextResponse.json({ ok: false, error: "Não foi possível salvar. Tente novamente." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
