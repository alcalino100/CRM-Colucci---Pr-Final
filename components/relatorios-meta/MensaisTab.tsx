"use client"
import { useCallback, useEffect, useState } from "react"
import { Printer, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, useToast } from "@/components/ui/primitives"
import { ResultadoCampanhas } from "./CampanhasTab"
import { api, dataBR, inteiro, Kpi, nomeMes, pct, Tabela, TextoIA } from "./util"

type Item = { id: string; tipo: "instagram" | "campanhas"; mes: string; gerado_em: string; gerado_por: string | null }
type Completo = Item & { dados: any; analise: string | null }

const mesPassado = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` }

function RelatorioInstagram({ d }: { d: any }) {
  const r = d.analise?.resumo ?? {}
  const c = d.comparativo
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Posts publicados" valor={inteiro(r.totalPosts)} variacao={c?.posts} />
        <Kpi rotulo="Alcance dos posts" valor={inteiro(r.alcanceTotal)} variacao={c?.alcance} />
        <Kpi rotulo="Interações" valor={inteiro(r.interacoesTotal)} variacao={c?.interacoes} />
        <Kpi rotulo="Engajamento médio" valor={pct(r.taxaEngajamentoMedia)} variacao={c?.engajamento} />
        <Kpi rotulo="Novos seguidores" valor={d.insights?.novosSeguidores == null ? "—" : inteiro(d.insights.novosSeguidores)} />
        <Kpi rotulo="Alcance da conta" valor={inteiro(d.insights?.alcance)} />
        <Kpi rotulo="Visitas ao perfil" valor={inteiro(d.insights?.visitasPerfil)} />
        <Kpi rotulo="Salvamentos + compartilh." valor={inteiro((r.salvamentos ?? 0) + (r.compartilhamentos ?? 0))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5"><h4 className="text-sm font-semibold">Por formato</h4><Tabela colunas={["", "Posts", "Alcance médio", "Engajamento"]} linhas={(d.analise?.porFormato ?? []).map((x: any) => [x.rotulo, x.posts, inteiro(x.alcanceMedio), pct(x.taxaEngajamentoMedia)])} /></div>
        <div className="flex flex-col gap-1.5"><h4 className="text-sm font-semibold">Melhores posts do mês</h4>
          <Tabela colunas={["Post", "Formato", "Engaj."]} linhas={(d.analise?.melhores ?? []).map((p: any) => [<a key="l" href={p.permalink} target="_blank" rel="noreferrer" className="underline">{(p.legenda || "(sem legenda)").slice(0, 50)}</a>, p.formato, pct(p.taxaEngajamento)])} /></div>
      </div>
    </div>
  )
}

/** Relatórios mensais: histórico guardado, geração sob demanda e visualização/impressão (PDF pelo navegador). */
export function MensaisTab() {
  const toast = useToast()
  const [itens, setItens] = useState<Item[]>([])
  const [aviso, setAviso] = useState("")
  const [aberto, setAberto] = useState<Completo | null>(null)
  const [tipo, setTipo] = useState("campanhas")
  const [mes, setMes] = useState(mesPassado())
  const [gerando, setGerando] = useState(false)

  const carregar = useCallback(async () => {
    const r = await api("/api/meta/relatorios")
    setItens(r.relatorios ?? []); setAviso(r.aviso ?? "")
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  async function abrir(id: string) {
    const r = await api(`/api/meta/relatorios?id=${encodeURIComponent(id)}`)
    if (r.ok) setAberto(r.relatorio); else toast(r.erro || "Não foi possível abrir", "error")
  }
  async function gerar() {
    setGerando(true)
    const r = await api("/api/meta/relatorios", "POST", { tipo, mes })
    setGerando(false)
    if (!r.ok) return toast(r.erro || "Falha ao gerar o relatório", "error")
    toast(r.aviso || "Relatório gerado.", r.aviso ? "error" : undefined)
    await carregar()
  }

  if (aberto) {
    return (
      <div className="flex flex-col gap-4 print:gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Button variant="outline" onClick={() => setAberto(null)}>← Voltar ao histórico</Button>
          <Button onClick={() => window.print()}><Printer className="size-4" />Imprimir / salvar em PDF</Button>
        </div>
        <div>
          <h2 className="text-xl font-bold capitalize">Relatório mensal de {aberto.tipo === "instagram" ? "Instagram" : "campanhas"} — {nomeMes(aberto.mes)}</h2>
          <p className="text-xs text-muted-foreground">Gerado em {new Date(aberto.gerado_em).toLocaleString("pt-BR")}{aberto.dados?.periodo ? ` · período ${dataBR(aberto.dados.periodo.since)} a ${dataBR(aberto.dados.periodo.until)}` : ""}</p>
        </div>
        {aberto.analise && <Card><CardHeader><CardTitle className="text-base">Análise e recomendações</CardTitle></CardHeader><CardContent><TextoIA texto={aberto.analise} /></CardContent></Card>}
        {aberto.tipo === "campanhas" ? <ResultadoCampanhas d={aberto.dados} /> : <RelatorioInstagram d={aberto.dados} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Gerar relatório</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1"><Label htmlFor="r-tipo">Relatório</Label><Select id="r-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 w-auto"><option value="campanhas">Campanhas (Meta Ads × CRM)</option><option value="instagram">Instagram</option></Select></div>
          <div className="flex flex-col gap-1"><Label htmlFor="r-mes">Mês</Label><Input id="r-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="h-9" /></div>
          <Button onClick={gerar} disabled={gerando || !mes}>{gerando ? "Gerando… (até 1 min)" : "Gerar agora"}</Button>
          <p className="basis-full text-xs text-muted-foreground">Todo dia 1º o CRM gera sozinho os relatórios do mês que fechou. Gerar de novo substitui o mês escolhido.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Histórico</CardTitle><Button size="sm" variant="outline" onClick={carregar} aria-label="Atualizar"><RefreshCw className="size-3.5" /></Button></CardHeader>
        <CardContent>
          {aviso && <p className="mb-2 text-xs text-amber-700">{aviso}</p>}
          {itens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum relatório ainda.</p> : (
            <ul className="divide-y divide-border">
              {itens.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2 text-sm"><Badge variant={i.tipo === "instagram" ? "violet" : "blue"}>{i.tipo === "instagram" ? "Instagram" : "Campanhas"}</Badge><span className="font-medium capitalize">{nomeMes(i.mes)}</span><span className="text-xs text-muted-foreground">gerado em {new Date(i.gerado_em).toLocaleDateString("pt-BR")}{i.gerado_por === "cron" ? " (automático)" : ""}</span></span>
                  <Button size="sm" variant="outline" onClick={() => abrir(i.id)}>Abrir</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
