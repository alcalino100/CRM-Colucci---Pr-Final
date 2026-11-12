"use client"

import { useEffect, useState, useTransition } from "react"
import {
  MessageSquare,
  Settings,
  Users,
  Eye,
  History,
  Send,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Info,
  Check,
  Shield,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import { Card, CardContent, CardHeader, CardTitle, Badge, Dialog } from "@/components/ui/primitives"
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ui/responsive-table"
import { cn } from "@/lib/utils"

interface RelatorioConfig {
  id: string
  ativo: boolean
  hora_envio: string
  dias_semana: number[]
  instance_name: string | null
  secoes: {
    trafego: boolean
    automacao: boolean
    ia: boolean
    arquivados: boolean
    tempo: boolean
  }
  incluir_gestores_no_tempo: boolean
  listar_nomes_leads: boolean
  resumo_ia: boolean
  limite_tentativa: string
}

interface Destinatario {
  id: string
  nome: string
  tipo: "numero" | "grupo"
  destino: string
  ativo: boolean
  secoes: Record<string, boolean> | null
  created_at: string
}

interface EnvioHistorico {
  id: string
  data_referencia: string
  destinatario_id: string | null
  destinatario?: { nome: string; destino: string; tipo: string } | null
  instance_name: string
  origem: "automatico" | "teste" | "reenvio"
  status: "enviado" | "falhou" | "pulado"
  erro: string | null
  texto: string
  secoes_enviadas: string[]
  metricas: any
  enviado_em: string
}

const DIAS_NOMES = [
  { valor: 0, label: "Dom" },
  { valor: 1, label: "Seg" },
  { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" },
  { valor: 4, label: "Qui" },
  { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" },
]

export default function RelatoriosWhatsappAdminPage() {
  const { user } = useAuth()
  const isGestor = user?.role ? isGestorNivel(user.role) : false

  const [abaAtiva, setAbaAtiva] = useState<"config" | "destinatarios" | "preview" | "historico">("config")
  const [isPending, startTransition] = useTransition()

  // Estado da Configuração
  const [config, setConfig] = useState<RelatorioConfig | null>(null)
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  const [feedbackConfig, setFeedbackConfig] = useState<string | null>(null)

  // Estado das Instâncias Conectadas
  const [instancias, setInstancias] = useState<Array<{ instance_name: string; status: string; numero?: string }>>([])

  // Estado dos Destinatários
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([])
  const [modalDestinatarioAberto, setModalDestinatarioAberto] = useState(false)
  const [destinatarioEdicao, setDestinatarioEdicao] = useState<Destinatario | null>(null)
  const [destNome, setDestNome] = useState("")
  const [destTipo, setDestTipo] = useState<"numero" | "grupo">("numero")
  const [destDestino, setDestDestino] = useState("")
  const [destAtivo, setDestAtivo] = useState(true)
  const [salvandoDestinatario, setSalvandoDestinatario] = useState(false)
  const [erroDestinatario, setErroDestinatario] = useState<string | null>(null)

  // Estado do Preview e Teste
  const [previewDataParam, setPreviewDataParam] = useState("")
  const [previewTexto, setPreviewTexto] = useState("")
  const [carregandoPreview, setCarregandoPreview] = useState(false)
  const [testeDestino, setTesteDestino] = useState("")
  const [enviandoTeste, setEnviandoTeste] = useState(false)
  const [feedbackTeste, setFeedbackTeste] = useState<{ ok: boolean; msg: string } | null>(null)

  // Estado do Histórico
  const [historico, setHistorico] = useState<EnvioHistorico[]>([])
  const [totalHistorico, setTotalHistorico] = useState(0)
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)
  const [modalDetalhesEnvio, setModalDetalhesEnvio] = useState<EnvioHistorico | null>(null)

  // Carregar dados iniciais
  useEffect(() => {
    carregarConfig()
    carregarInstancias()
    carregarDestinatarios()
  }, [])

  useEffect(() => {
    if (abaAtiva === "preview") carregarPreview()
    if (abaAtiva === "historico") carregarHistorico()
  }, [abaAtiva])

  async function carregarConfig() {
    try {
      const res = await fetch("/api/relatorios/config")
      const json = await res.json()
      if (json.ok && json.config) {
        setConfig(json.config)
      }
    } catch {
      /* silent */
    }
  }

  async function carregarInstancias() {
    try {
      const res = await fetch("/api/whatsapp/instancias")
      const json = await res.json()
      if (json.ok && Array.isArray(json.instancias)) {
        setInstancias(json.instancias)
      }
    } catch {
      /* silent */
    }
  }

  async function carregarDestinatarios() {
    try {
      const res = await fetch("/api/relatorios/destinatarios")
      const json = await res.json()
      if (json.ok && Array.isArray(json.destinatarios)) {
        setDestinatarios(json.destinatarios)
      }
    } catch {
      /* silent */
    }
  }

  async function carregarPreview(dataCustom?: string) {
    setCarregandoPreview(true)
    try {
      const url = dataCustom
        ? `/api/relatorios/preview?data=${encodeURIComponent(dataCustom)}`
        : "/api/relatorios/preview"
      const res = await fetch(url)
      const json = await res.json()
      if (json.ok && json.texto) {
        setPreviewTexto(json.texto)
      }
    } catch {
      setPreviewTexto("Não foi possível carregar a pré-visualização.")
    } finally {
      setCarregandoPreview(false)
    }
  }

  async function carregarHistorico() {
    setCarregandoHistorico(true)
    try {
      const res = await fetch("/api/relatorios/historico?limit=50")
      const json = await res.json()
      if (json.ok) {
        setHistorico(json.envios || [])
        setTotalHistorico(json.total || 0)
      }
    } catch {
      /* silent */
    } finally {
      setCarregandoHistorico(false)
    }
  }

  async function salvarConfiguracoes() {
    if (!config) return
    setSalvandoConfig(true)
    setFeedbackConfig(null)
    try {
      const res = await fetch("/api/relatorios/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const json = await res.json()
      if (json.ok) {
        setFeedbackConfig("Configurações salvas com sucesso!")
        setTimeout(() => setFeedbackConfig(null), 4000)
      } else {
        setFeedbackConfig(`Erro: ${json.erro || "Falha ao salvar"}`)
      }
    } catch (e) {
      setFeedbackConfig("Erro de rede ao salvar configurações")
    } finally {
      setSalvandoConfig(false)
    }
  }

  function abrirModalDestinatario(dest?: Destinatario) {
    if (dest) {
      setDestinatarioEdicao(dest)
      setDestNome(dest.nome)
      setDestTipo(dest.tipo)
      setDestDestino(dest.destino)
      setDestAtivo(dest.ativo)
    } else {
      setDestinatarioEdicao(null)
      setDestNome("")
      setDestTipo("numero")
      setDestDestino("")
      setDestAtivo(true)
    }
    setErroDestinatario(null)
    setModalDestinatarioAberto(true)
  }

  async function salvarDestinatario(e: React.FormEvent) {
    e.preventDefault()
    setSalvandoDestinatario(true)
    setErroDestinatario(null)

    try {
      const payload = {
        nome: destNome,
        tipo: destTipo,
        destino: destDestino,
        ativo: destAtivo,
      }

      const url = destinatarioEdicao
        ? `/api/relatorios/destinatarios/${destinatarioEdicao.id}`
        : "/api/relatorios/destinatarios"
      const method = destinatarioEdicao ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (json.ok) {
        setModalDestinatarioAberto(false)
        await carregarDestinatarios()
      } else {
        setErroDestinatario(json.erro || "Falha ao salvar destinatário")
      }
    } catch (err) {
      setErroDestinatario("Erro de comunicação ao salvar")
    } finally {
      setSalvandoDestinatario(false)
    }
  }

  async function excluirDestinatario(id: string) {
    if (!confirm("Deseja realmente remover este destinatário do relatório?")) return
    try {
      const res = await fetch(`/api/relatorios/destinatarios/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (json.ok) {
        setDestinatarios((prev) => prev.filter((d) => d.id !== id))
      }
    } catch {
      alert("Erro ao excluir destinatário")
    }
  }

  async function enviarTesteManual() {
    setEnviandoTeste(true)
    setFeedbackTeste(null)
    try {
      const res = await fetch("/api/relatorios/teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destino: testeDestino.trim() || undefined,
          data: previewDataParam || undefined,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setFeedbackTeste({
          ok: true,
          msg: `Relatório de teste enviado com sucesso! (${json.enviados ?? 1} disparo(s))`,
        })
      } else {
        setFeedbackTeste({
          ok: false,
          msg: json.erro || "Falha ao enviar teste.",
        })
      }
    } catch (e) {
      setFeedbackTeste({ ok: false, msg: "Erro de rede ao enviar teste." })
    } finally {
      setEnviandoTeste(false)
    }
  }

  if (!isGestor) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
        <Shield className="size-10 text-muted-foreground" />
        <h2 className="text-lg font-bold">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground">Apenas gestores têm permissão para configurar os relatórios automáticos no WhatsApp.</p>
      </div>
    )
  }

  const columnsDestinatarios: ResponsiveColumn<Destinatario>[] = [
    {
      key: "nome",
      header: "Destinatário",
      priority: true,
      render: (dest) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground text-sm">{dest.nome}</span>
          <span className="text-xs text-muted-foreground">{dest.destino}</span>
        </div>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      render: (dest) => (
        <Badge variant={dest.tipo === "grupo" ? "purple" : "blue"} className="capitalize">
          {dest.tipo === "grupo" ? "Grupo WhatsApp" : "Número Individual"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      priority: true,
      render: (dest) => (
        <Badge variant={dest.ativo ? "green" : "gray"}>
          {dest.ativo ? "Ativo" : "Pausado"}
        </Badge>
      ),
    },
    {
      key: "acoes",
      header: "Ações",
      align: "right",
      render: (dest) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => abrirModalDestinatario(dest)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Editar destinatário"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => excluirDestinatario(dest.id)}
            className="rounded-lg p-1.5 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
            title="Remover destinatário"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ]

  const columnsHistorico: ResponsiveColumn<EnvioHistorico>[] = [
    {
      key: "data_referencia",
      header: "Dia Reportado",
      priority: true,
      render: (env) => (
        <span className="font-semibold text-sm">
          {env.data_referencia.split("-").reverse().join("/")}
        </span>
      ),
    },
    {
      key: "destinatario",
      header: "Destinatário",
      priority: true,
      render: (env) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground text-xs">
            {env.destinatario?.nome || "Destinatário"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {env.destinatario?.destino || env.instance_name}
          </span>
        </div>
      ),
    },
    {
      key: "origem",
      header: "Origem",
      render: (env) => (
        <Badge variant={env.origem === "automatico" ? "blue" : "amber"} className="text-[11px] capitalize">
          {env.origem}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (env) => (
        <Badge
          variant={env.status === "enviado" ? "green" : env.status === "pulado" ? "gray" : "red"}
          className="capitalize text-[11px]"
        >
          {env.status === "enviado" ? "Enviado" : env.status === "pulado" ? "Pulado (Idempotência)" : "Falhou"}
        </Badge>
      ),
    },
    {
      key: "horario",
      header: "Enviado em",
      render: (env) => (
        <span className="text-xs text-muted-foreground">
          {new Date(env.enviado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "acoes",
      header: "Mensagem",
      align: "right",
      render: (env) => (
        <button
          type="button"
          onClick={() => setModalDetalhesEnvio(env)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-semibold hover:bg-muted"
        >
          <Eye className="size-3.5" /> Ver Texto
        </button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="size-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-display">
              Relatórios Automáticos no WhatsApp
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Envio diário às 08:00 com consolidado do dia anterior (Tráfego, Automação, IA, Arquivados e Tempo da Equipe).
          </p>
        </div>

        {/* Status Rápido */}
        {config && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Disparo diário:</span>
            <Badge variant={config.ativo ? "green" : "gray"} className="text-xs font-bold">
              {config.ativo ? `Ativo às ${config.hora_envio}` : "Pausado"}
            </Badge>
          </div>
        )}
      </div>

      {/* Abas de Navegação */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border/60 pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setAbaAtiva("config")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition select-none btn-touch-target",
            abaAtiva === "config"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Settings className="size-4" /> Configurações
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("destinatarios")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition select-none btn-touch-target",
            abaAtiva === "destinatarios"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Users className="size-4" /> Destinatários
          <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px] font-bold">
            {destinatarios.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("preview")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition select-none btn-touch-target",
            abaAtiva === "preview"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Eye className="size-4" /> Pré-visualização & Teste
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("historico")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition select-none btn-touch-target",
            abaAtiva === "historico"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <History className="size-4" /> Histórico de Envios
          {totalHistorico > 0 && (
            <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px] font-bold">
              {totalHistorico}
            </span>
          )}
        </button>
      </div>

      {/* ABA 1: CONFIGURAÇÕES */}
      {abaAtiva === "config" && config && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle>Configuração do Motor de Envio</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col gap-6">
              {/* Ativação geral */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl border border-border bg-muted/20">
                <div>
                  <h4 className="text-sm font-bold text-foreground">Disparo Automático Ativo</h4>
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, envia o relatório automaticamente para todos os destinatários ativos no horário agendado.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.ativo}
                    onChange={(e) => setConfig({ ...config, ativo: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Instância e Horários */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Instância WhatsApp de Envio</label>
                  <select
                    value={config.instance_name || ""}
                    onChange={(e) => setConfig({ ...config, instance_name: e.target.value || null })}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary btn-touch-target"
                  >
                    <option value="">Automático (primeira conectada)</option>
                    {instancias.map((inst) => (
                      <option key={inst.instance_name} value={inst.instance_name}>
                        {inst.instance_name} ({inst.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Horário de Disparo (BRT)</label>
                  <input
                    type="time"
                    value={config.hora_envio}
                    onChange={(e) => setConfig({ ...config, hora_envio: e.target.value })}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary btn-touch-target"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Limite para Retentativas</label>
                  <input
                    type="time"
                    value={config.limite_tentativa}
                    onChange={(e) => setConfig({ ...config, limite_tentativa: e.target.value })}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary btn-touch-target"
                  />
                </div>
              </div>

              {/* Dias da Semana */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-muted-foreground">Dias de Envio</label>
                <div className="flex flex-wrap items-center gap-2">
                  {DIAS_NOMES.map((d) => {
                    const ativo = config.dias_semana.includes(d.valor)
                    return (
                      <button
                        key={d.valor}
                        type="button"
                        onClick={() => {
                          const novos = ativo
                            ? config.dias_semana.filter((x) => x !== d.valor)
                            : [...config.dias_semana, d.valor].sort()
                          if (novos.length > 0) setConfig({ ...config, dias_semana: novos })
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs font-bold transition btn-touch-target select-none",
                          ativo
                            ? "border-primary bg-primary text-primary-foreground shadow-xs"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Seleção dos 5 Blocos */}
              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-bold text-foreground">Blocos Incluídos no Relatório</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: "trafego", label: "1. Tráfego Pago por Corretor", desc: "Leads do tráfego pago, contatos únicos e corretores sem leads." },
                    { key: "automacao", label: "2. Automação e Follow-up", desc: "Disparos, respostas recebidas, taxa e fila atual." },
                    { key: "ia", label: "3. Respostas e Atendimento IA", desc: "IA assumiu, handoffs para humanos e visitas agendadas." },
                    { key: "arquivados", label: "4. Arquivados e Reaparecidos", desc: "Eventos de auditoria, motivos e retorno de hibernação." },
                    { key: "tempo", label: "5. Tempo da Equipe no CRM", desc: "União de intervalos recortados e sessões por corretor." },
                  ].map((bloco) => {
                    const ativo = config.secoes[bloco.key as keyof typeof config.secoes]
                    return (
                      <label
                        key={bloco.key}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-3 cursor-pointer select-none transition",
                          ativo ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/30"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={ativo}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              secoes: { ...config.secoes, [bloco.key]: e.target.checked },
                            })
                          }
                          className="size-4 shrink-0 mt-0.5 accent-primary"
                        />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-foreground">{bloco.label}</span>
                          <span className="text-[11px] text-muted-foreground leading-snug">{bloco.desc}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Opções de Privacidade e Métricas */}
              <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
                <h4 className="text-sm font-bold text-foreground">Privacidade e Regras Complementares</h4>

                <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.incluir_gestores_no_tempo}
                    onChange={(e) => setConfig({ ...config, incluir_gestores_no_tempo: e.target.checked })}
                    className="size-4 shrink-0 mt-0.5 accent-primary"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground">Incluir gestores no Bloco 5 (Tempo no CRM)</span>
                    <p className="text-[11px] text-muted-foreground">Por padrão desligado (mede apenas corretores ativos).</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.listar_nomes_leads}
                    onChange={(e) => setConfig({ ...config, listar_nomes_leads: e.target.checked })}
                    className="size-4 shrink-0 mt-0.5 accent-amber-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Listar nomes dos leads (Atenção LGPD)
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Por padrão desligado. Quando ativo, anexa o nome dos novos leads. Tenha cautela caso envie para grupos com participantes externos.
                    </p>
                  </div>
                </label>
              </div>

              {/* Botão Salvar */}
              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                {feedbackConfig && (
                  <span className={cn("text-xs font-semibold", feedbackConfig.includes("sucesso") ? "text-emerald-600" : "text-destructive")}>
                    {feedbackConfig}
                  </span>
                )}
                <button
                  type="button"
                  onClick={salvarConfiguracoes}
                  disabled={salvandoConfig}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 btn-touch-target"
                >
                  {salvandoConfig ? <RefreshCw className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Salvar Configurações
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ABA 2: DESTINATÁRIOS */}
      {abaAtiva === "destinatarios" && (
        <Card>
          <CardHeader className="border-b border-border/60 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>Destinatários dos Relatórios</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Defina quais números individuais ou grupos de WhatsApp receberão o consolidado diário.
                </p>
              </div>
              <button
                type="button"
                onClick={() => abrirModalDestinatario()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 btn-touch-target"
              >
                <Plus className="size-4" /> Novo Destinatário
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveTable
              data={destinatarios}
              columns={columnsDestinatarios}
              keyExtractor={(d) => d.id}
              emptyMessage={
                <div className="py-12 text-center text-muted-foreground">
                  <p className="font-semibold text-foreground text-sm">Nenhum destinatário cadastrado</p>
                  <p className="text-xs mt-1">Clique em "Novo Destinatário" para cadastrar números ou grupos.</p>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* ABA 3: PRÉ-VISUALIZAÇÃO & TESTE */}
      {abaAtiva === "preview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna da Esquerda: Ações de Teste */}
          <div className="flex flex-col gap-4 lg:col-span-1">
            <Card>
              <CardHeader className="border-b border-border/60 pb-3">
                <CardTitle className="text-base">Disparo de Teste</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Data do Relatório (opcional)</label>
                  <input
                    type="date"
                    value={previewDataParam}
                    onChange={(e) => {
                      setPreviewDataParam(e.target.value)
                      carregarPreview(e.target.value)
                    }}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary btn-touch-target"
                  />
                  <span className="text-[11px] text-muted-foreground">Vazio = consolidado de ontem</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Destino de Teste (opcional)</label>
                  <input
                    type="text"
                    placeholder="5518991234567 ou JID@g.us"
                    value={testeDestino}
                    onChange={(e) => setTesteDestino(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary btn-touch-target"
                  />
                  <span className="text-[11px] text-muted-foreground">Se vazio, dispara para todos os ativos.</span>
                </div>

                <button
                  type="button"
                  onClick={enviarTesteManual}
                  disabled={enviandoTeste}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 btn-touch-target"
                >
                  {enviandoTeste ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Enviar Teste Agora
                </button>

                {feedbackTeste && (
                  <div
                    className={cn(
                      "p-3 rounded-xl border text-xs",
                      feedbackTeste.ok
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    )}
                  >
                    {feedbackTeste.msg}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Coluna da Direita: Balão WhatsApp */}
          <div className="flex flex-col gap-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Simulação da Mensagem no WhatsApp
              </span>
              <button
                type="button"
                onClick={() => carregarPreview(previewDataParam)}
                disabled={carregandoPreview}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <RefreshCw className={cn("size-3.5", carregandoPreview && "animate-spin")} />
                Recalcular Métricas
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-900/20 bg-emerald-950/5 dark:bg-emerald-950/20 p-4 sm:p-6 shadow-inner">
              <div className="max-w-xl mx-auto rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm text-foreground">
                <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed select-text">
                  {carregandoPreview ? "Calculando métricas e gerando visualização..." : previewTexto}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: HISTÓRICO */}
      {abaAtiva === "historico" && (
        <Card>
          <CardHeader className="border-b border-border/60 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Histórico de Envios</CardTitle>
              <button
                type="button"
                onClick={carregarHistorico}
                disabled={carregandoHistorico}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold hover:bg-muted"
              >
                <RefreshCw className={cn("size-3.5", carregandoHistorico && "animate-spin")} />
                Atualizar
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveTable
              data={historico}
              columns={columnsHistorico}
              keyExtractor={(h) => h.id}
              emptyMessage="Nenhum registro de envio encontrado."
            />
          </CardContent>
        </Card>
      )}

      {/* MODAL: NOVO / EDITAR DESTINATÁRIO */}
      {modalDestinatarioAberto && (
        <Dialog
          open={modalDestinatarioAberto}
          onClose={() => setModalDestinatarioAberto(false)}
          title={destinatarioEdicao ? "Editar Destinatário" : "Novo Destinatário"}
        >
          <form onSubmit={salvarDestinatario} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Nome Identificador</label>
              <input
                type="text"
                required
                placeholder="Ex: Grupo Gestão Geral, Celular Kleber..."
                value={destNome}
                onChange={(e) => setDestNome(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary btn-touch-target"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Tipo de Destino</label>
              <select
                value={destTipo}
                onChange={(e) => setDestTipo(e.target.value as "numero" | "grupo")}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary btn-touch-target"
              >
                <option value="numero">Número Individual (DDI 55)</option>
                <option value="grupo">Grupo WhatsApp (@g.us)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {destTipo === "numero" ? "Telefone WhatsApp (com 55)" : "JID do Grupo (@g.us)"}
              </label>
              <input
                type="text"
                required
                placeholder={destTipo === "numero" ? "5518991234567" : "120363024819283746@g.us"}
                value={destDestino}
                onChange={(e) => setDestDestino(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary btn-touch-target font-mono"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={destAtivo}
                onChange={(e) => setDestAtivo(e.target.checked)}
                className="size-4 accent-primary"
              />
              <span className="text-xs font-semibold">Ativo para envio automático</span>
            </label>

            {erroDestinatario && (
              <p className="text-xs font-medium text-destructive">{erroDestinatario}</p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setModalDestinatarioAberto(false)}
                className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvandoDestinatario}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {salvandoDestinatario ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* MODAL: VER DETALHES DO ENVIO DO HISTÓRICO */}
      {modalDetalhesEnvio && (
        <Dialog
          open={Boolean(modalDetalhesEnvio)}
          onClose={() => setModalDetalhesEnvio(null)}
          title={`Envio do Relatório de ${modalDetalhesEnvio.data_referencia.split("-").reverse().join("/")}`}
        >
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pb-2 border-b border-border">
              <span>Instância: <strong>{modalDetalhesEnvio.instance_name}</strong></span>
              <span>•</span>
              <span>Status: <strong className="capitalize">{modalDetalhesEnvio.status}</strong></span>
              {modalDetalhesEnvio.erro && (
                <span className="text-destructive font-medium">• Erro: {modalDetalhesEnvio.erro}</span>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3">
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                {modalDetalhesEnvio.texto}
              </pre>
            </div>
          </div>
        </Dialog>
      )}

      {/* Rodapé Obrigatório com Aviso Metodológico */}
      <div className="mt-8 rounded-xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground flex items-start gap-3">
        <Info className="size-4 shrink-0 text-muted-foreground mt-0.5" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-foreground">
            Nota Metodológica sobre a Métrica de Tempo no CRM (Bloco 5):
          </p>
          <p>
            O tempo de permanência contabilizado mede exclusivamente os intervalos de aba visível e ativa no navegador, transmitidos por batimentos periódicos (heartbeat) da aplicação.
            Por se tratar de uma união de intervalos recortados na janela do dia [00:00, 24:00 BRT), abas simultâneas do mesmo corretor não duplicam o tempo.
            Esta métrica é estritamente informativa de produtividade operacional e <strong>não constitui controle formal de jornada de trabalho</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
