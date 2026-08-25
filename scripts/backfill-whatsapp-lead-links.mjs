// Backfill único: liga mensagens antigas de whatsapp_mensagens (lead_id nulo) ao lead
// cujo telefone bate, usando a mesma normalização do resto do app (derruba o "55" do
// DDI quando o número tem mais de 11 dígitos). Idempotente — só toca linhas com lead_id nulo.
// Uso: node scripts/backfill-whatsapp-lead-links.mjs
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://lehqtdajfjzfhucxpvje.supabase.co"
const SUPABASE_KEY = "sb_publishable_msjWwAcjLaN5IOVlZhPSwg_gYk0i2K5"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

function normalizePhone(phone) {
  const d = (phone || "").replace(/\D/g, "")
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d
}

// A API do Supabase às vezes derruba a conexão (fetch failed) em execuções longas.
// Tenta de novo com um pequeno backoff em vez de abortar o backfill inteiro.
async function comRetry(fn, tentativas = 5) {
  let ultimoErro
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fn()
      if (!r.error) return r
      ultimoErro = r.error
    } catch (e) {
      ultimoErro = e
    }
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)))
  }
  return { error: ultimoErro }
}

const { data: leads, error: leadsError } = await supabase.from("leads").select("id, telefone")
if (leadsError) {
  console.error("Falha ao ler leads:", leadsError.message)
  process.exit(1)
}
const porTelefone = new Map()
for (const l of leads ?? []) {
  const key = normalizePhone(l.telefone)
  if (key && !porTelefone.has(key)) porTelefone.set(key, l.id)
}

// Pagina por cursor de id (não por offset): como cada vínculo encontrado tira a linha do
// filtro "lead_id is null", um offset fixo pularia linhas — o cursor sempre avança e evita isso.
const PAGE_SIZE = 1000
let vinculadas = 0
let analisadas = 0
let cursor = ""
for (;;) {
  const { data: mensagens, error: msgError } = await comRetry(() => {
    let query = supabase.from("whatsapp_mensagens").select("id, telefone").is("lead_id", null).order("id").limit(PAGE_SIZE)
    if (cursor) query = query.gt("id", cursor)
    return query
  })
  if (msgError) {
    console.error("Falha ao ler whatsapp_mensagens:", msgError.message ?? msgError)
    process.exit(1)
  }
  if (!mensagens || mensagens.length === 0) break

  // Agrupa por lead antes de gravar: um UPDATE ... WHERE id IN (...) por lead nesta
  // página, em vez de uma chamada de rede por mensagem (bem mais rápido em ~46 mil linhas).
  const idsPorLead = new Map()
  for (const m of mensagens) {
    analisadas++
    const leadId = porTelefone.get(normalizePhone(m.telefone))
    if (leadId) {
      if (!idsPorLead.has(leadId)) idsPorLead.set(leadId, [])
      idsPorLead.get(leadId).push(m.id)
    }
    cursor = m.id
  }
  for (const [leadId, ids] of idsPorLead) {
    const { error } = await comRetry(() => supabase.from("whatsapp_mensagens").update({ lead_id: leadId }).in("id", ids))
    if (error) console.error(`Falha ao vincular ${ids.length} mensagem(ns) do lead ${leadId}:`, error.message ?? error)
    else vinculadas += ids.length
  }

  console.log(`... página processada, ${analisadas} mensagem(ns) analisadas até agora`)
  if (mensagens.length < PAGE_SIZE) break
}

console.log(`Concluído. ${vinculadas} de ${analisadas} mensagem(ns) sem vínculo foram ligadas a um lead.`)
