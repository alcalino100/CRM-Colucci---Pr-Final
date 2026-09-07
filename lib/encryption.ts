import crypto from "crypto"

const KEY = process.env.ENCRYPTION_KEY || "default_dev_key_32_chars_long_12345"

function getKey(){
  const k = Buffer.from(KEY)
  if(k.length===32) return k
  // pad/truncate to 32
  const buf = Buffer.alloc(32)
  k.copy(buf)
  return buf
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-256-cbc", getKey(), iv)
  let enc = cipher.update(token, "utf8", "hex")
  enc += cipher.final("hex")
  return iv.toString("hex") + ":" + enc
}

export function decryptToken(enc: string): string {
  const [ivHex, data] = enc.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(), iv)
  let dec = decipher.update(data, "hex", "utf8")
  dec += decipher.final("utf8")
  return dec
}
