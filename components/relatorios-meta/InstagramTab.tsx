"use client"
import { useCallback, useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { api, TextoIA } from "./util"
import { Indicadores } from "./instagram/Cartoes"
import { GraficoPosts, GraficoSerie, MapaCalor, PainelFormatos } from "./instagram/Graficos"
import { Perfil } from "./instagram/Perfil"
import { Publicacoes } from "./instagram/Publicacoes"
import { Publico } from "./instagram/Publico"
import type { Conta, DadosInstagram } from "./instagram/types"

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

const Esqueleto = () => (
  <div className="flex animate-pulse flex-col gap-4">
    <div className="h-48 rounded-2xl bg-muted" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-24 rounded-xl bg-muted" />)}</div>
    <div className="grid gap-4 lg:grid-cols-2"><div className="h-72 rounded-xl bg-muted" /><div className="h-72 rounded-xl bg-muted" /></div>
    <p className="text-center text-xs text-muted-foreground">Buscando posts e métricas na Meta… isso pode levar até 30 segundos na primeira vez.</p>
  </div>
)

/** Instagram: painel completo (perfil, indicadores com variação, gráficos, mapa de calor, público, hashtags, stories e galeria de posts). */
export function InstagramTab() {
  const [contas, setContas] = useState<Conta[]>([])
  const [conta, setConta] = useState("")
  const [dias, setDias] = useState("30")
  const [dados, setDados] = useState<DadosInstagram | null>(null)
  const [erro, setErro] = useState<{ msg: string; faltando: string[] | null; perm: boolean } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [analise, setAnalise] = useState<string | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [erroIA, setErroIA] = useState("")

  const carregar = useCallback(async (fresco = false) => {
    setCarregando(true); setErro(null); setAnalise(null); setErroIA("")
    const c = await api("/api/instagram/contas")
    if (!c.ok || !(c.contas ?? []).length) {
      setErro({ msg: c.erro || c.aviso || "Nenhuma conta do Instagram encontrada.", faltando: c.permissoesFaltando ?? null, perm: !!c.faltaPermissao || (c.permissoesFaltando ?? []).length > 0 || !c.conectado })
      setCarregando(false); return
    }
    setContas(c.contas)
    const id = conta || c.contas[0].igId
    setConta(id)
    const r = await api(`/api/instagram/posts?conta=${encodeURIComponent(id)}&dias=${dias}${fresco ? "&fresco=1" : ""}`)
    if (r.ok) setDados(r as unknown as DadosInstagram); else setErro({ msg: r.erro || "Falha ao carregar os posts.", faltando: null, perm: /permission|permiss/i.test(r.erro ?? "") })
    setCarregando(false)
  }, [conta, dias])
  useEffect(() => { void carregar() }, [dias, conta]) // eslint-disable-line react-hooks/exhaustive-deps

  async function gerarAnalise() {
    setAnalisando(true); setErroIA("")
    const r = await api("/api/instagram/analise", "POST", { conta, dias: Number(dias) })
    if (r.ok) setAnalise(r.texto); else setErroIA(r.erro || "Falha ao gerar a análise")
    setAnalisando(false)
  }

  if (carregando && !dados) return <Esqueleto />
  if (erro) return erro.perm ? <PermissaoFaltando faltando={erro.faltando} erro={erro.msg} /> : <Card><CardContent className="py-6 text-sm text-destructive">{erro.msg}</CardContent></Card>
  if (!dados) return null

  return (
    <div className={carregando ? "flex flex-col gap-5 opacity-60 transition" : "flex flex-col gap-5 transition"}>
      <Perfil d={dados} contas={contas} conta={conta} setConta={setConta} dias={dias} setDias={setDias} aoAnalisar={gerarAnalise} analisando={analisando} aoAtualizar={() => carregar(true)} />

      {(analise || erroIA) && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-primary" />Análise da IA</CardTitle></CardHeader>
          <CardContent>{erroIA ? <p className="text-sm text-destructive">{erroIA}</p> : <TextoIA texto={analise!} />}</CardContent>
        </Card>
      )}

      <Indicadores d={dados} />

      <div className="grid gap-4 xl:grid-cols-2"><GraficoSerie d={dados} /><GraficoPosts d={dados} /></div>
      <div className="grid gap-4 xl:grid-cols-2"><PainelFormatos d={dados} /><MapaCalor d={dados} /></div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">Publicações do período <span className="text-sm font-normal text-muted-foreground">({dados.lista.length})</span></h3>
          {dados.lista.length === 0 && <Button size="sm" variant="outline" onClick={() => setDias("90")}>Ver últimos 90 dias</Button>}
        </div>
        <Publicacoes posts={dados.lista} melhores={dados.analise.melhores} />
      </section>

      <Publico d={dados} />
      <p className="text-xs text-muted-foreground">Engajamento = (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance do post. Horários em Brasília. A API do Instagram não inclui posts de colaboração antigos nem stories já expirados. Amostras pequenas indicam tendência, não regra.</p>
    </div>
  )
}
