// Alerta de saúde das instâncias WhatsApp.
//
// O aviso antigo (notifyDisconnection) só dispara na virada "conectado" → "desconectado".
// Ele não pegou dois casos reais de 10–17/11/2026, que fizeram o CRM perder leads de anúncio:
//   1. Daline: instância presa em "conectando" por 7 dias (nunca virou "desconectado").
//   2. Jéssica: instância "conectada" que parou de receber mensagens (sessão travada).
//
// Este módulo detecta os dois casos. A regra de horário e de limiar é pura (testável);
// a parte com banco/WhatsApp fica em verificarSaudeInstancias().

export const FUSO_OFFSET_HORAS = -3 // America/Sao_Paulo (sem horário de verão)
export const HORA_INICIO_UTIL = 8
export const HORA_FIM_UTIL = 20 // exclusivo
export const MINUTOS_PRESO_CONECTANDO = 60
export const MIN_SILENCIO_UTIL_MINUTOS = 120
export const MAX_SILENCIO_UTIL_MINUTOS = 720
// Silêncio só é "improvável" se a chance de zero mensagens no intervalo cair abaixo de ~0,1%: λ·horas ≥ ln(1000).
export const FATOR_SILENCIO = 6.9
export const COOLDOWN_HORAS = 12
export const JANELA_MEDIA_DIAS = 7

export type TipoProblemaInstancia = "presa_conectando" | "conectada_sem_mensagens"

export interface ProblemaInstancia {
  instanceName: string
  corretorId: string | null
  tipo: TipoProblemaInstancia
  detalhe: string
}

export interface InstanciaParaAvaliar {
  instanceName: string
  corretorId: string | null
  status: string
  atualizadoEm: string | null
  ultimaRecebida: string | null
  recebidasNaJanela: number
}

function paraHorarioLocal(d: Date): Date {
  return new Date(d.getTime() + FUSO_OFFSET_HORAS * 3600_000)
}

// Minutos "úteis" (seg–sáb, 08h–20h de Brasília) dentro do intervalo [desde, ate].
export function minutosUteisEntre(desde: Date, ate: Date): number {
  if (ate <= desde) return 0
  const iniLocal = paraHorarioLocal(desde)
  const fimLocal = paraHorarioLocal(ate)
  const dia = new Date(Date.UTC(iniLocal.getUTCFullYear(), iniLocal.getUTCMonth(), iniLocal.getUTCDate()))
  let total = 0
  for (let i = 0; i < 400; i++) {
    if (dia.getTime() > fimLocal.getTime()) break
    if (dia.getUTCDay() !== 0) {
      const abre = dia.getTime() + HORA_INICIO_UTIL * 3600_000
      const fecha = dia.getTime() + HORA_FIM_UTIL * 3600_000
      const de = Math.max(abre, iniLocal.getTime())
      const ateMs = Math.min(fecha, fimLocal.getTime())
      if (ateMs > de) total += (ateMs - de) / 60_000
    }
    dia.setUTCDate(dia.getUTCDate() + 1)
  }
  return Math.round(total)
}

export function ehHorarioUtil(agora: Date): boolean {
  const l = paraHorarioLocal(agora)
  if (l.getUTCDay() === 0) return false
  const h = l.getUTCHours()
  return h >= HORA_INICIO_UTIL && h < HORA_FIM_UTIL
}

// Minutos de silêncio útil a partir dos quais a falta de mensagens deixa de ser normal para esta linha.
// Linhas movimentadas disparam rápido; linhas de pouco movimento esperam mais.
export function limiarSilencioMinutos(recebidasNaJanela: number, agora: Date): number {
  const inicio = new Date(agora.getTime() - JANELA_MEDIA_DIAS * 86400_000)
  const minutosUteisJanela = minutosUteisEntre(inicio, agora)
  if (recebidasNaJanela <= 0 || minutosUteisJanela <= 0) return MAX_SILENCIO_UTIL_MINUTOS
  const porMinuto = recebidasNaJanela / minutosUteisJanela
  const minutos = Math.ceil(FATOR_SILENCIO / porMinuto)
  return Math.min(MAX_SILENCIO_UTIL_MINUTOS, Math.max(MIN_SILENCIO_UTIL_MINUTOS, minutos))
}

function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`
}

export function avaliarInstancia(inst: InstanciaParaAvaliar, agora: Date): ProblemaInstancia | null {
  const base = { instanceName: inst.instanceName, corretorId: inst.corretorId }

  if (inst.status === "conectando") {
    const desde = inst.atualizadoEm ? new Date(inst.atualizadoEm) : null
    if (!desde || Number.isNaN(desde.getTime())) return null
    const minutos = Math.round((agora.getTime() - desde.getTime()) / 60_000)
    if (minutos < MINUTOS_PRESO_CONECTANDO) return null
    return {
      ...base,
      tipo: "presa_conectando",
      detalhe: `presa em "conectando" há ${formatarDuracao(minutos)}. Mensagens e leads dessa linha não chegam ao CRM.`,
    }
  }

  if (inst.status !== "conectado") return null
  if (!ehHorarioUtil(agora)) return null

  if (!inst.ultimaRecebida) {
    return {
      ...base,
      tipo: "conectada_sem_mensagens",
      detalhe: `aparece como conectada, mas não recebeu nenhuma mensagem nos últimos ${JANELA_MEDIA_DIAS} dias.`,
    }
  }

  const ultima = new Date(inst.ultimaRecebida)
  const silencio = minutosUteisEntre(ultima, agora)
  const limiar = limiarSilencioMinutos(inst.recebidasNaJanela, agora)
  if (silencio < limiar) return null
  return {
    ...base,
    tipo: "conectada_sem_mensagens",
    detalhe: `aparece como conectada, mas está há ${formatarDuracao(silencio)} úteis sem receber mensagens (o normal seria receber a cada poucos minutos). A sessão pode estar travada.`,
  }
}

export function avaliarInstancias(lista: InstanciaParaAvaliar[], agora: Date): ProblemaInstancia[] {
  return lista.map((i) => avaliarInstancia(i, agora)).filter((p): p is ProblemaInstancia => p !== null)
}

export function textoAlerta(nomeCorretor: string, p: ProblemaInstancia): string {
  return `⚠️ WhatsApp de ${nomeCorretor} (${p.instanceName}) ${p.detalhe} Reconecte em Meu Perfil → Meu WhatsApp (ou reinicie a instância na Evolution).`
}
