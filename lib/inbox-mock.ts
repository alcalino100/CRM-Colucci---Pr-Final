// Mock isolado - não toca no banco real. Usado só pela rota /inbox (teste B)
export type InboxStatus = "aguardando_resposta" | "respondido" | "em_follow_up"

export type InboxMessage = {
  id: string
  conversationId: string
  timestamp: string // ISO
  sender: "lead" | "você" | "ia"
  content: string
  origem?: "inbound" | "outbound"
}

export type InboxConversation = {
  id: string
  leadId: string
  leadName: string
  responsavel: string
  telefone: string
  email: string
  status: InboxStatus
  followUpAtivo: boolean
  tentativasRestantes?: number
  proximaTentativaISO?: string
  ultimaMensagem: string
  timestamp: string
  unread: number
  origem: "WhatsApp" | "Instagram" | "Site"
}

function hoursAgo(h: number) { return new Date(Date.now() - h * 3600_000).toISOString() }
function minutesAgo(m: number) { return new Date(Date.now() - m * 60_000).toISOString() }

export const mockConversas: InboxConversation[] = [
  { id:"c1", leadId:"l1", leadName:"Mariana Costa", responsavel:"Aline Alves", telefone:"(11) 99123-4567", email:"mariana.costa@email.com", status:"aguardando_resposta", followUpAtivo:false, ultimaMensagem:"Olá, ainda tem aquele apê de 2 quartos na Vila Mariana?", timestamp: minutesAgo(12), unread:2, origem:"WhatsApp" },
  { id:"c2", leadId:"l2", leadName:"Rafael Mendes", responsavel:"Kleber", telefone:"(18) 98112-0099", email:"rafa.mendes@email.com", status:"em_follow_up", followUpAtivo:true, tentativasRestantes:2, proximaTentativaISO: new Date(Date.now()+2*3600_000).toISOString(), ultimaMensagem:"IA: Olá Rafael, conseguiu ver as opções que enviei?", timestamp: hoursAgo(1), unread:0, origem:"Instagram" },
  { id:"c3", leadId:"l3", leadName:"Juliana Prado", responsavel:"Bianca", telefone:"(11) 98877-1122", email:"ju.prado@email.com", status:"respondido", followUpAtivo:false, ultimaMensagem:"Você: Perfeito, agendei a visita para amanhã 10h", timestamp: hoursAgo(3), unread:0, origem:"Site" },
  { id:"c4", leadId:"l4", leadName:"Carlos Nery", responsavel:"Patrícia Fernandes", telefone:"(18) 99706-6494", email:"carlos.nery@email.com", status:"em_follow_up", followUpAtivo:true, tentativasRestantes:3, proximaTentativaISO: new Date(Date.now()+5*3600_000).toISOString(), ultimaMensagem:"IA: Carlos, ainda tem interesse no imóvel REF 8921?", timestamp: hoursAgo(5), unread:0, origem:"WhatsApp" },
  { id:"c5", leadId:"l5", leadName:"Fernanda Lima", responsavel:"Aline Alves", telefone:"(11) 99912-3344", email:"fernanda.lima@email.com", status:"aguardando_resposta", followUpAtivo:false, ultimaMensagem:"Qual o valor do condomínio?", timestamp: minutesAgo(45), unread:1, origem:"WhatsApp" },
  { id:"c6", leadId:"l6", leadName:"Diego Oliveira", responsavel:"Viviane Manarelli", telefone:"(11) 98765-4321", email:"diego.oliveira@email.com", status:"aguardando_resposta", followUpAtivo:false, ultimaMensagem:"Pode me enviar mais fotos?", timestamp: hoursAgo(7), unread:3, origem:"Instagram" },
  { id:"c7", leadId:"l7", leadName:"Patrícia Souza", responsavel:"Kleber", telefone:"(18) 99121-3490", email:"patricia.souza@email.com", status:"respondido", followUpAtivo:false, ultimaMensagem:"Você: Obrigado pelo retorno, Patrícia!", timestamp: hoursAgo(10), unread:0, origem:"Site" },
  { id:"c8", leadId:"l8", leadName:"Lucas Captação", responsavel:"Jean", telefone:"(18) 98804-8761", email:"lucas.capta@email.com", status:"em_follow_up", followUpAtivo:true, tentativasRestantes:1, proximaTentativaISO: new Date(Date.now()+1*3600_000).toISOString(), ultimaMensagem:"IA: Lucas, tivemos uma nova unidade no mesmo prédio", timestamp: hoursAgo(12), unread:0, origem:"WhatsApp" },
  { id:"c9", leadId:"l9", leadName:"Aline Dib", responsavel:"Bruna", telefone:"(18) 99700-7890", email:"aline.dib@email.com", status:"aguardando_resposta", followUpAtivo:false, ultimaMensagem:"Gostaria de agendar visita na sexta", timestamp: minutesAgo(90), unread:1, origem:"WhatsApp" },
  { id:"c10", leadId:"l10", leadName:"Roberto Almeida", responsavel:"Ricardo", telefone:"(11) 91000-2233", email:"roberto.almeida@email.com", status:"respondido", followUpAtivo:false, ultimaMensagem:"Você: Documentação enviada por e-mail", timestamp: hoursAgo(24), unread:0, origem:"Site" },
]

