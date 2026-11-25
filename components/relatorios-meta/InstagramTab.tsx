"use client"
import { useCallback, useEffect, useState } from "react"
import { ExternalLink, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, Select } from "@/components/ui/primitives"
import { api, inteiro, Kpi, pct, Tabela, TextoIA } from "./util"

type Post = { id: string; permalink: string; legenda: string; miniatura: string | null; formato: string; publicadoEm: string; curtidas: number; comentarios: number; alcance: number | null; salvamentos: number; compartilhamentos: number; interacoes: number; taxaEngajamento: number | null }
type Grupo = { rotulo: string; posts: number; alcanceMedio: number; taxaEngajamentoMedia: number }
type Dados = {
  conta: { igId: string; username: string; seguidores: number }
  periodo: { since: string; until: string; dias: number }
  analise: { resumo: Record<string, number>; porFormato: Grupo[]; porDiaSemana: Grupo[]; porFaixaHorario: Grupo[]; melhores: Post[]; piores: Post[] }
  insights: { alcance: number | null; visualizacoes: number | null; visitasPerfil: number | null; contasEngajadas: number | null; novosSeguidores: number | null }
  lista: Post[]
}
type Conta = { igId: string; username: string; seguidores: number }

const PermissaoFaltando = ({ faltando, erro }: { faltando: string[] | null; erro?: string }) => (
  <Card>
    <CardContent className="flex flex-col gap-3 py-6">
      <p className="font-semibold">Falta conectar o Instagram</p>
      <p className="text-sm text-muted-foreground">{erro || "O acesso da Meta que o CRM usa hoje é só de anúncios."} Reconecte a Meta para liberar o Instagram (você será levado ao login da Meta e volta para o CRM).</p>
      {faltando && faltando.length > 0 && <p className="text-xs text-muted-foreground">Permissões que faltam: <code>{faltando.join(", ")}</code></p>}
      <ul className="list-disc pl-5 text-xs text-muted-foreground">
        <li>O Instagram precisa ser <b>Profissional</b> (Comercial ou Criador) e estar ligado a uma <b>Página do Facebook</b>.</li>
        <li>Na tela da Meta, marque a Página e a conta do Instagram quando ela pedir.</li>
      </ul>
      <div><a href="/api/meta/oauth/start" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Reconectar com a Meta</a></div>
    </CardContent>
  </Card>
)

const Grupos = ({ titulo, g }: { titulo: string; g: Grupo[] }) => (
  <div className="flex flex-col gap-1.5"><h4 className="text-sm font-semibold">{titulo}</h4>
    <Tabela colunas={["", "Posts", "Alcance médio", "Engajamento"]} linhas={g.map((x) => [x.rotulo, x.posts, inteiro(x.alcanceMedio), pct(x.taxaEngajamentoMedia)])} />
  </div>
)

const PostCard = ({ p }: { p: Post }) => (
  <a href={p.permalink} target="_blank" rel="noreferrer" className="flex gap-3 rounded-lg border border-border p-2 hover:bg-muted/40">
    {p.miniatura ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.miniatura} alt="" className="size-16 shrink-0 rounded object-cover" /> : <div className="size-16 shrink-0 rounded bg-muted" />}
    <div className="min-w-0 flex-1 text-xs">
      <p className="flex items-center gap-1 font-semibold">{p.formato} · {new Date(p.publicadoEm).toLocaleDateString("pt-BR")}<ExternalLink className="size-3 text-muted-foreground" /></p>
      <p className="line-clamp-2 text-muted-foreground">{p.legenda || "(sem legenda)"}</p>
      <p className="mt-0.5">Engajamento <b>{pct(p.taxaEngajamento)}</b> · alcance {inteiro(p.alcance)} · ❤ {inteiro(p.curtidas)} · 💬 {inteiro(p.comentarios)} · 🔖 {inteiro(p.salvamentos)} · ↗ {inteiro(p.compartilhamentos)}</p>
    </div>
  </a>
)

