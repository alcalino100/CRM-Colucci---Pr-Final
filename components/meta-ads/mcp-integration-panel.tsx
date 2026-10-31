"use client"

// components/meta-ads/mcp-integration-panel.tsx
// Painel de Integração MCP (Model Context Protocol) para Meta Ads & CRM
// Apresenta o catálogo de ferramentas, documentação e playground ao vivo para testar as tools.

import { useState } from "react"
import { Cpu, Terminal, Play, CheckCircle2, Copy, Check, Code2, Sparkles, RefreshCw, Layers } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives"
import { MCP_TOOLS_DEFINITIONS } from "@/lib/meta/mcp-server"

export default function McpIntegrationPanel() {
  const [selectedTool, setSelectedTool] = useState(MCP_TOOLS_DEFINITIONS[1].name)
  const [toolArgs, setToolArgs] = useState<string>('{\n  "since": "2026-10-01",\n  "until": "2026-10-30"\n}')
  const [executing, setExecuting] = useState(false)
  const [responseOutput, setResponseOutput] = useState<string | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  const activeToolDef = MCP_TOOLS_DEFINITIONS.find((t) => t.name === selectedTool) || MCP_TOOLS_DEFINITIONS[0]

  async function handleTestTool() {
    setExecuting(true)
    setResponseOutput(null)
    try {
      let parsedArgs = {}
      try {
        parsedArgs = JSON.parse(toolArgs)
      } catch (err) {
        setResponseOutput(JSON.stringify({ error: "JSON de argumentos inválido" }, null, 2))
        setExecuting(false)
        return
      }

      const res = await fetch("/api/mcp/meta-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `test-${Date.now()}`,
          method: "tools/call",
          params: {
            name: selectedTool,
            arguments: parsedArgs,
          },
        }),
      })

      const data = await res.json()
      setResponseOutput(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setResponseOutput(JSON.stringify({ error: e.message }, null, 2))
    } finally {
      setExecuting(false)
    }
  }

  function handleSelectToolChange(name: string) {
    setSelectedTool(name)
    if (name === "meta_get_performance") {
      setToolArgs('{\n  "since": "2026-10-01",\n  "until": "2026-10-30"\n}')
    } else if (name === "crm_reconciliation_audit") {
      setToolArgs('{\n  "since": "2026-10-01",\n  "until": "2026-10-30"\n}')
    } else if (name === "crm_get_corretor_performance") {
      setToolArgs('{\n  "since": "2026-10-01"\n}')
    } else if (name === "crm_detect_attribution_leaks") {
      setToolArgs('{}')
    } else if (name === "crm_attribute_lead") {
      setToolArgs('{\n  "leadId": "uuid-do-lead",\n  "campaignId": "120210001"\n}')
    }
  }

  const snippetJson = `{
  "mcpServers": {
    "colucci-meta-ads": {
      "url": "https://seu-dominio.vercel.app/api/mcp/meta-ads"
    }
  }
}`

  return (
    <div className="flex flex-col gap-6">
      {/* Banner Informativo */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm">
              <Cpu className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Servidor MCP (Model Context Protocol) Ativo</h3>
                <Badge variant="green" className="text-[10px]">JSON-RPC 2.0</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Exponha os dados de tráfego e CRM para agentes como Antigravity, Claude Desktop, Cursor e LLMs parceiras.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <code className="rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-muted-foreground font-mono">
              POST /api/mcp/meta-ads
            </code>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Catálogo de Ferramentas (4 colunas) */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" />
            Ferramentas MCP Disponíveis ({MCP_TOOLS_DEFINITIONS.length})
          </h4>

          <div className="flex flex-col gap-2">
            {MCP_TOOLS_DEFINITIONS.map((t) => {
              const active = t.name === selectedTool
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => handleSelectToolChange(t.name)}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:bg-muted/20 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-xs font-bold ${active ? "text-primary" : "text-foreground"}`}>
                      {t.name}
                    </span>
                    {active && <span className="size-2 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed line-clamp-2 text-muted-foreground">
                    {t.description}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Como Configurar Snippet */}
          <div className="mt-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Code2 className="size-3.5 text-primary" />
                Configuração para Agentes
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(snippetJson)
                  setCopiedSnippet(true)
                  setTimeout(() => setCopiedSnippet(false), 2500)
                }}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                {copiedSnippet ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                {copiedSnippet ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <pre className="mt-2 text-[10px] bg-muted/60 p-2.5 rounded-lg overflow-x-auto text-muted-foreground font-mono">
              {snippetJson}
            </pre>
          </div>
        </div>

        {/* Playground Interativo (7 colunas) */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          <Card className="rounded-2xl border border-border shadow-sm flex flex-col flex-1">
            <CardHeader className="border-b border-border/50 bg-muted/15 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Terminal className="size-4 text-primary" />
                    Playground: Executar Ferramenta MCP
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeToolDef.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTestTool}
                  disabled={executing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
                >
                  {executing ? <RefreshCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                  {executing ? "Executando..." : "Testar Tool"}
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-5 flex flex-col gap-4 flex-1">
              {/* Argumentos JSON */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Argumentos (JSON Schema: <code className="text-primary">{activeToolDef.name}</code>)
                </label>
                <textarea
                  value={toolArgs}
                  onChange={(e) => setToolArgs(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Saída / Resposta JSON-RPC */}
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Resposta da Execução (JSON-RPC)
                  </label>
                  {responseOutput && (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(responseOutput)}
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Copy className="size-3" /> Copiar resposta
                    </button>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-black/90 p-4 font-mono text-xs text-emerald-400 min-h-56 max-h-96 overflow-y-auto">
                  {responseOutput ? (
                    <pre className="whitespace-pre-wrap">{responseOutput}</pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/60 gap-2">
                      <Terminal className="size-6 text-muted-foreground/40" />
                      <span>Clique em "Testar Tool" acima para ver a resposta em tempo real.</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
