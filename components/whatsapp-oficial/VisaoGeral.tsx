"use client"
import { useEffect, useState } from "react"
import { CheckCircle2, Circle, Copy, ExternalLink, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, Input, useToast } from "@/components/ui/primitives"
import { chamar, type DadosOficial } from "./use-oficial"

type Passo = { nome: string; ok: boolean; detalhe: string }

const Linha = ({ ok, titulo, ajuda }: { ok: boolean | null; titulo: string; ajuda?: React.ReactNode }) => (
  <li className="flex items-start gap-3 py-2">
    {ok === null ? <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" /> : ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />}
    <div className="min-w-0 text-sm"><p className="font-medium">{titulo}</p>{ajuda && <div className="text-xs text-muted-foreground">{ajuda}</div>}</div>
  </li>
)

/** Visão geral: checklist do que falta, URL do webhook e diagnóstico completo em um clique. */
export function VisaoGeral({ dados, irPara }: { dados: DadosOficial; irPara: (aba: string) => void }) {
  const toast = useToast()
  const [diag, setDiag] = useState<{ titulo: string; passos: Passo[] }[] | null>(null)
  const [rodando, setRodando] = useState(false)
  const [verificado, setVerificado] = useState<boolean | null>(null)
  const c = dados.configuracao

  useEffect(() => {
    chamar("/api/whatsapp/oficial/eventos", "GET").then((j) => {
      const ev: { tipo: string; resumo: string | null }[] = j.eventos ?? []
      setVerificado(ev.length === 0 ? null : ev.some((e) => e.tipo === "verificacao" && (e.resumo ?? "").includes("aceita")))
    })
  }, [])

  async function diagnostico() {
    setRodando(true)
    const [a, b] = await Promise.all([
      chamar("/api/whatsapp/oficial/testes", "POST", { acao: "config" }),
      chamar("/api/whatsapp/oficial/testes", "POST", { acao: "webhook" }),
    ])
    setDiag([{ titulo: "Configuração", passos: a.passos ?? [] }, { titulo: "Webhook", passos: b.passos ?? [] }])
    setRodando(false)
  }
  const copiar = (t: string) => { void navigator.clipboard?.writeText(t); toast("Copiado.") }
  const comWaba = dados.canais.some((x) => x.waba_id)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Checklist de implantação</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            <Linha ok={c.token} titulo="Token permanente (WHATSAPP_CLOUD_TOKEN)" ajuda="Vercel › Settings › Environment Variables (Production, sensível). Gere em business.facebook.com › Usuários do sistema." />
            <Linha ok={c.appSecret} titulo="Chave secreta do app (META_APP_SECRET)" ajuda="developers.facebook.com › seu app › Configurações › Básico." />
            <Linha ok={c.verifyToken} titulo="Token de verificação (WHATSAPP_CLOUD_VERIFY_TOKEN)" ajuda="Uma senha que você inventa; o mesmo valor vai no campo “Verificar token” do webhook na Meta." />
            <Linha ok={verificado} titulo="Webhook verificado pela Meta" ajuda={verificado === null ? "Ainda sem eventos: cole a URL ao lado no painel da Meta e assine o campo messages." : undefined} />
            <Linha ok={dados.canais.length > 0} titulo="Número cadastrado" ajuda={<button className="underline" onClick={() => irPara("numeros")}>Ir para Números</button>} />
            <Linha ok={comWaba} titulo="WABA ID informado (necessário para modelos)" ajuda={<button className="underline" onClick={() => irPara("numeros")}>Editar número</button>} />
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Depois de criar ou alterar variáveis na Vercel, faça um novo deploy para valerem.</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Webhook (cole na Meta)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center gap-2"><Input readOnly value={dados.webhookUrl} aria-label="URL de callback" className="h-9 text-xs" /><Button type="button" variant="outline" size="sm" onClick={() => copiar(dados.webhookUrl)}><Copy className="size-3.5" /></Button></div>
            <p className="text-xs text-muted-foreground">Em <b>WhatsApp › Configuração › Webhook</b>: “URL de callback” = acima; “Verificar token” = o valor de <code>WHATSAPP_CLOUD_VERIFY_TOKEN</code>. Depois, em “Campos do webhook”, assine <b>messages</b>. Para receber mensagens reais de clientes, o app precisa estar em modo <b>Live</b>.</p>
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">Abrir painel da Meta <ExternalLink className="size-3" /></a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Diagnóstico completo</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div><Button onClick={diagnostico} disabled={rodando}>{rodando ? "Rodando…" : "Rodar diagnóstico"}</Button></div>
            {diag?.map((g) => (
              <div key={g.titulo} className="rounded-lg border border-border p-3">
                <p className="mb-1 text-sm font-semibold">{g.titulo}</p>
                <ul className="flex flex-col gap-1">
                  {g.passos.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {p.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                      <span><b>{p.nome}</b> — <span className="text-muted-foreground">{p.detalhe}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
