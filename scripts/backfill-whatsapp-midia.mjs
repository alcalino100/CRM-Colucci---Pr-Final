// Backfill best-effort: tenta recuperar a mídia de mensagens antigas gravadas como "[mídia]"
// (ou já marcadas com tipo_midia mas sem midia_url), baixando da Evolution pelo id da mensagem
// e subindo para o Storage. Mídia que a Evolution já expirou não volta — essas ficam como estão.
//
// Uso: SUPABASE_SECRET_KEY=... EVOLUTION_API_URL=... EVOLUTION_API_KEY_2=... \
//        node scripts/backfill-whatsapp-midia.mjs [limite]
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://lehqtdajfjzfhucxpvje.supabase.co"
const secret = process.env.SUPABASE_SECRET_KEY
const EVO_URL = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "")
const EVO_KEY = process.env.EVOLUTION_API_KEY_2 || process.env.EVOLUTION_API_KEY || ""
if (!secret || !EVO_URL || !EVO_KEY) {
  console.error("Defina SUPABASE_SECRET_KEY, EVOLUTION_API_URL e EVOLUTION_API_KEY_2.")
  process.exit(1)
}
const LIMITE = Number(process.argv[2] || 500)
const BUCKET = "whatsapp-midia"
const supabase = createClient(SUPABASE_URL, secret, { auth: { persistSession: false } })

function extDoMime(mime) {
  const map = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/amr": "amr", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf" }
  return map[(mime || "").split(";")[0].trim()] || "bin"
}

// Candidatas: têm id de mensagem, ainda sem arquivo, e são mídia (tipo_midia setado OU corpo == "[mídia]")
const { data: cands, error } = await supabase
  .from("whatsapp_mensagens")
  .select("id, instance_name, mensagem_id, tipo_midia, corpo")
  .not("mensagem_id", "is", null)
  .is("midia_url", null)
  .or("tipo_midia.not.is.null,corpo.eq.[mídia]")
  .order("criado_em", { ascending: false })
  .limit(LIMITE)
if (error) { console.error("Falha ao ler candidatas:", error.message); process.exit(1) }

let ok = 0, falhou = 0
for (const m of cands ?? []) {
  try {
    const res = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${encodeURIComponent(m.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ message: { key: { id: m.mensagem_id } }, convertToMp4: false }),
    })
    if (!res.ok) { falhou++; continue }
    const json = await res.json().catch(() => null)
    const base64 = json?.base64 ?? json?.media
    if (!base64) { falhou++; continue }
    const mime = json?.mimetype ?? null
    const caminho = `${m.instance_name}/${m.mensagem_id}.${extDoMime(mime)}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(caminho, Buffer.from(base64, "base64"), { contentType: mime ?? "application/octet-stream", upsert: true })
    if (upErr) { falhou++; continue }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
    const patch = { midia_url: pub.publicUrl, mime_type: mime }
    // Se veio como "[mídia]" sem tipo, tenta inferir o tipo pelo mime
    if (!m.tipo_midia && mime) {
      patch.tipo_midia = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "document"
    }
    await supabase.from("whatsapp_mensagens").update(patch).eq("id", m.id)
    ok++
  } catch {
    falhou++
  }
}
console.log(`Concluído. ${ok} mídia(s) recuperada(s), ${falhou} indisponível(is)/expirada(s) de ${cands?.length ?? 0} candidata(s).`)
