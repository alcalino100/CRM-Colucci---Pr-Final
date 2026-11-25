/** Análise de posts do Instagram (sem I/O, 100% testável). Horário sempre em Brasília. */
export type Formato = "Reels" | "Carrossel" | "Imagem" | "Vídeo" | "Outro"

export type PostIG = {
  id: string
  permalink: string
  legenda: string
  miniatura: string | null
  formato: Formato
  publicadoEm: string
  curtidas: number
  comentarios: number
  alcance: number | null
  salvamentos: number
  compartilhamentos: number
  visualizacoes: number | null
  /** Reels: tempo médio assistido, em segundos. */
  tempoMedioSeg?: number | null
}

export type PostAnalisado = PostIG & { interacoes: number; taxaEngajamento: number | null }

const BRT = "America/Sao_Paulo"
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

export function formatoDe(tipo: string, produto?: string | null): Formato {
  if (produto === "REELS") return "Reels"
  if (tipo === "CAROUSEL_ALBUM") return "Carrossel"
  if (tipo === "IMAGE") return "Imagem"
  if (tipo === "VIDEO") return "Vídeo"
  return "Outro"
}

export function analisarPost(p: PostIG): PostAnalisado {
  const interacoes = p.curtidas + p.comentarios + p.salvamentos + p.compartilhamentos
  const taxa = p.alcance && p.alcance > 0 ? Math.round((interacoes / p.alcance) * 10000) / 100 : null
  return { ...p, interacoes, taxaEngajamento: taxa }
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const arred = (n: number, c = 2) => Math.round(n * 10 ** c) / 10 ** c

export function partesBRT(iso: string): { diaSemana: number; hora: number } {
  const d = new Date(iso)
  const dia = new Intl.DateTimeFormat("en-US", { timeZone: BRT, weekday: "short" }).format(d)
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: BRT, hour: "2-digit", hour12: false }).format(d)) % 24
  return { diaSemana: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dia), hora }
}

const faixa = (h: number) => (h < 6 ? "Madrugada (0h–6h)" : h < 12 ? "Manhã (6h–12h)" : h < 18 ? "Tarde (12h–18h)" : "Noite (18h–24h)")

export type ResumoPosts = {
  totalPosts: number
  postsPorSemana: number
  alcanceTotal: number
  alcanceMedio: number
  interacoesTotal: number
  curtidas: number
  comentarios: number
  salvamentos: number
  compartilhamentos: number
  visualizacoes: number
  taxaEngajamentoMedia: number
}

export function resumirPosts(posts: PostAnalisado[], dias: number): ResumoPosts {
  const comAlcance = posts.filter((p) => p.alcance)
  const soma = (f: (p: PostAnalisado) => number) => posts.reduce((a, p) => a + f(p), 0)
  const taxas = posts.map((p) => p.taxaEngajamento).filter((t): t is number => t !== null)
  return {
    totalPosts: posts.length,
    postsPorSemana: dias > 0 ? arred((posts.length / dias) * 7, 1) : 0,
    alcanceTotal: soma((p) => p.alcance ?? 0),
    alcanceMedio: Math.round(media(comAlcance.map((p) => p.alcance as number))),
    interacoesTotal: soma((p) => p.interacoes),
    curtidas: soma((p) => p.curtidas),
    comentarios: soma((p) => p.comentarios),
    salvamentos: soma((p) => p.salvamentos),
    compartilhamentos: soma((p) => p.compartilhamentos),
    visualizacoes: soma((p) => p.visualizacoes ?? 0),
    taxaEngajamentoMedia: arred(media(taxas)),
  }
}

export type GrupoDesempenho = { rotulo: string; posts: number; alcanceMedio: number; taxaEngajamentoMedia: number }

function agrupar(posts: PostAnalisado[], chave: (p: PostAnalisado) => string): GrupoDesempenho[] {
  const mapa = new Map<string, PostAnalisado[]>()
  for (const p of posts) mapa.set(chave(p), [...(mapa.get(chave(p)) ?? []), p])
  return Array.from(mapa, ([rotulo, ps]) => ({
    rotulo,
    posts: ps.length,
    alcanceMedio: Math.round(media(ps.filter((p) => p.alcance).map((p) => p.alcance as number))),
    taxaEngajamentoMedia: arred(media(ps.map((p) => p.taxaEngajamento).filter((t): t is number => t !== null))),
  })).sort((a, b) => b.taxaEngajamentoMedia - a.taxaEngajamentoMedia)
}

