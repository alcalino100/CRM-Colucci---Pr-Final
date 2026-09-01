// Telefones internos que NUNCA podem virar lead — lista da empresa (Colucci)
import { normalizePhone } from "./labels"

const RAW = [
  "5518991975658", // Carvalho privado
  "5518981431825", // Elaine privado
  "5518996392146", // Aline Alves empresa
  "5518996729877", // Aline Alves privado
  "5518981333179", // Eduardo empresa
  "5518981757223", // Eduardo privado
  "5518981283073", // Patrícia Nascimento privado
  "5518991792914", // Bianca empresa
  "5518998260279", // Bianca privado
  "5518991225036", // Carlos Nery empresa
  "5518997066494", // Carlos Nery privado
  "5518981966427", // Luciana empresa
  "5511910995442", // Luciana privado
  "5518981120193", // Osvaldo empresa
  "5518996211731", // Osvaldo privado
  "5518991979418", // Viviane Manarelli empresa
  "5518981106737", // Viviane Manarelli privado
  "5518997549312", // Angélica/Dayane empresa
  "5518991045922", // Angélica privado
  "5518996787647", // Dayane privado
  "5518998047710", // Camila privado
  "5518997114482", // Otávio privado
  "5518991310784", // Raul privado
  "5518981071932", // Ricardo empresa
  "5518997275820", // Ricardo privado
  "5518996912659", // Stefany empresa (já bloqueado)
  "5518997332865", // Stefany privado
  "5518981779979", // Vinícius privado
  "5518981340377", // Abraão empresa
  "5518981725280", // Abraão privado
  "5518997007890", // Aline Dib empresa
  "5518991016448", // Brayon
  "5518996280867", // Bruna privado
  "5518997548275", // Diego empresa
  "5518988207599", // Diego privado
  "5518991976332", // Isabela/Patrícia Fernandes empresa
  "5518996093501", // Isabela privado
  "5518988048761", // Jean CAPTAÇÃO
  "5518991502791", // João Bernardo
  "5518991975661", // Kleber
  "5518997663833", // Levi
  "5518935003711", // Lucas CAPTAÇÃO
  "5518997990131", // Patrícia Fernandes privado
  "5518991213490", // Viviane Viana
  "5518321034900", // Principal 2103-4900 com 55+18
  "5518991976332", // duplicado
  "5518996647087", // já existente
  "5518997472139",
  "5518997857464",
]

function onlyDigits(v: string) { return (v || "").replace(/\D/g, "") }

export const TELEFONES_BLOQUEADOS_RAW = RAW

// Set com variações normalizadas (com e sem 55) para comparar tanto com onlyDigits quanto normalizePhone
export const TELEFONES_BLOQUEADOS = new Set<string>([
  ...RAW.map(onlyDigits),
  ...RAW.map((n) => normalizePhone(n)),
  // também sem DDD para ramais curtos se aparecer só 4900 etc (não bloqueia, mas garante)
])

export function isTelefoneBloqueado(phone: string): boolean {
  const d = onlyDigits(phone)
  const n = normalizePhone(phone)
  return TELEFONES_BLOQUEADOS.has(d) || TELEFONES_BLOQUEADOS.has(n)
}