/** Instagram: posts, desempenho por formato/dia/horário, ranking e análise da IA. */
export function InstagramTab() {
  const [contas, setContas] = useState<Conta[]>([])
  const [conta, setConta] = useState("")
  const [dias, setDias] = useState("30")
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<{ msg: string; faltando: string[] | null; perm: boolean } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [analise, setAnalise] = useState<string | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [erroIA, setErroIA] = useState("")

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null); setAnalise(null)
    const c = await api("/api/instagram/contas")
    if (!c.ok || !(c.contas ?? []).length) {
      setErro({ msg: c.erro || c.aviso || "Nenhuma conta do Instagram encontrada.", faltando: c.permissoesFaltando ?? null, perm: !!c.faltaPermissao || (c.permissoesFaltando ?? []).length > 0 || !c.conectado })
      setCarregando(false); return
    }
    setContas(c.contas)
    const id = conta || c.contas[0].igId
    setConta(id)
    const r = await api(`/api/instagram/posts?conta=${encodeURIComponent(id)}&dias=${dias}`)
    if (r.ok) setDados(r as unknown as Dados); else setErro({ msg: r.erro || "Falha ao carregar os posts.", faltando: null, perm: /permission|permiss/i.test(r.erro ?? "") })
    setCarregando(false)
  }, [conta, dias])
  useEffect(() => { void carregar() }, [dias]) // eslint-disable-line react-hooks/exhaustive-deps

  async function gerarAnalise() {
    setAnalisando(true); setErroIA("")
    const r = await api("/api/instagram/analise", "POST", { conta, dias: Number(dias) })
    if (r.ok) setAnalise(r.texto); else setErroIA(r.erro || "Falha ao gerar a análise")
    setAnalisando(false)
  }

  if (carregando) return <p className="py-10 text-center text-muted-foreground">Carregando dados do Instagram…</p>
  if (erro) return erro.perm ? <PermissaoFaltando faltando={erro.faltando} erro={erro.msg} /> : <Card><CardContent className="py-6 text-sm text-destructive">{erro.msg}</CardContent></Card>
  if (!dados) return null
  const r = dados.analise.resumo
  const i = dados.insights

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {contas.length > 1 && <Select value={conta} onChange={(e) => setConta(e.target.value)} className="h-9 w-auto" aria-label="Conta">{contas.map((c) => <option key={c.igId} value={c.igId}>@{c.username}</option>)}</Select>}
        <Select value={dias} onChange={(e) => setDias(e.target.value)} className="h-9 w-auto" aria-label="Período">{["7", "30", "60", "90"].map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}</Select>
        <span className="text-sm text-muted-foreground">@{dados.conta.username} · {inteiro(dados.conta.seguidores)} seguidores</span>
        <Button className="ml-auto" onClick={gerarAnalise} disabled={analisando}><Sparkles className="size-4" />{analisando ? "Analisando…" : "Analisar com IA"}</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Posts publicados" valor={`${r.totalPosts} (${r.postsPorSemana}/sem.)`} />
        <Kpi rotulo="Alcance (conta)" valor={inteiro(i.alcance)} />
        <Kpi rotulo="Engajamento médio por post" valor={pct(r.taxaEngajamentoMedia)} />
        <Kpi rotulo="Novos seguidores" valor={i.novosSeguidores == null ? "—" : (i.novosSeguidores > 0 ? "+" : "") + inteiro(i.novosSeguidores)} />
        <Kpi rotulo="Visualizações" valor={inteiro(i.visualizacoes)} />
        <Kpi rotulo="Visitas ao perfil" valor={inteiro(i.visitasPerfil)} />
        <Kpi rotulo="Salvamentos + compartilhamentos" valor={inteiro(r.salvamentos + r.compartilhamentos)} />
        <Kpi rotulo="Interações nos posts" valor={inteiro(r.interacoesTotal)} />
      </div>

      {(analise || erroIA) && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-primary" />Análise da IA</CardTitle></CardHeader>
          <CardContent>{erroIA ? <p className="text-sm text-destructive">{erroIA}</p> : <TextoIA texto={analise!} />}</CardContent></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Grupos titulo="Por formato" g={dados.analise.porFormato} />
        <Grupos titulo="Por dia da semana" g={dados.analise.porDiaSemana} />
        <Grupos titulo="Por horário" g={dados.analise.porFaixaHorario} />
      </div>
      <p className="text-xs text-muted-foreground">Engajamento = (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance do post. Horários em Brasília. Amostras pequenas indicam tendência, não regra.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2"><h4 className="text-sm font-semibold">Melhores posts</h4>{dados.analise.melhores.length ? dados.analise.melhores.map((p) => <PostCard key={p.id} p={p} />) : <p className="text-sm text-muted-foreground">Sem posts no período.</p>}</div>
        <div className="flex flex-col gap-2"><h4 className="text-sm font-semibold">Posts com menor desempenho</h4>{dados.analise.piores.length ? dados.analise.piores.map((p) => <PostCard key={p.id} p={p} />) : <p className="text-sm text-muted-foreground">Sem posts suficientes para comparar.</p>}</div>
      </div>
    </div>
  )
}
