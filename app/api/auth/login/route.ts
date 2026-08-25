import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(req: NextRequest) {
  const { email, senha } = await req.json().catch(() => ({ email: "", senha: "" }))
  if (!email || !senha) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, email, role, status, senha_hash, criado_em")
    .eq("email", String(email).trim().toLowerCase())
    .eq("status", "ativo")
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const senhaOk = await bcrypt.compare(senha, data.senha_hash)
  if (!senhaOk) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: data.id,
      nome: data.nome,
      email: data.email,
      role: data.role,
      ativo: data.status === "ativo",
      criadoEm: data.criado_em,
    },
  })
}
