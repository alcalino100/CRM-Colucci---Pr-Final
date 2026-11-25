/** Configuração da WhatsApp Cloud API (Meta). Segredos só no servidor (variáveis de ambiente). */
export const GRAPH_VERSAO = process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0"
export const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSAO}`
export const PREFIXO_CANAL = "oficial:"

export const tokenCloud = () => process.env.WHATSAPP_CLOUD_TOKEN || ""
export const segredoApp = () => process.env.META_APP_SECRET || ""
export const tokenVerificacao = () => process.env.WHATSAPP_CLOUD_VERIFY_TOKEN || ""

export const ehCanalOficial = (instanceName: string | null | undefined) => !!instanceName && instanceName.startsWith(PREFIXO_CANAL)
export const instanceDoCanal = (phoneNumberId: string) => `${PREFIXO_CANAL}${phoneNumberId}`
export const phoneNumberIdDoCanal = (instanceName: string) => instanceName.slice(PREFIXO_CANAL.length)

export function statusConfiguracao() {
  return { token: !!tokenCloud(), appSecret: !!segredoApp(), verifyToken: !!tokenVerificacao() }
}
