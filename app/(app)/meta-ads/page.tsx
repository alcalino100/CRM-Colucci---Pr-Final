"use client"

// Meta Ads — visão gerencial (somente gestores, read-only).
// Drill-down: Conta > Campanha > Conjunto > Anúncio > Criativo, com KPIs comparativos,
// gráficos, tabela detalhada e cruzamento com leads reais do CRM.

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Plug,
  Link2,
  Sparkles,
  BarChart3,
  ShieldCheck,
  FileText,
  Cpu,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeVendas } from "@/lib/roles"
import { useLeads } from "@/lib/leads-store"
import { Badge, Card, CardContent } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import MetaAiChat from "@/components/meta-ai-chat"
import AuditReconciliation from "@/components/meta-ads/audit-reconciliation"
import AttributionAudit from "@/components/meta-ads/attribution-audit"
import ExecutiveReport from "@/components/meta-ads/executive-report"
import McpIntegrationPanel from "@/components/meta-ads/mcp-integration-panel"
import { calcularReconciliacao, extrairResultadosMeta } from "@/lib/meta/reconciliation"

import {
  fetcher,
  toBrasiliaIso,
  type Nivel,
  FILHO,
  PRESETS,
  rangeFor,
  periodoAnterior,
  agrega,
} from "@/lib/meta-ads-utils"
import { OrcamentoPanel } from "@/components/meta-ads/OrcamentoPanel"
import { MetaAdsFilterBar } from "@/components/meta-ads/MetaAdsFilterBar"
import { MetaAdsGeralTab } from "@/components/meta-ads/MetaAdsGeralTab"
import { Aviso } from "@/components/meta-ads/MetaAdsUiAtoms"

export default function MetaAdsPage() {
  const { user } = useAuth()
  if (user && (!isGestorNivel(user.role) || !podeVendas(user.role))) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Acesso restrito a gestores.
        </CardContent>
      </Card>
    )
  }
  return <MetaAdsDashboard />
}

