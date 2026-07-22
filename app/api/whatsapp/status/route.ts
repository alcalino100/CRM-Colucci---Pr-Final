import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Fonte da verdade do status é o banco, atualizado pelo webhook
export async function GET(request: Request) {
  const instanceName = new URL(request.url).searchParams.get("instanceName")
  if (!instanceName) return NextResponse.json({ error: "Instância não informada." }, { status: 400 })

  const { data, error } = await wsupabase
    .from("whatsapp_instancias")
    .select("status, numero")
    .eq("instance_name", instanceName)
    .maybeSingle()
  if (error) return NextResponse.json({ error: "Não foi possível consultar o status." }, { status: 500 })

  return NextResponse.json({ status: data?.status ?? "desconectado", numero: data?.numero ?? null })
}
