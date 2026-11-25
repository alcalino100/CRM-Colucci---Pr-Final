"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, Input, Label, Select, useToast } from "@/components/ui/primitives"
import { renderizarModelo, type ModeloOficial } from "@/lib/whatsapp-oficial/modelo"

/** Envia um modelo (template) aprovado pela API oficial — o único jeito de iniciar conversa/retomar fora da janela de 24h. */
export function ModeloPicker({ open, onClose, instanceName, telefone, onEnviado }: { open: boolean; onClose: () => void; instanceName: string; telefone: string; onEnviado: () => void }) {
  const toast = useToast()
  const [modelos, setModelos] = useState<ModeloOficial[]>([])
  const [erro, setErro] = useState("")
  const [carregando, setCarregando] = useState(false)
  const [escolhido, setEscolhido] = useState("")
  const [vars, setVars] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open) return
    setCarregando(true); setErro("")
    fetch(`/api/whatsapp/oficial/modelos?instanceName=${encodeURIComponent(instanceName)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setErro(j.erro || "Não foi possível carregar os modelos."); setModelos([]); return }
        setModelos(j.modelos ?? [])
        setEscolhido(j.modelos?.[0] ? `${j.modelos[0].nome}|${j.modelos[0].idioma}` : "")
      })
      .catch(() => setErro("Não foi possível carregar os modelos."))
      .finally(() => setCarregando(false))
  }, [open, instanceName])

  const modelo = modelos.find((m) => `${m.nome}|${m.idioma}` === escolhido)
  useEffect(() => { setVars(Array.from({ length: modelo?.variaveis ?? 0 }, () => "")) }, [escolhido, modelo?.variaveis])

  async function enviar() {
    if (!modelo) return
    setEnviando(true)
    try {
      const r = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceName, telefone, modelo: { nome: modelo.nome, idioma: modelo.idioma, variaveis: vars, corpo: modelo.corpo } }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || "Falha ao enviar o modelo")
      toast("Modelo enviado.")
      onEnviado(); onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao enviar o modelo", "error")
    } finally { setEnviando(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Enviar modelo (API oficial)">
      <div className="flex flex-col gap-3">
        {carregando && <p className="text-sm text-muted-foreground">Carregando modelos…</p>}
        {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        {!carregando && !erro && modelos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo aprovado ainda. Crie e aprove modelos no Gerenciador do WhatsApp (Meta).</p>}
        {modelos.length > 0 && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mp-mod">Modelo</Label>
              <Select id="mp-mod" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
                {modelos.map((m) => <option key={`${m.nome}|${m.idioma}`} value={`${m.nome}|${m.idioma}`}>{m.nome} ({m.idioma}{m.categoria ? ` · ${m.categoria.toLowerCase()}` : ""})</option>)}
              </Select>
            </div>
            {vars.map((v, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Label htmlFor={`mp-v${i}`}>Variável {`{{${i + 1}}}`}</Label>
                <Input id={`mp-v${i}`} value={v} onChange={(e) => setVars((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
              </div>
            ))}
            {modelo && <p className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">{renderizarModelo(modelo.corpo, vars) || "(sem texto)"}</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={enviar} disabled={enviando || !modelo || vars.some((v) => !v.trim())}>{enviando ? "Enviando…" : "Enviar modelo"}</Button>
        </div>
      </div>
    </Dialog>
  )
}
