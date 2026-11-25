"use client"
import { useState } from "react"
import { Pencil, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge, Card, CardContent, CardHeader, CardTitle, Dialog, Input, Label, Select, useToast } from "@/components/ui/primitives"
import { chamar, type Canal, type DadosOficial } from "./use-oficial"

const MODOS: Record<string, string> = { manual: "Manual (pessoas no Inbox)", assistente: "Assistente Virtual (Betina)", ia: "IA conversacional" }

/** Números da API oficial: cadastrar, editar (nome, WABA ID, modo, agente), revalidar na Meta, ativar/desativar e remover. */
export function Numeros({ dados, recarregar }: { dados: DadosOficial; recarregar: () => Promise<void> }) {
  const toast = useToast()
  const [novo, setNovo] = useState({ nome: "", phoneId: "", wabaId: "" })
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<Canal | null>(null)
  const [form, setForm] = useState({ nome: "", wabaId: "", modo: "manual", aiAgentId: "" })
  const [removendo, setRemovendo] = useState<Canal | null>(null)

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true)
    const j = await chamar("/api/whatsapp/oficial/canais", "POST", { nome: novo.nome, phoneNumberId: novo.phoneId, wabaId: novo.wabaId })
    setSalvando(false)
    if (!j.ok) return toast(j.erro || "Falha ao cadastrar", "error")
    toast("Número cadastrado e validado na Meta."); setNovo({ nome: "", phoneId: "", wabaId: "" }); await recarregar()
  }

  function abrirEdicao(c: Canal) {
    setForm({ nome: c.nome, wabaId: c.waba_id ?? "", modo: c.modo ?? "manual", aiAgentId: c.ai_agent_id ?? "" })
    setEditando(c)
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setSalvando(true)
    const j = await chamar("/api/whatsapp/oficial/canais", "PATCH", { id: editando.id, nome: form.nome, wabaId: form.wabaId, modo: form.modo, aiAgentId: form.modo === "ia" ? form.aiAgentId : undefined })
    setSalvando(false)
    if (!j.ok) return toast(j.erro || "Falha ao salvar", "error")
    toast("Número atualizado."); setEditando(null); await recarregar()
  }

  async function revalidar(c: Canal) {
    const j = await chamar("/api/whatsapp/oficial/canais", "PATCH", { id: c.id, revalidar: true })
    toast(j.ok ? "Dados atualizados a partir da Meta." : j.erro || "Falha ao validar", j.ok ? undefined : "error")
    if (j.ok) await recarregar()
  }
  async function alternar(c: Canal) { await chamar("/api/whatsapp/oficial/canais", "PATCH", { id: c.id, ativo: !c.ativo }); await recarregar() }
  async function remover() {
    if (!removendo) return
    const j = await chamar(`/api/whatsapp/oficial/canais?id=${encodeURIComponent(removendo.id)}`, "DELETE")
    toast(j.ok ? "Número removido (o histórico de conversas foi mantido)." : j.erro || "Falha ao remover", j.ok ? undefined : "error")
    setRemovendo(null); if (j.ok) await recarregar()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Números cadastrados</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {dados.canais.length === 0 && <p className="text-sm text-muted-foreground">Nenhum número ainda. Cadastre o primeiro abaixo.</p>}
          {dados.canais.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.nome}</span>
                  <Badge variant={c.ativo ? "green" : "gray"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                  <Badge variant="gray">{MODOS[c.modo ?? "manual"] ?? c.modo}</Badge>
                  {c.qualidade && <Badge variant={c.qualidade === "GREEN" ? "green" : c.qualidade === "RED" ? "red" : "gray"}>qualidade {c.qualidade}</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => abrirEdicao(c)}><Pencil className="size-3.5" /> Editar</Button>
                  <Button size="sm" variant="outline" onClick={() => revalidar(c)}><RefreshCw className="size-3.5" /> Revalidar</Button>
                  <Button size="sm" variant="outline" onClick={() => alternar(c)}>{c.ativo ? "Desativar" : "Ativar"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setRemovendo(c)} aria-label="Remover número"><Trash2 className="size-3.5 text-destructive" /></Button>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="inline font-medium">Telefone: </dt><dd className="inline">{c.numero ?? "—"}</dd></div>
                <div><dt className="inline font-medium">Nome verificado: </dt><dd className="inline">{c.nome_verificado ?? "—"}</dd></div>
                <div><dt className="inline font-medium">Phone Number ID: </dt><dd className="inline font-mono">{c.phone_number_id}</dd></div>
                <div><dt className="inline font-medium">WABA ID: </dt><dd className={c.waba_id ? "inline font-mono" : "inline font-semibold text-destructive"}>{c.waba_id ?? "faltando — necessário para modelos"}</dd></div>
              </dl>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Cadastrar novo número</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={cadastrar} className="grid gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1"><Label htmlFor="n-nome">Nome interno *</Label><Input id="n-nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Disparos Colucci" /></div>
            <div className="flex flex-col gap-1"><Label htmlFor="n-pid">Phone Number ID *</Label><Input id="n-pid" value={novo.phoneId} onChange={(e) => setNovo({ ...novo, phoneId: e.target.value })} inputMode="numeric" /></div>
            <div className="flex flex-col gap-1"><Label htmlFor="n-waba">WABA ID</Label><Input id="n-waba" value={novo.wabaId} onChange={(e) => setNovo({ ...novo, wabaId: e.target.value })} inputMode="numeric" /></div>
            <div className="flex items-end"><Button type="submit" disabled={salvando || !novo.nome.trim() || !novo.phoneId.trim()}>{salvando ? "Validando…" : "Cadastrar e validar"}</Button></div>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Onde achar: developers.facebook.com › seu app › WhatsApp › Configuração da API (Phone Number ID e WABA ID aparecem abaixo do número).</p>
        </CardContent>
      </Card>

      <Dialog open={!!editando} onClose={() => setEditando(null)} title="Editar número">
        <form onSubmit={salvarEdicao} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1"><Label htmlFor="e-nome">Nome interno</Label><Input id="e-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="e-waba">WABA ID</Label><Input id="e-waba" value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} inputMode="numeric" /></div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-modo">Quem responde neste número</Label>
            <Select id="e-modo" value={form.modo} onChange={(e) => setForm({ ...form, modo: e.target.value })}>
              {Object.entries(MODOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          {form.modo === "ia" && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-ag">Agente de IA</Label>
              <Select id="e-ag" value={form.aiAgentId} onChange={(e) => setForm({ ...form, aiAgentId: e.target.value })}>
                <option value="">Escolha…</option>
                {dados.agentes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
          )}
          <p className="text-xs text-muted-foreground">O Phone Number ID não pode ser editado (ele identifica as conversas). Para trocar, cadastre outro número.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="submit" disabled={salvando || !form.nome.trim() || (form.modo === "ia" && !form.aiAgentId)}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!removendo} onClose={() => setRemovendo(null)} title="Remover número">
        <p className="text-sm">Remover <b>{removendo?.nome}</b> do CRM? As conversas já gravadas continuam no banco, mas o número some do Inbox e para de receber.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemovendo(null)}>Cancelar</Button>
          <Button onClick={remover} className="bg-destructive text-destructive-foreground">Remover</Button>
        </div>
      </Dialog>
    </div>
  )
}
