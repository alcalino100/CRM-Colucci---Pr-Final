"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Copy, ShieldCheck, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, useToast } from "@/components/ui/primitives"
import { WhatsappOficialTestes } from "@/components/whatsapp-oficial-testes"

type Canal = { id: string; nome: string; phone_number_id: string; waba_id: string | null; numero: string | null; nome_verificado: string | null; qualidade: string | null; ativo: boolean; modo?: string; ai_agent_id?: string | null }
type Dados = { canais: Canal[]; agentes?: { id: string; name: string }[]; configuracao: { token: boolean; appSecret: boolean; verifyToken: boolean }; webhookUrl: string; aviso?: string }

const Item = ({ ok, texto }: { ok: boolean; texto: string }) => (
  <li className="flex items-center gap-2 text-sm">
    {ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-destructive" />}
    <span className={ok ? "" : "text-muted-foreground"}>{texto}</span>
  </li>
)

/** Configuração da WhatsApp Cloud API (Meta): checklist do servidor, URL do webhook e números cadastrados. */
export function WhatsappOficialCard() {
  const toast = useToast()
  const [dados, setDados] = useState<Dados | null>(null)
  const [nome, setNome] = useState("")
  const [phoneId, setPhoneId] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/oficial/canais")
      const j = await r.json()
      if (r.ok) setDados(j)
    } catch { /* tela mostra estado vazio */ }
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const r = await fetch("/api/whatsapp/oficial/canais", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, phoneNumberId: phoneId, wabaId }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || "Falha ao cadastrar")
      toast("Número cadastrado e validado na Meta.")
      setNome(""); setPhoneId(""); setWabaId("")
      await carregar()
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao cadastrar", "error")
    } finally { setSalvando(false) }
  }

  async function alternar(c: Canal) {
    await fetch("/api/whatsapp/oficial/canais", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, ativo: !c.ativo }) })
    await carregar()
  }

  async function mudarModo(c: Canal, modo: string, aiAgentId?: string) {
    try {
      const r = await fetch("/api/whatsapp/oficial/canais", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, modo, aiAgentId }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || "Falha ao salvar")
      toast("Modo de atendimento salvo.")
      await carregar()
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao salvar", "error")
    }
  }

  const copiar = (t: string) => { void navigator.clipboard?.writeText(t); toast("Copiado.") }
  const cfg = dados?.configuracao

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-5 text-emerald-600" />
          API Oficial do WhatsApp (Meta) · disparos em volume
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {dados?.aviso && <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{dados.aviso}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">1. Servidor (variáveis na Vercel)</h3>
            <ul className="flex flex-col gap-1.5">
              <Item ok={!!cfg?.token} texto="WHATSAPP_CLOUD_TOKEN (token permanente do usuário do sistema)" />
              <Item ok={!!cfg?.appSecret} texto="META_APP_SECRET (segredo do app da Meta)" />
              <Item ok={!!cfg?.verifyToken} texto="WHATSAPP_CLOUD_VERIFY_TOKEN (palavra-chave que você escolhe)" />
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">2. Webhook (cole no painel da Meta)</h3>
            <div className="flex items-center gap-2">
              <Input readOnly value={dados?.webhookUrl ?? ""} className="h-8 text-xs" aria-label="URL do webhook" />
              <Button type="button" variant="outline" size="sm" onClick={() => copiar(dados?.webhookUrl ?? "")}><Copy className="size-3.5" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Campo de verificação = o valor de WHATSAPP_CLOUD_VERIFY_TOKEN. Assine o campo <b>messages</b>.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">3. Números cadastrados</h3>
          {(dados?.canais ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum número ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dados!.canais.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span>
                    <b>{c.nome}</b> · {c.numero ?? "—"} {c.nome_verificado ? `· ${c.nome_verificado}` : ""} {c.qualidade ? `· qualidade ${c.qualidade}` : ""}
                    <span className="ml-2 text-xs text-muted-foreground">ID {c.phone_number_id}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Select value={c.modo ?? "manual"} onChange={(e) => (e.target.value === "ia" ? undefined : mudarModo(c, e.target.value))} className="h-8 w-52 text-xs" aria-label="Modo de atendimento">
                      <option value="manual">Manual (pessoas no Inbox)</option>
                      <option value="assistente">Assistente Virtual (Betina)</option>
                      <option value="ia" disabled={(dados?.agentes ?? []).length === 0}>IA conversacional (escolha o agente →)</option>
                    </Select>
                    {(dados?.agentes ?? []).length > 0 && (
                      <Select value={c.ai_agent_id ?? ""} onChange={(e) => e.target.value && mudarModo(c, "ia", e.target.value)} className="h-8 w-44 text-xs" aria-label="Agente de IA">
                        <option value="">Agente de IA…</option>
                        {dados!.agentes!.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => alternar(c)}>{c.ativo ? "Desativar" : "Ativar"}</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={cadastrar} className="mt-1 grid gap-2 md:grid-cols-4">
            <div className="flex flex-col gap-1"><Label htmlFor="of-nome">Nome interno</Label><Input id="of-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Disparos Colucci" /></div>
            <div className="flex flex-col gap-1"><Label htmlFor="of-phone">Phone Number ID</Label><Input id="of-phone" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="Só números" inputMode="numeric" /></div>
            <div className="flex flex-col gap-1"><Label htmlFor="of-waba">WABA ID (opcional)</Label><Input id="of-waba" value={wabaId} onChange={(e) => setWabaId(e.target.value)} inputMode="numeric" /></div>
            <div className="flex items-end"><Button type="submit" disabled={salvando || !nome.trim() || !phoneId.trim()}>{salvando ? "Validando…" : "Cadastrar e validar"}</Button></div>
          </form>
          <p className="text-xs text-muted-foreground">As conversas deste número aparecem no Inbox, no seletor de instância, como “(API oficial)”. O modo decide quem responde: pessoas, o Assistente Virtual ou um agente de IA (cada um com as próprias travas de segurança).</p>
        </div>

        <WhatsappOficialTestes canais={dados?.canais ?? []} />
      </CardContent>
    </Card>
  )
}