export const porFormato = (posts: PostAnalisado[]) => agrupar(posts, (p) => p.formato)
export const porDiaSemana = (posts: PostAnalisado[]) => agrupar(posts, (p) => DIAS[partesBRT(p.publicadoEm).diaSemana] ?? "?")
export const porFaixaHorario = (posts: PostAnalisado[]) => agrupar(posts, (p) => faixa(partesBRT(p.publicadoEm).hora))

/** Ranking por engajamento. Ignora posts sem alcance e, quando há amostra, os de alcance muito baixo (ruído). */
export function ranking(posts: PostAnalisado[], quantos = 5): { melhores: PostAnalisado[]; piores: PostAnalisado[] } {
  const validos = posts.filter((p) => p.taxaEngajamento !== null)
  const medianaAlcance = validos.length ? [...validos].map((p) => p.alcance as number).sort((a, b) => a - b)[Math.floor(validos.length / 2)] : 0
  const base = validos.length >= 8 ? validos.filter((p) => (p.alcance as number) >= medianaAlcance * 0.2) : validos
  const ordenados = [...base].sort((a, b) => (b.taxaEngajamento as number) - (a.taxaEngajamento as number))
  return { melhores: ordenados.slice(0, quantos), piores: ordenados.slice(-quantos).reverse().filter((p) => !ordenados.slice(0, quantos).includes(p)) }
}

export type AnaliseInstagram = {
  hashtags: HashtagDesempenho[]
  mapaCalor: CelulaCalor[]
  resumo: ResumoPosts
  porFormato: GrupoDesempenho[]
  porDiaSemana: GrupoDesempenho[]
  porFaixaHorario: GrupoDesempenho[]
  melhores: PostAnalisado[]
  piores: PostAnalisado[]
}

export function analisarInstagram(posts: PostIG[], dias: number): AnaliseInstagram {
  const analisados = posts.map(analisarPost)
  const { melhores, piores } = ranking(analisados)
  return { hashtags: hashtagsTop(analisados), mapaCalor: mapaCalor(analisados), resumo: resumirPosts(analisados, dias), porFormato: porFormato(analisados), porDiaSemana: porDiaSemana(analisados), porFaixaHorario: porFaixaHorario(analisados), melhores, piores }
}

/** Variação percentual entre dois períodos (null quando não há base de comparação). */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return arred(((atual - anterior) / anterior) * 100, 1)
}

export type HashtagDesempenho = { tag: string; posts: number; alcanceMedio: number; taxaEngajamentoMedia: number }

/** Hashtags mais usadas nas legendas, com o desempenho médio dos posts em que aparecem. */
export function hashtagsTop(posts: PostAnalisado[], quantas = 12): HashtagDesempenho[] {
  const mapa = new Map<string, PostAnalisado[]>()
  for (const p of posts) {
    for (const tag of new Set((p.legenda.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()))) mapa.set(tag, [...(mapa.get(tag) ?? []), p])
  }
  return Array.from(mapa, ([tag, ps]) => ({
    tag,
    posts: ps.length,
    alcanceMedio: Math.round(media(ps.filter((p) => p.alcance).map((p) => p.alcance as number))),
    taxaEngajamentoMedia: arred(media(ps.map((p) => p.taxaEngajamento).filter((t): t is number => t !== null))),
  })).sort((a, b) => b.posts - a.posts || b.taxaEngajamentoMedia - a.taxaEngajamentoMedia).slice(0, quantas)
}

export type CelulaCalor = { dia: number; faixa: number; posts: number; taxa: number | null }
export const NOMES_DIAS = DIAS
export const NOMES_FAIXAS = ["Madrugada", "Manhã", "Tarde", "Noite"]

/** Matriz dia da semana × faixa do dia com o engajamento médio (null onde não houve post). */
export function mapaCalor(posts: PostAnalisado[]): CelulaCalor[] {
  const celulas = new Map<string, PostAnalisado[]>()
  for (const p of posts) {
    const { diaSemana, hora } = partesBRT(p.publicadoEm)
    const k = `${diaSemana}|${Math.floor(hora / 6)}`
    celulas.set(k, [...(celulas.get(k) ?? []), p])
  }
  const out: CelulaCalor[] = []
  for (let dia = 0; dia < 7; dia++) for (let faixa = 0; faixa < 4; faixa++) {
    const ps = celulas.get(`${dia}|${faixa}`) ?? []
    const taxas = ps.map((p) => p.taxaEngajamento).filter((t): t is number => t !== null)
    out.push({ dia, faixa, posts: ps.length, taxa: taxas.length ? arred(media(taxas)) : null })
  }
  return out
}
