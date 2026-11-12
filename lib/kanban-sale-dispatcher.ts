import { supabase } from "@/lib/supabase/client"
import { SESSION_ID } from "@/components/sale-celebration"
import type { Lead } from "@/lib/mock-data"

export function broadcastSaleCelebration(params: {
  nome: string
  valor: number
  ref: string
  tipo: string
  corretorNome: string
}): void {
  supabase
    .channel("crm-celebracoes")
    .send({
      type: "broadcast",
      event: "sale",
      payload: {
        nome: params.nome,
        valor: params.valor,
        ref: params.ref,
        tipo: params.tipo,
        corretor: params.corretorNome,
        session: SESSION_ID,
      },
    })
    .then(() => {})
}

export function sendMetaSaleEvent(lead: Lead): void {
  fetch("/api/meta/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      lead_id: lead.id,
      telefone: lead.telefone,
      nome: lead.nome,
      email: lead.email,
      valor: lead.valorNegociacao,
      corretor_id: lead.corretorId,
      campanha_id: lead.metaCampaignId,
      adset_id: lead.metaAdsetId,
      ad_id: lead.metaAdId,
      utm_campaign: lead.utmCampaign,
      utm_adset: lead.utmAdset,
      utm_ad: lead.utmAd,
      fbc: lead.fbc,
      fbp: lead.fbp,
    }),
  }).catch(() => {})
}

export function notifyWhatsAppSale(params: {
  nome: string
  valor: number
  corretorNome: string
  refFechamento: string
}): void {
  fetch("/api/whatsapp/notify-sale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      nome: params.nome,
      valor: params.valor,
      corretorNome: params.corretorNome,
      refFechamento: params.refFechamento,
    }),
  }).catch(() => {})
}