export const mockMensagens: Record<string, InboxMessage[]> = {
  c1: [
    { id:"m1-1", conversationId:"c1", timestamp: hoursAgo(2), sender:"lead", origem:"inbound", content:"Olá, vi o anúncio no Instagram do apê na Vila Mariana" },
    { id:"m1-2", conversationId:"c1", timestamp: hoursAgo(1.5), sender:"ia", origem:"inbound", content:"Olá Mariana! Que bom que gostou. Ainda está disponível, 2 quartos, 68m², R$ 480.000. Quer agendar visita?" },
    { id:"m1-3", conversationId:"c1", timestamp: minutesAgo(12), sender:"lead", origem:"inbound", content:"Olá, ainda tem aquele apê de 2 quartos na Vila Mariana?" },
  ],
  c2: [
    { id:"m2-1", conversationId:"c2", timestamp: hoursAgo(6), sender:"lead", origem:"inbound", content:"Quero saber sobre o financiamento" },
    { id:"m2-2", conversationId:"c2", timestamp: hoursAgo(5), sender:"você", origem:"outbound", content:"Claro Rafael, trabalhamos com vários bancos. Qual sua renda aproximada?" },
    { id:"m2-3", conversationId:"c2", timestamp: hoursAgo(1), sender:"ia", origem:"inbound", content:"Olá Rafael, conseguiu ver as opções que enviei?" },
  ],
  c3: [
    { id:"m3-1", conversationId:"c3", timestamp: hoursAgo(4), sender:"lead", origem:"inbound", content:"Tenho interesse no imóvel REF 1023" },
    { id:"m3-2", conversationId:"c3", timestamp: hoursAgo(3.5), sender:"você", origem:"outbound", content:"Oi Juliana, o REF 1023 está disponível para visita amanhã. Que horário prefere?" },
    { id:"m3-3", conversationId:"c3", timestamp: hoursAgo(3), sender:"você", origem:"outbound", content:"Perfeito, agendei a visita para amanhã 10h" },
  ],
  c4: [
    { id:"m4-1", conversationId:"c4", timestamp: hoursAgo(8), sender:"lead", origem:"inbound", content:"REF 8921 ainda disponível?" },
    { id:"m4-2", conversationId:"c4", timestamp: hoursAgo(5), sender:"ia", origem:"inbound", content:"Carlos, ainda tem interesse no imóvel REF 8921?" },
  ],
  c5: [
    { id:"m5-1", conversationId:"c5", timestamp: minutesAgo(50), sender:"lead", origem:"inbound", content:"Qual o valor do condomínio?" },
  ],
  c6: [
    { id:"m6-1", conversationId:"c6", timestamp: hoursAgo(7.5), sender:"lead", origem:"inbound", content:"Pode me enviar mais fotos?" },
    { id:"m6-2", conversationId:"c6", timestamp: hoursAgo(7), sender:"lead", origem:"inbound", content:"E qual a metragem exata?" },
  ],
  c7: [
    { id:"m7-1", conversationId:"c7", timestamp: hoursAgo(11), sender:"lead", origem:"inbound", content:"Obrigada pelo atendimento!" },
    { id:"m7-2", conversationId:"c7", timestamp: hoursAgo(10), sender:"você", origem:"outbound", content:"Obrigado pelo retorno, Patrícia!" },
  ],
  c8: [
    { id:"m8-1", conversationId:"c8", timestamp: hoursAgo(13), sender:"lead", origem:"inbound", content:"Vi outro imóvel no mesmo bairro" },
    { id:"m8-2", conversationId:"c8", timestamp: hoursAgo(12), sender:"ia", origem:"inbound", content:"Lucas, tivemos uma nova unidade no mesmo prédio" },
  ],
  c9: [
    { id:"m9-1", conversationId:"c9", timestamp: minutesAgo(100), sender:"lead", origem:"inbound", content:"Gostaria de agendar visita na sexta" },
  ],
  c10: [
    { id:"m10-1", conversationId:"c10", timestamp: hoursAgo(25), sender:"lead", origem:"inbound", content:"Preciso da documentação" },
    { id:"m10-2", conversationId:"c10", timestamp: hoursAgo(24), sender:"você", origem:"outbound", content:"Documentação enviada por e-mail" },
  ],
}
