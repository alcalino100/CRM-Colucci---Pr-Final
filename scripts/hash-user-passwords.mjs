// Migração única: converte senhas em texto puro (coluna usuarios.senha_hash)
// para hash bcrypt. Idempotente — pula linhas que já estão em hash.
// Uso: SUPABASE_SECRET_KEY=... node scripts/hash-user-passwords.mjs
import { createClient } from "@supabase/supabase-js"
import bcrypt from "bcryptjs"

const SUPABASE_URL = "https://lehqtdajfjzfhucxpvje.supabase.co"
const secretKey = process.env.SUPABASE_SECRET_KEY
if (!secretKey) {
  console.error("Defina SUPABASE_SECRET_KEY (Supabase > Project Settings > API Keys > secret key).")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } })

const { data: usuarios, error } = await supabase.from("usuarios").select("id, email, senha_hash")
if (error) {
  console.error("Falha ao ler usuarios:", error.message)
  process.exit(1)
}

let migrados = 0
let jaEramHash = 0
for (const u of usuarios ?? []) {
  if (typeof u.senha_hash === "string" && u.senha_hash.startsWith("$2")) {
    jaEramHash++
    continue
  }
  const hash = await bcrypt.hash(u.senha_hash ?? "", 10)
  const { error: updateError } = await supabase.from("usuarios").update({ senha_hash: hash }).eq("id", u.id)
  if (updateError) {
    console.error(`Falha ao migrar ${u.email}:`, updateError.message)
    continue
  }
  migrados++
}

console.log(`Concluído. ${migrados} senha(s) migrada(s) para hash, ${jaEramHash} já estavam em hash.`)
