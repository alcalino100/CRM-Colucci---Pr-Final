// lib/relatorios/trafego-helper.ts
// Função única e canônica compartilhada para identificação de leads originados por Tráfego Pago / Anúncios.

export interface LeadTrafegoCheckable {
  origem?: string | null
  meta_campaign_id?: string | null
  metaCampaignId?: string | null
  utm_campaign?: string | null
  utmCampaign?: string | null
}

/**
 * Critério único e compartilhado no CRM para determinar se um lead veio de Tráfego Pago:
 * 1. Origem explícita igual a "Tráfego Pago"
 * 2. OU Campanha Meta vinculada (meta_campaign_id / metaCampaignId)
 * 3. OU UTM Campaign vinculada (utm_campaign / utmCampaign)
 */
export function ehTrafegoPago(lead: LeadTrafegoCheckable | null | undefined): boolean {
  if (!lead) return false

  if (lead.origem === "Tráfego Pago") return true

  const metaId = lead.meta_campaign_id || lead.metaCampaignId
  if (metaId && typeof metaId === "string" && metaId.trim().length > 0) return true

  const utm = lead.utm_campaign || lead.utmCampaign
  if (utm && typeof utm === "string" && utm.trim().length > 0) return true

  return false
}
