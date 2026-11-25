export type Post = {
  id: string; permalink: string; legenda: string; miniatura: string | null; formato: string; publicadoEm: string
  curtidas: number; comentarios: number; alcance: number | null; salvamentos: number; compartilhamentos: number
  visualizacoes: number | null; tempoMedioSeg?: number | null; interacoes: number; taxaEngajamento: number | null
}
export type Grupo = { rotulo: string; posts: number; alcanceMedio: number; taxaEngajamentoMedia: number }
export type Conta = { igId: string; username: string; nome: string | null; biografia: string | null; seguidores: number; seguindo: number; midias: number; foto: string | null; paginaNome: string }
export type Insights = { alcance: number | null; visualizacoes: number | null; visitasPerfil: number | null; contasEngajadas: number | null; interacoes: number | null; novosSeguidores: number | null }
export type DadosInstagram = {
  conta: Conta
  periodo: { since: string; until: string; dias: number }
  analise: {
    resumo: Record<string, number>
    porFormato: Grupo[]; porDiaSemana: Grupo[]; porFaixaHorario: Grupo[]
    melhores: Post[]; piores: Post[]
    hashtags: { tag: string; posts: number; alcanceMedio: number; taxaEngajamentoMedia: number }[]
    mapaCalor: { dia: number; faixa: number; posts: number; taxa: number | null }[]
  }
  insights: Insights
  comparativo: Record<string, number | null> | null
  anterior: { periodo: { since: string; until: string }; resumo: Record<string, number> } | null
  serie: { data: string; alcance: number | null; novosSeguidores: number | null }[]
  demografia: { faixasEtarias: { rotulo: string; valor: number }[]; generos: { rotulo: string; valor: number }[]; cidades: { rotulo: string; valor: number }[] } | null
  stories: { id: string; permalink: string; miniatura: string | null; publicadoEm: string; alcance: number | null; respostas: number | null; visualizacoes: number | null }[]
  lista: Post[]
}

export const COR_FORMATO: Record<string, string> = { Reels: "#dc2626", Carrossel: "#7c3aed", Imagem: "#0284c7", Vídeo: "#d97706", Outro: "#64748b" }
