// Backfill retroativo: marca responded_at nos jobs de automação já enviados cujo lead
// respondeu no WhatsApp depois do envio. Usa a mesma regra do webhook (resposta = mensagem
// recebida, de_mim=false, do mesmo lead, após sent_at). Idempotente: só toca jobs enviados
// ainda sem responded_at.
// Uso: node scripts/backfill-automation-responses.mjs
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://lehqtdajfjzfhucxpvje.supabase.co"
const SUPABASE_KEY = "sb_publishable_msjWwAcjLaN5IOVlZhPSwg_gYk0i2K5"
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// Jobs enviados, sem resposta registrada
const { data: jobs, error } = await supabase
  .from("automation_jobs")
  .select("id, lead_id, sent_at, status")
  .in("status", ["sent", "delivered", "read"])
  .is("responded_at", null)
  .not("sent_at", "is", null)
if (error) { console.error("Falha ao ler jobs:", error.message); process.exit(1) }

let marcados = 0
for (const job of jobs ?? []) {
  // Primeira mensagem recebida do lead após o envio
  const { data: resp } = await supabase
    .from("whatsapp_mensagens")
    .select("criado_em")
    .eq("lead_id", job.lead_id)
    .eq("de_mim", false)
    .gt("criado_em", job.sent_at)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!resp) continue
  const { error: upErr } = await supabase
    .from("automation_jobs")
    .update({ status: "responded", responded_at: resp.criado_em })
    .eq("id", job.id)
  if (upErr) { console.error(`Falha ao marcar job ${job.id}:`, upErr.message); continue }
  marcados++
}

console.log(`Concluído. ${marcados} de ${jobs?.length ?? 0} job(s) enviado(s) marcados como respondidos.`)