function MetaAdsDashboard() {
  const { leads, visits, userName } = useLeads()
  const [abaAtiva, setAbaAtiva] = useState<"geral" | "auditoria" | "orfaos" | "relatorio" | "mcp">(
    "auditoria"
  )
  const [preset, setPreset] = useState("30d")
  const [cSince, setCSince] = useState(toBrasiliaIso(new Date(Date.now() - 29 * 864e5)))
  const [cUntil, setCUntil] = useState(toBrasiliaIso(new Date()))
  const [comparar, setComparar] = useState(true)

  // trilha do drill-down: [{nivel, id, nome, creativeId?}]
  const [trilha, setTrilha] = useState<
    { nivel: Nivel; id: string; nome: string; creativeId?: string; status?: string }[]
  >([])

  const { since, until } = rangeFor(preset, cSince, cUntil)
  const prev = periodoAnterior(since, until)

  const { data: status } = useSWR("/api/meta?op=status", fetcher, { refreshInterval: 120_000 })
  const { data: contas, error: errContas } = useSWR("/api/meta?op=accounts", fetcher)
  const [contaId, setContaId] = useState("")
  const conta = useMemo(() => {
    const list = contas?.data ?? []
    return list.find((c: any) => c.id === contaId) ?? list[0]
  }, [contas, contaId])

  // ---- todas as campanhas da conta para reconciliação e auditoria global ----
  const { data: todasCampanhas } = useSWR(
    conta?.id ? `/api/meta?op=campaigns&account=${conta.id}` : null,
    fetcher
  )
  const { data: insCampanhasGerais } = useSWR(
    conta?.id
      ? `/api/meta?op=insights&node=${conta.id}&level=campaign&since=${since}&until=${until}`
      : null,
    fetcher
  )

  const dadosReconciliacao = useMemo(() => {
    const camps = todasCampanhas?.data ?? []
    const ins = insCampanhasGerais?.data ?? []
    return calcularReconciliacao(camps, ins, leads, visits, userName, { since, until })
  }, [todasCampanhas, insCampanhasGerais, leads, visits, userName, since, until])

  const listaCampanhas = useMemo(() => {
    return (todasCampanhas?.data ?? []).map((c: any) => ({
      id: String(c.id),
      name: c.name || String(c.id),
    }))
  }, [todasCampanhas])

  const periodoLabel =
    PRESETS.find((p) => p.id === preset)?.label ||
    `${since.split("-").reverse().join("/")} até ${until.split("-").reverse().join("/")}`

  // Nó selecionado (último da trilha, ou a conta)
  const selecionado =
    trilha[trilha.length - 1] ??
    (conta ? { nivel: "account" as Nivel, id: conta.id, nome: conta.name } : null)
  const nivelFilho = selecionado ? FILHO[selecionado.nivel] : null

  // ---- dados do nível filho (lista de linhas da tabela / drill) ----
  const filhosKey =
    selecionado && nivelFilho
      ? nivelFilho === "campaign"
        ? `/api/meta?op=campaigns&account=${selecionado.id}`
        : nivelFilho === "adset"
        ? `/api/meta?op=adsets&campaign=${selecionado.id}`
        : `/api/meta?op=ads&adset=${selecionado.id}`
      : null
  const { data: filhos, error: errFilhos, isLoading: loadFilhos } = useSWR(filhosKey, fetcher)

  // ---- insights agregados do nó selecionado (KPIs) + período anterior ----
  const insKey = selecionado
    ? `/api/meta?op=insights&node=${selecionado.id}&since=${since}&until=${until}`
    : null
  const { data: insAtual, error: errIns, isLoading: loadIns } = useSWR(insKey, fetcher)
  const { data: insPrev } = useSWR(
    comparar && selecionado
      ? `/api/meta?op=insights&node=${selecionado.id}&since=${prev.since}&until=${prev.until}`
      : null,
    fetcher
  )

  // ---- série diária (gráfico de linha) ----
  const { data: insDiario } = useSWR(
    selecionado
      ? `/api/meta?op=insights&node=${selecionado.id}&since=${since}&until=${until}&daily=1`
      : null,
    fetcher
  )

  // ---- insights por filho (gráfico de barras + tabela) ----
  const { data: insFilhos } = useSWR(
    selecionado && nivelFilho
      ? `/api/meta?op=insights&node=${selecionado.id}&level=${nivelFilho}&since=${since}&until=${until}`
      : null,
    fetcher
  )

  const kpi = useMemo(() => agrega(insAtual?.data ?? []), [insAtual])
  const kpiPrev = useMemo(() => agrega(insPrev?.data ?? []), [insPrev])

  const serie = useMemo(() => {
    const porDia = new Map<string, { gasto: number; resultados: number }>()
    for (const r of insDiario?.data ?? []) {
      const cur = porDia.get(r.date_start) ?? { gasto: 0, resultados: 0 }
      cur.gasto += Number(r.spend || 0)
      cur.resultados += extrairResultadosMeta(r)
      porDia.set(r.date_start, cur)
    }
    return [...porDia.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({
        dia: d.slice(5).split("-").reverse().join("/"),
        gasto: Number(v.gasto.toFixed(2)),
        resultados: v.resultados,
      }))
  }, [insDiario])

  // Mapa de insights por id do filho
  const insPorFilho = useMemo(() => {
    const m = new Map<string, any>()
    const keyField =
      nivelFilho === "campaign" ? "campaign_id" : nivelFilho === "adset" ? "adset_id" : "ad_id"
    for (const r of insFilhos?.data ?? []) m.set(r[keyField], r)
    return m
  }, [insFilhos, nivelFilho])

  // ---- cruzamento CRM: leads reais por campanha ----
  const leadsPorCampanha = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) {
      if (l.origem === "Tráfego Pago" && l.metaCampaignId) {
        m.set(l.metaCampaignId, (m.get(l.metaCampaignId) ?? 0) + 1)
      }
    }
    return m
  }, [leads])

  const barras = useMemo(
    () =>
      (filhos?.data ?? [])
        .map((f: any) => {
          const i = insPorFilho.get(f.id)
          return {
            nome: f.name.length > 22 ? f.name.slice(0, 22) + "…" : f.name,
            gasto: Number(Number(i?.spend ?? 0).toFixed(2)),
            resultados: i ? extrairResultadosMeta(i) : 0,
          }
        })
        .filter((b: any) => b.gasto > 0 || b.resultados > 0),
    [filhos, insPorFilho]
  )

  const tokenExpirado = errIns?.expired || errFilhos?.expired || errContas?.expired
  const modoMock = status?.source === "mock"

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <Sparkles className="size-3.5" /> Gestão de tráfego
            </span>
            <h1 className="mt-2.5 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="text-foreground">Meta Ads</span>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
              Performance das campanhas com dados da Meta Graph API e leads reais do CRM.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status && (
              <Badge
                variant={status.connected ? "green" : "amber"}
                className="gap-1.5 px-3 py-1.5 shadow-sm"
              >
                <span className="relative flex size-2">
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full animate-ping rounded-full opacity-70",
                      status.connected ? "bg-emerald-400" : "bg-amber-400"
                    )}
                  />
                  <span
                    className={cn(
                      "relative inline-flex size-2 rounded-full",
                      status.connected ? "bg-emerald-500" : "bg-amber-500"
                    )}
                  />
                </span>
                <Plug className="size-3" />
                {status.connected
                  ? status.source === "env"
                    ? "Conectado (token)"
                    : "Conectado"
                  : "Modo demonstração"}
              </Badge>
            )}
            {!status?.connected && (
              <a
                href="/api/meta/oauth/start"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                <Link2 className="size-4" /> Conectar Meta Business
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Subnavegação das Abas de Tráfego e Inteligência */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => setAbaAtiva("auditoria")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all shadow-sm",
            abaAtiva === "auditoria"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <ShieldCheck className="size-4" />
          <span>Auditoria & Reconciliação (Meta × CRM)</span>
          {dadosReconciliacao.totais.fechamentosTotal > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              ROAS {dadosReconciliacao.totais.roasComissaoGeral.toFixed(1)}x
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("geral")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all shadow-sm",
            abaAtiva === "geral"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <BarChart3 className="size-4" />
          <span>Visão Geral & Drill-down</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("orfaos")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all shadow-sm",
            abaAtiva === "orfaos"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Link2 className="size-4" />
          <span>Leads Órfãos & Atribuição</span>
          {dadosReconciliacao.leadsOrfaos.length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">
              {dadosReconciliacao.leadsOrfaos.length} pendentes
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("relatorio")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all shadow-sm",
            abaAtiva === "relatorio"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <FileText className="size-4" />
          <span>Relatório Executivo</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("mcp")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all shadow-sm",
            abaAtiva === "mcp"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Cpu className="size-4" />
          <span>Integração MCP & API</span>
          <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 uppercase">
            Protocol
          </span>
        </button>
      </div>

      {/* Avisos */}
      {status?.warnExpiring && (
        <Aviso
          texto="O token da conta Meta expira em menos de 7 dias. Reconecte para evitar interrupção."
          acao="Reconectar"
        />
      )}
      {tokenExpirado && (
        <Aviso
          texto="Token expirado. Reconecte sua conta Meta Business para continuar vendo os dados."
          acao="Reconectar"
          erro
        />
      )}
      {modoMock && (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          Exibindo dados de demonstração no formato real da Graph API. Conecte a conta Meta Business
          (ou defina META_ACCESS_TOKEN) para ver dados reais.
        </p>
      )}

      {/* Conta + período */}
      {abaAtiva !== "mcp" && (
        <MetaAdsFilterBar
          contas={contas}
          conta={conta}
          onSelectConta={(id) => {
            setContaId(id)
            setTrilha([])
          }}
          preset={preset}
          onSelectPreset={setPreset}
          cSince={cSince}
          onChangeCSince={setCSince}
          cUntil={cUntil}
          onChangeCUntil={setCUntil}
          comparar={comparar}
          onToggleComparar={setComparar}
          prev={prev}
        />
      )}

      {/* ABA 1: VISÃO GERAL & DRILL-DOWN */}
      {abaAtiva === "geral" && (
        <>
          <OrcamentoPanel />
          <MetaAdsGeralTab
            conta={conta}
            trilha={trilha}
            onSetTrilha={setTrilha}
            selecionado={selecionado}
            nivelFilho={nivelFilho}
            kpi={kpi}
            kpiPrev={kpiPrev}
            comparar={comparar}
            loadIns={loadIns}
            insAtual={insAtual}
            insDiario={insDiario}
            insFilhos={insFilhos}
            filhos={filhos}
            loadFilhos={loadFilhos}
            serie={serie}
            barras={barras}
            insPorFilho={insPorFilho}
            leadsPorCampanha={leadsPorCampanha}
          />
        </>
      )}

      {/* ABA 2: AUDITORIA & RECONCILIAÇÃO (META × CRM REAL) */}
      {abaAtiva === "auditoria" && (
        <AuditReconciliation
          reconciliacoes={dadosReconciliacao.reconciliacoes}
          corretores={dadosReconciliacao.corretores}
          totais={dadosReconciliacao.totais}
          loading={!todasCampanhas}
        />
      )}

      {/* ABA 3: LEADS ÓRFÃOS & AUDITORIA DE ATRIBUIÇÃO */}
      {abaAtiva === "orfaos" && (
        <AttributionAudit
          leadsOrfaos={dadosReconciliacao.leadsOrfaos}
          campanhas={listaCampanhas}
        />
      )}

      {/* ABA 4: RELATÓRIO EXECUTIVO & EXPORTAÇÃO */}
      {abaAtiva === "relatorio" && (
        <ExecutiveReport
          reconciliacoes={dadosReconciliacao.reconciliacoes}
          corretores={dadosReconciliacao.corretores}
          totais={dadosReconciliacao.totais}
          periodoStr={periodoLabel}
        />
      )}

      {/* ABA 5: INTEGRAÇÃO MCP & API */}
      {abaAtiva === "mcp" && <McpIntegrationPanel />}

      {/* IA Chat flutuante em todas as abas */}
      <MetaAiChat />
    </div>
  )
}
