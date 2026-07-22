"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, Loader2, MessageCircle, QrCode, RefreshCw, XCircle } from "lucide-react"
import { Badge, Card, CardContent, CardHeader, CardTitle, Dialog, Skeleton, useToast } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"

type Estado = "idle" | "gerando_qr" | "aguardando_leitura" | "conectado" | "erro"

export function WhatsappConnectionCard({
  corretorId,
  corretorNome,
  compact = false,
}: {
  corretorId: string
  corretorNome: string
  compact?: boolean
}) {
  const [estado, setEstado] = useState<Estado>("idle")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [numero, setNumero] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregandoStatus, setCarregandoStatus] = useState(true)
  const [instanceName, setInstanceName] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [stale, setStale] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toast = useToast()

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Ao montar: garante a instância (nomeada com o corretor) e carrega o status atual
  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const ensure = await fetch("/api/whatsapp/instancias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corretorId, corretorNome }),
        })
        const ej = await ensure.json()
        const name: string | undefined = ej?.data?.instance_name
        if (!ativo || !name) {
          if (ativo) setCarregandoStatus(false)
          return
        }
        setInstanceName(name)
        const res = await fetch(`/api/whatsapp/status?instanceName=${encodeURIComponent(name)}`)
        const json = await res.json()
        if (!ativo) return
        if (json.status === "conectado") {
          setEstado("conectado")
          setNumero(json.numero ?? null)
        }
      } catch {
        /* silencioso: status inicial */
      } finally {
        if (ativo) setCarregandoStatus(false)
      }
    })()
    return () => {
      ativo = false
      stopPolling()
    }
  }, [corretorId, corretorNome, stopPolling])

  const iniciarPolling = useCallback(
    (name: string) => {
      stopPolling()
      const inicio = Date.now()
      pollRef.current = setInterval(async () => {
        if (Date.now() - inicio > 120_000) {
          stopPolling()
          return
        }
        try {
          const res = await fetch(`/api/whatsapp/status?instanceName=${encodeURIComponent(name)}`)
          const json = await res.json()
          if (json.status === "conectado") {
            setEstado("conectado")
            setNumero(json.numero ?? null)
            setQrCode(null)
            stopPolling()
          }
        } catch {
          /* continua tentando */
        }
      }, 4000)
    },
    [stopPolling],
  )

  async function conectar() {
    setEstado("gerando_qr")
    setErro(null)
    try {
      // Garante a instância no banco (nomeada com o corretor) e obtém o nome oficial
      const ensure = await fetch("/api/whatsapp/instancias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corretorId, corretorNome }),
      })
      const ej = await ensure.json()
      const name: string | undefined = ej?.data?.instance_name ?? instanceName ?? undefined
      if (!name) {
        setEstado("erro")
        setErro("Não foi possível preparar a instância do corretor.")
        return
      }
      setInstanceName(name)
      // Solicita o QR
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName: name }),
      })
      const json = await res.json()
      if (!res.ok || !json.qrCode) {
        setEstado("erro")
        setErro(json.error ?? "Não foi possível gerar o QR Code.")
        return
      }
      setQrCode(json.qrCode)
      setEstado("aguardando_leitura")
      iniciarPolling(name)
    } catch {
      setEstado("erro")
      setErro("Falha de conexão. Tente novamente.")
    }
  }

  // Atualização manual: consulta o estado real na Evolution e sincroniza a UI
  async function atualizar() {
    if (!instanceName || atualizando) return
    setAtualizando(true)
    setStale(false)
    try {
      const res = await fetch(`/api/whatsapp/refresh?instanceName=${encodeURIComponent(instanceName)}`)
      const json = await res.json()
      setStale(Boolean(json.stale))
      if (json.status === "conectado") {
        stopPolling()
        setEstado("conectado")
        setNumero(json.numero ?? null)
        setQrCode(null)
      } else if (json.status === "conectando") {
        setEstado("aguardando_leitura")
      } else {
        setEstado("idle")
        setNumero(null)
        setQrCode(null)
      }
    } catch {
      setStale(true)
    } finally {
      setAtualizando(false)
    }
  }

  // Desconexão (logout) — mantém a instância na Evolution para reconexão rápida
  async function desconectar() {
    if (!instanceName || desconectando) return
    setDesconectando(true)
    try {
      const res = await fetch("/api/whatsapp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast(json.error ?? "Não foi possível desconectar.", "error")
        return
      }
      stopPolling()
      setEstado("idle")
      setNumero(null)
      setQrCode(null)
      setStale(false)
      toast(json.aviso ?? "WhatsApp desconectado.", json.aviso ? "error" : "success")
    } catch {
      toast("Falha de conexão ao desconectar.", "error")
    } finally {
      setDesconectando(false)
      setConfirmar(false)
    }
  }

  return (
    <Card className={compact ? "" : "h-full"}>
      <CardHeader className={compact ? "p-4" : undefined}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-4 text-emerald-600" />
            {compact ? "Meu WhatsApp" : corretorNome}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {estado === "conectado" ? (
              <Badge variant="green" className="gap-1"><CheckCircle2 className="size-3" /> Conectado</Badge>
            ) : estado === "aguardando_leitura" ? (
              <Badge variant="amber">Aguardando leitura</Badge>
            ) : (
              <Badge variant="gray">Desconectado</Badge>
            )}
            {stale && (
              <span
                title="Não foi possível confirmar com o WhatsApp agora, mostrando o último dado salvo."
                className="text-xs text-amber-600"
              >
                desatualizado
              </span>
            )}
            {!carregandoStatus && instanceName && (
              <button
                type="button"
                onClick={atualizar}
                disabled={atualizando}
                aria-label="Atualizar status"
                title="Atualizar status"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={`size-4 ${atualizando ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className={`flex flex-col items-center gap-3 ${compact ? "p-4 pt-0" : "pt-0"}`}>
        {carregandoStatus ? (
          <Skeleton className="h-40 w-40 rounded-xl" />
        ) : estado === "conectado" ? (
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <CheckCircle2 className="size-10 text-emerald-600" />
            <p className="text-sm font-medium text-foreground">WhatsApp conectado</p>
            {numero && <p className="text-xs text-muted-foreground">Número: {numero}</p>}
          </div>
        ) : estado === "gerando_qr" ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">Gerando QR Code...</p>
          </div>
        ) : estado === "aguardando_leitura" && qrCode ? (
          <div className="flex flex-col items-center gap-2">
            {/* QR retornado pela Evolution API */}
            <img src={qrCode || "/placeholder.svg"} alt="QR Code para conectar o WhatsApp" className="size-48 rounded-xl border border-border" />
            <p className="text-center text-xs text-muted-foreground">Abra o WhatsApp, toque em Aparelhos conectados e leia o código.</p>
          </div>
        ) : estado === "erro" ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <XCircle className="size-8 text-destructive" />
            <p className="text-sm text-destructive">{erro}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <QrCode className="size-8" />
            <p className="text-sm">Conecte o WhatsApp deste corretor para capturar leads automaticamente.</p>
          </div>
        )}

        {estado !== "conectado" && !carregandoStatus && (
          <Button variant={estado === "erro" ? "outline" : "default"} onClick={conectar} disabled={estado === "gerando_qr"} className="w-full">
            {estado === "aguardando_leitura" ? "Gerar novo QR Code" : estado === "erro" ? "Tentar novamente" : "Conectar WhatsApp"}
          </Button>
        )}

        {estado === "conectado" && !carregandoStatus && (
          <Button variant="outline" onClick={() => setConfirmar(true)} disabled={desconectando} className="w-full">
            {desconectando ? <Loader2 className="size-4 animate-spin" /> : "Desconectar"}
          </Button>
        )}
      </CardContent>

      <Dialog open={confirmar} onClose={() => (!desconectando ? setConfirmar(false) : undefined)} title="Desconectar WhatsApp">
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja desconectar o WhatsApp de {corretorNome}? Será necessário ler o QR Code novamente para reconectar.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmar(false)} disabled={desconectando}>Cancelar</Button>
          <Button variant="destructive" onClick={desconectar} disabled={desconectando}>
            {desconectando ? <Loader2 className="size-4 animate-spin" /> : "Desconectar"}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}
