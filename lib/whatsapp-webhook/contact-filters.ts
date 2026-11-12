import { TELEFONES_BLOQUEADOS, isTelefoneBloqueado as isBlockedCentral } from "@/lib/telefones-bloqueados"
import { onlyDigits } from "@/lib/whatsapp/server"

// Números internos que NUNCA podem virar lead — lista centralizada em lib/telefones-bloqueados.ts
// Mantém compatibilidade com WHATSAPP_BLOCKED_NUMBERS via env (merge)
const ENV_BLOCKED = new Set(
  (process.env.WHATSAPP_BLOCKED_NUMBERS || "")
    .split(",")
    .map((s) => s.trim().replace(/\D/g, ""))
    .filter(Boolean)
)
export const BLOCKED_NUMBERS = new Set<string>([...TELEFONES_BLOQUEADOS, ...ENV_BLOCKED])

export function isBlocked(telefone: string): boolean {
  return BLOCKED_NUMBERS.has(telefone.replace(/\D/g, "")) || isBlockedCentral(telefone)
}

// Nomes internos que NUNCA podem virar lead (ex.: esposa/parentes de corretores).
// Configurável via WHATSAPP_BLOCKED_NAMES (separado por vírgula). Comparação normalizada
// (sem acentos/emoji) — "Fran 🌹" e "Fran" são tratados como o mesmo nome.
export function normalizeName(v: string): string {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export const BLOCKED_NAMES = new Set(
  (process.env.WHATSAPP_BLOCKED_NAMES || "ketrine cristiane,fran")
    .split(",")
    .map((s) => normalizeName(s))
    .filter(Boolean)
)

export function isBlockedName(nome: string): boolean {
  const n = normalizeName(nome)
  if (!n) return false
  return Array.from(BLOCKED_NAMES).some((b) => n === b || n.startsWith(`${b} `))
}

// Extrai o telefone real do contato resolvendo identificadores de grupo, transmissão
// e o modo LID (Linked Identity Device) do WhatsApp / Baileys.
export function extrairTelefoneContato(msg: Record<string, unknown> | null | undefined): { telefone: string; remoteJid: string } {
  const key = (msg?.key as Record<string, unknown> | undefined) ?? {}
  const remoteJid: string = String(key.remoteJid ?? msg?.remoteJid ?? "")
  const remoteJidAlt: string = String(key.remoteJidAlt ?? msg?.remoteJidAlt ?? "")
  const participantAlt: string = String(key.participantAlt ?? msg?.participantAlt ?? "")
  const _participant: string = String(key.participant ?? msg?.participant ?? "")
  const sender: string = String(msg?.sender ?? "")

  // Ignora grupos e transmissões
  if (remoteJid.includes("@g.us") || remoteJid.includes("broadcast")) {
    return { telefone: "", remoteJid }
  }

  // Priorização para descobrir o telefone real (evitando identificador interno LID):
  // 1. Se remoteJidAlt contiver @s.whatsapp.net (padrão Baileys v6+ quando addressingMode === 'lid')
  // 2. Se remoteJid contiver @s.whatsapp.net e NÃO for @lid
  // 3. Se participantAlt contiver @s.whatsapp.net
  // 4. Se sender contiver @s.whatsapp.net
  // 5. Fallback para remoteJidAlt ou participant ou remoteJid
  let jidAlvo = ""
  if (remoteJidAlt && remoteJidAlt.includes("@s.whatsapp.net")) {
    jidAlvo = remoteJidAlt
  } else if (remoteJid && remoteJid.includes("@s.whatsapp.net") && !remoteJid.includes("@lid")) {
    jidAlvo = remoteJid
  } else if (participantAlt && participantAlt.includes("@s.whatsapp.net")) {
    jidAlvo = participantAlt
  } else if (sender && sender.includes("@s.whatsapp.net")) {
    jidAlvo = sender
  } else if (remoteJidAlt && !remoteJidAlt.includes("@lid")) {
    jidAlvo = remoteJidAlt
  } else {
    jidAlvo = remoteJid
  }

  const digits = onlyDigits(jidAlvo.split("@")[0])
  return { telefone: digits, remoteJid }
}
