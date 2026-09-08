import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Vocabulário REAL do CRM para as regras de atendimento IA: origens, status e tags
// (referências) que de fato existem em leads. Assim o editor fala com dados vivos,
// não com textos digitados soltos — e oferece chips clicáveis com os valores reais.
export async function GET(){
  try {
    const { data: leads } = await db().from("leads").select("origem,status,referencias").limit(20000)
    const origens = new Set<string>()
    const statuses = new Set<string>()
    const tags = new Set<string>()
    for (const l of leads ?? []) {
      if (l.origem) origens.add(String(l.origem))
      if (l.status) statuses.add(String(l.status))
      for (const r of (l.referencias ?? [])) {
        const v = typeof r === "string" ? r : r?.ref ?? ""
        if (v) tags.add(String(v))
      }
    }
    return NextResponse.json({
      ok: true,
      contexto: {
        origens: Array.from(origens).sort(),
        statuses: Array.from(statuses).sort(),
        tags: Array.from(tags).sort(),
      },
    })
  } catch (e:any) {
    return NextResponse.json({ ok:false, erro: e.message }, { status:500 })
  }
}