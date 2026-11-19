"use client"

import { useState } from "react"
import { Plug, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Input, Label } from "@/components/ui/primitives"
import { MAX_NAO_ENTENDIDAS, MAX_TENTATIVAS_IDENTIDADE } from "@/lib/assistente"

const CAPACIDADES = [
  { id: "boleto", rotulo: "Segunda via de boleto", desc: "Envia linha digitável e PDF dos boletos em aberto." },
  { id: "informe", rotulo: "Informe de rendimentos", desc: "Entrega o informe do ano-base (proprietários)." },
  { id: "reajuste", rotulo: "Reajustes", desc: "Informa índice, data e estimativa do reajuste." },
  { id: "contrato", rotulo: "Consulta de contratos", desc: "Vigência, valor e aviso de renovação." },
  { id: "faq", rotulo: "Perguntas frequentes", desc: "Responde dúvidas comuns sem exigir identificação." },
  { id: "encaminhar", rotulo: "Encaminhamento por departamento", desc: "Manutenção, locação, vendas e captação geram protocolo." },
]

export function Configuracoes() {
  const [ativas, setAtivas] = useState<Record<string, boolean>>(() => Object.fromEntries(CAPACIDADES.map((c) => [c.id, true])))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle>O que o assistente pode fazer</CardTitle><p className="text-xs text-muted-foreground">Somente leitura: o assistente nunca altera dados no Immobillis.</p></CardHeader>
        <CardContent className="space-y-3">
          {CAPACIDADES.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <input type="checkbox" className="mt-1 size-4" checked={ativas[c.id]} onChange={(e) => setAtivas((a) => ({ ...a, [c.id]: e.target.checked }))} />
              <span><span className="block text-sm font-medium">{c.rotulo}</span><span className="block text-xs text-muted-foreground">{c.desc}</span></span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Visualização apenas. A gravação das preferências será ligada junto com o banco.</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Plug className="size-4" /> Integração Immobillis <Badge variant="amber">não conectada</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Hoje o assistente usa um provedor simulado. A conexão real será habilitada quando a documentação da API estiver disponível.</p>
            <div><Label>URL da API</Label><Input disabled placeholder="https://…" /></div>
            <div><Label>Chave de acesso</Label><Input disabled type="password" placeholder="Definida no servidor, nunca no navegador" /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Segurança e escalada</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>• Dados financeiros só após confirmar os 4 últimos dígitos do CPF/CNPJ.</p>
            <p>• Até <strong>{MAX_TENTATIVAS_IDENTIDADE}</strong> tentativas de confirmação, depois a conversa vai para a equipe.</p>
            <p>• Após <strong>{MAX_NAO_ENTENDIDAS}</strong> mensagens não entendidas, o assistente transfere.</p>
            <p>• Número não cadastrado nunca recebe dados: é encaminhado à equipe.</p>
            <p>• Falha no Immobillis: o cliente recebe aviso simples e protocolo, sem erro técnico.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
