"use client"
import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { api, brl, dataBR, inteiro, Kpi, Tabela, TextoIA } from "./util"

export type CampanhaClass = { campaignId: string; campaignName: string; spend: number; metaResults: number; crmLeads: number; visitas: number; fechamentos: number; vgvFechado: number; cplReal: number | null; roas: number; acao: string; motivo: string }
export type DadosCampanhas = {
  periodo: { since: string; until: string }
  totais: { gastoTotalMeta: number; leadsReaisNoCrm: number; leadsReportadosMeta: number; visitas: number; fechamentos: number; vgv: number; comissao: number; cplReal: number; cacReal: number }
  comparativo: { gasto: number | null; leads: number | null; cplReal: number | null; fechamentos: number | null; vgv: number | null } | null
  campanhas: CampanhaClass[]
}

const COR: Record<string, string> = { escalar: "green", manter: "blue", otimizar: "amber", pausar: "red", sem_dados: "gray" }
const ROTULO: Record<string, string> = { escalar: "Escalar", manter: "Manter", otimizar: "Otimizar", pausar: "Pausar/revisar", sem_dados: "Poucos dados" }
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Resultado da análise (usado na aba Campanhas e na visualização do relatório mensal). */
export function ResultadoCampanhas({ d }: { d: DadosCampanhas }) {
  const t = d.totais
  const c = d.comparativo
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Investimento" valor={brl(t.gastoTotalMeta)} variacao={c?.gasto} />
        <Kpi rotulo="Leads no CRM" valor={inteiro(t.leadsReaisNoCrm)} variacao={c?.leads} />
        <Kpi rotulo="Custo por lead real" valor={brl(t.cplReal)} variacao={c?.cplReal} menorMelhor />
        <Kpi rotulo="Fechamentos" valor={inteiro(t.fechamentos)} variacao={c?.fechamentos} />
        <Kpi rotulo="Resultados reportados pela Meta" valor={inteiro(t.leadsReportadosMeta)} />
        <Kpi rotulo="Visitas" valor={inteiro(t.visitas)} />
        <Kpi rotulo="VGV fechado" valor={brl(t.vgv)} variacao={c?.vgv} />
        <Kpi rotulo="Comissão gerada" valor={brl(t.comissao)} />
      </div>
      <Tabela
        colunas={["Campanha", "Investimento", "Leads CRM", "CPL real", "Visitas", "Fech.", "Retorno", "Ação sugerida"]}
        linhas={d.campanhas.map((x) => [
          <span key="n" className="font-medium">{x.campaignName}</span>, brl(x.spend), inteiro(x.crmLeads), brl(x.cplReal), inteiro(x.visitas), inteiro(x.fechamentos), `${x.roas.toFixed(1)}x`,
          <div key="a" className="flex flex-col gap-1"><Badge variant={COR[x.acao]}>{ROTULO[x.acao]}</Badge><span className="max-w-xs text-xs text-muted-foreground">{x.motivo}</span></div>,
        ])}
      />
      <p className="text-xs text-muted-foreground">Retorno = comissão gerada ÷ investimento. “Ação sugerida” vem de regras objetivas sobre os números do período; a análise da IA aprofunda e questiona essas conclusões.</p>
    </div>
  )
}

/** Campanhas: números reconciliados Meta × CRM, comparação com o período anterior e análise da IA. */
export function CampanhasTab() {
  const hoje = new Date()
  const [modo, setModo] = useState("30")
  const [desde, setDesde] = useState(iso(new Date(Date.now() - 29 * 864e5)))
  const [ate, setAte] = useState(iso(hoje))
  const [dados, setDados] = useState<(DadosCampanhas & { analiseIA?: string | null; erroIA?: string | null }) | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")

  function periodo(): { since: string; until: string } {
    if (modo === "custom") return { since: desde, until: ate }
    if (modo === "mes") return { since: iso(new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1))), until: iso(hoje) }
    if (modo === "mes_passado") return { since: iso(new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - 1, 1))), until: iso(new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 0))) }
    return { since: iso(new Date(Date.now() - (Number(modo) - 1) * 864e5)), until: iso(hoje) }
  }

  async function analisar(ia: boolean) {
    setCarregando(true); setErro("")
    const r = await api("/api/meta/analise-campanhas", "POST", { ...periodo(), ia })
    if (r.ok) setDados(r as any); else setErro(r.erro || "Falha na análise")
    setCarregando(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1"><Label htmlFor="c-per">Período</Label>
          <Select id="c-per" value={modo} onChange={(e) => setModo(e.target.value)} className="h-9 w-auto">
            <option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option>
            <option value="mes">Mês atual</option><option value="mes_passado">Mês passado</option><option value="custom">Personalizado</option>
          </Select></div>
        {modo === "custom" && <>
          <div className="flex flex-col gap-1"><Label htmlFor="c-de">De</Label><Input id="c-de" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9" /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="c-ate">Até</Label><Input id="c-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9" /></div>
        </>}
        <Button variant="outline" onClick={() => analisar(false)} disabled={carregando}>{carregando ? "Carregando…" : "Ver números"}</Button>
        <Button onClick={() => analisar(true)} disabled={carregando}><Sparkles className="size-4" />Analisar com IA</Button>
      </div>
      {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-muted-foreground">Escolha o período e clique em “Ver números” ou “Analisar com IA”. Os valores cruzam o que a Meta cobrou com os leads, visitas e vendas reais do CRM.</p>}
      {dados && (
        <>
          <p className="text-sm text-muted-foreground">Período: {dataBR(dados.periodo.since)} a {dataBR(dados.periodo.until)}</p>
          {(dados.analiseIA || dados.erroIA) && (
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-primary" />Análise da IA</CardTitle></CardHeader>
              <CardContent>{dados.erroIA ? <p className="text-sm text-destructive">{dados.erroIA}</p> : <TextoIA texto={dados.analiseIA!} />}</CardContent></Card>
          )}
          <ResultadoCampanhas d={dados} />
        </>
      )}
    </div>
  )
}
