"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import {
  BRAND_DEFAULTS,
  FONTES_TEXTO,
  FONTES_TITULO,
  applyBrand,
  loadBrand,
  saveBrand,
  type BrandSettings,
} from "@/lib/master"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  useToast,
} from "@/components/ui/primitives"
import { btn } from "./MasterUiAtoms"

export function MarcaSection() {
  const toast = useToast()
  const { user } = useAuth()
  const [form, setForm] = useState<BrandSettings>(BRAND_DEFAULTS)
  const [faltaTabela, setFaltaTabela] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null)

  useEffect(() => {
    loadBrand().then((r) => {
      setForm(r.settings)
      setFaltaTabela(r.faltaTabela)
      applyBrand(r.settings)
    })
  }, [])

  const salvar = async () => {
    setSaving(true)
    const r = await saveBrand(form)
    setSaving(false)
    if (!r.ok) {
      toast(`Falha ao salvar: ${r.erro}`, "error")
      return
    }
    applyBrand(form)
    toast("Marca aplicada.")
  }

  const enviarArquivo = async (kind: "logo" | "favicon", file: File) => {
    setUploading(kind)
    try {
      const buf = await file.arrayBuffer()
      let bin = ""
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      const r = await fetch("/api/master/brand-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email ?? "",
          kind,
          filename: file.name,
          mime: file.type,
          dataBase64: btoa(bin),
        }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || "falha")
      const patch = kind === "logo" ? { logo_url: j.url as string } : { favicon_url: j.url as string }
      setForm((f) => ({ ...f, ...patch }))
      toast(`${kind === "logo" ? "Logo" : "Favicon"} enviado — salve para aplicar.`)
    } catch (e) {
      toast(`Falha no upload: ${e instanceof Error ? e.message : e}`, "error")
    }
    setUploading(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marca (white-label)</CardTitle>
      </CardHeader>
      <CardContent>
        {faltaTabela && (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            Tabela <code>workspace_settings</code> ainda não existe — rode{" "}
            <code>scripts/026_workspace_settings.sql</code> no SQL Editor do Supabase e recarregue.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Nome da marca</Label>
            <Input
              value={form.brand_name}
              onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>URL da logo (ou envie abaixo)</Label>
            <Input
              value={form.logo_url ?? ""}
              placeholder="https://..."
              onChange={(e) => setForm({ ...form, logo_url: e.target.value || null })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Favicon (URL ou envio)</Label>
            <Input
              value={form.favicon_url ?? ""}
              placeholder="https://..."
              onChange={(e) => setForm({ ...form, favicon_url: e.target.value || null })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Fonte dos títulos</Label>
            <Select
              value={form.fonte_titulo}
              onChange={(e) => setForm({ ...form, fonte_titulo: e.target.value })}
            >
              {FONTES_TITULO.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Fonte dos textos</Label>
            <Select
              value={form.fonte_texto}
              onChange={(e) => setForm({ ...form, fonte_texto: e.target.value })}
            >
              {FONTES_TEXTO.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Cor primária</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.cor_primaria}
                onChange={(e) => setForm({ ...form, cor_primaria: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
              />
              <Input
                value={form.cor_primaria}
                onChange={(e) => setForm({ ...form, cor_primaria: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Link do site</Label>
            <Input
              value={form.links.site}
              onChange={(e) =>
                setForm({ ...form, links: { ...form.links, site: e.target.value } })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Instagram</Label>
            <Input
              value={form.links.instagram}
              onChange={(e) =>
                setForm({ ...form, links: { ...form.links, instagram: e.target.value } })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Suporte (WhatsApp)</Label>
            <Input
              value={form.links.suporte}
              onChange={(e) =>
                setForm({ ...form, links: { ...form.links, suporte: e.target.value } })
              }
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={salvar} disabled={saving} className={btn(true)}>
            {saving ? "Salvando..." : "Salvar e aplicar"}
          </button>
          <Label className={btn()}>
            Enviar logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) enviarArquivo("logo", f)
                e.target.value = ""
              }}
            />
          </Label>
          <Label className={btn()}>
            Enviar favicon
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/x-icon,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) enviarArquivo("favicon", f)
                e.target.value = ""
              }}
            />
          </Label>
          {uploading && (
            <span className="text-xs text-muted-foreground">Enviando {uploading}...</span>
          )}
          {form.logo_url && (
            <img
              src={form.logo_url}
              alt="logo"
              className="h-9 w-auto rounded border border-border bg-white px-2 py-1"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
