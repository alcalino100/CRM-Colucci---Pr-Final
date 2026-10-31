"use client"

// components/meta-ads/attribution-audit.tsx
// Diagnóstico de Atribuição e Gestão de Leads Órfãos do Tráfego Pago
// Permite vincular leads retroativamente a campanhas e auditar perda de dados de rastreio.

import { useState } from "react"
import { AlertCircle, CheckCircle2, Link2, RefreshCw, Search, ShieldAlert, Sparkles, Filter } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Input, Select } from "@/components/ui/primitives"
import { useLeads } from "@/lib/leads-store"
import type { Lead } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

interface Props {
  leadsOrfaos: Lead[]
  campanhas: Array<{ id: string; name: string }>
}

export default function AttributionAudit({ leadsOrfaos, campanhas }: Props) {
  const { updateLead, userName } = useLeads()
  const [busca, setBusca] = useState("")
  const [campanhaSelecionada, setCampanhaSelecionada] = useState<Record<string, string>>({})
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null)

  const filtrados = leadsOrfaos.filter((l) => {
    return l.nome.toLowerCase().includes(busca.toLowerCase()) || l.telefone.includes(busca)
  })

  async function handleAtribuir(leadId: string) {
    const cid = campanhaSelecionada[leadId]
    if (!cid) return

    setSalvandoId(leadId)
    setSucessoMsg(null)
    try {
      const camp = campanhas.find((c) => c.id === cid)
      const res = await updateLead(leadId, {
        metaCampaignId: cid,
        origem: "Tráfego Pago",
      })
      if (res.ok) {
        setSucessoMsg(`Lead atribuído com sucesso à campanha "${camp?.name || cid}"!`)
        setTimeout(() => setSucessoMsg(null), 4000)
      }
    } finally {
      setSalvandoId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Resumo do Status de Atribuição */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leads Órfãos (Sem Campanha)</span>
            <span className={cn("flex size-8 items-center justify-center rounded-xl", leadsOrfaos.length > 0 ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600")}>
              {leadsOrfaos.length > 0 ? <AlertCircle className="size-4.5" /> : <CheckCircle2 className="size-4.5" />}
            </span>
          </div>
          <p className={cn("mt-2 font-display text-3xl font-bold", leadsOrfaos.length > 0 ? "text-amber-600" : "text-emerald-600")}>
            {leadsOrfaos.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {leadsOrfaos.length > 0 ? "Leads de tráfego pago sem identificador de anúncio" : "Todos os leads de tráfego estão 100% atribuídos"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campanhas Disponíveis</span>
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Link2 className="size-4.5" />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-foreground">
            {campanhas.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Prontas para vinculação e re-atribuição retroativa
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Integridade de Rastreio</span>
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
              <ShieldAlert className="size-4.5" />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-emerald-600">
            {leadsOrfaos.length === 0 ? "100%" : `${Math.max(0, 100 - leadsOrfaos.length * 2)}%`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Qualidade da captura de UTMs, FBC e parâmetros de anúncio
          </p>
        </div>
      </div>

      {sucessoMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{sucessoMsg}</span>
        </div>
      )}

      {/* Tabela de Leads Órfãos */}
      <Card className="rounded-2xl overflow-hidden border border-border shadow-sm">
        <CardHeader className="border-b border-border/50 bg-muted/15 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <AlertCircle className="size-5 text-amber-600" />
                Leads Pendentes de Atribuição de Campanha
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Vincule cada lead à campanha correta para normalizar as métricas de CPL e ROAS
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-3 pl-4 pr-3">Lead</th>
                  <th className="py-3 pr-3">Telefone</th>
                  <th className="py-3 pr-3">Entrada no CRM</th>
                  <th className="py-3 pr-3">Status Atual</th>
                  <th className="py-3 pr-3">Corretor</th>
                  <th className="py-3 pr-4 min-w-64">Atribuir a uma Campanha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtrados.map((l) => {
                  const salvando = salvandoId === l.id
                  const cid = campanhaSelecionada[l.id] || ""

                  return (
                    <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 pl-4 pr-3 font-semibold text-foreground">
                        {l.nome}
                        {l.imovelRef && <span className="block text-[10px] text-muted-foreground font-normal">Ref: {l.imovelRef}</span>}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground tabular-nums">{l.telefone || "—"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {new Date(l.criadoEm).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 pr-3">
                        <Badge variant="slate" className="text-[10px] capitalize">
                          {l.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {l.corretorId ? userName(l.corretorId) : "Não atribuído"}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <select
                            className="h-8 flex-1 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            value={cid}
                            onChange={(e) =>
                              setCampanhaSelecionada({ ...campanhaSelecionada, [l.id]: e.target.value })
                            }
                          >
                            <option value="">Selecione a campanha...</option>
                            {campanhas.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAtribuir(l.id)}
                            disabled={!cid || salvando}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
                          >
                            {salvando ? <RefreshCw className="size-3 animate-spin" /> : <Link2 className="size-3" />}
                            Vincular
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      {leadsOrfaos.length === 0
                        ? "Parabéns! Nenhum lead órfão encontrado no sistema."
                        : "Nenhum lead encontrado com o termo buscado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
