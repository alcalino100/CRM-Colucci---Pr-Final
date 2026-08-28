// =============================================================================
// automation/node-config.tsx — Formulário do bloco selecionado (RHF + Zod).
// =============================================================================

"use client"

import { useEffect, useMemo, useRef } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertTriangle, Eye, Sparkles, Trash2, X } from "lucide-react"
import { NODE_TYPES, buildNodeSchema, previewMensagem, VARIAVEIS_PREVIEW, categoriaDe, NODE_ICONS } from "@/lib/flow/palette"
import { useFlowStore } from "@/lib/flow/flow-store"
import type { FieldValue, FlowNode } from "@/lib/flow/types"
import { useToast } from "@/components/ui/primitives"

interface Props {
  flowId: string
  nodeId: string
  onClose: (open: boolean) => void
}

interface NodeFormValues {
  nome: string
  config: Record<string, unknown>
}

export default function NodeConfig({ flowId, nodeId, onClose }: Props) {
  const flow = useFlowStore((s) => s.flows[flowId])
  const updateNode = useFlowStore((s) => s.updateNode)
  const removeNode = useFlowStore((s) => s.removeNode)
  const toast = useToast()
  const prevNodeId = useRef(nodeId)

  const node: FlowNode | undefined = flow?.nodes.find((n) => n.id === nodeId)

  const schema = useMemo(() => (node ? buildNodeSchema(NODE_TYPES[node.data.nodeType]) : z.object({})), [node])

  const def = node ? NODE_TYPES[node.data.nodeType] : null
  const cat = node ? categoriaDe(node.data.nodeType) : null
  const Icon = node ? NODE_ICONS[node.data.nodeType] : null

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<NodeFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<NodeFormValues>,
    defaultValues: {
      nome: node?.data.nome ?? "",
      config: node?.data.config ?? {},
    },
  })

  const configWatched = watch("config")
  const fields = def?.fields ?? []

  // Troca de nó selecionado → refaz o form
  useEffect(() => {
    if (!node) return
    if (prevNodeId.current !== nodeId) {
      reset({ nome: node.data.nome, config: node.data.config }, { keepDefaultValues: false })
      prevNodeId.current = nodeId
    }
  }, [node, nodeId, reset])

  useEffect(() => {
    if (!node) {
      onClose(false)
    }
  }, [node, onClose])

  if (!node || !def || !cat || !Icon) return null

  const primoTexto = fields.find((f) => f.kind === "textarea")?.key

  const inserirVariavel = (key: string) => {
    const alvo = primoTexto ?? fields[0]?.key
    if (!alvo) return
    const path = `config.${alvo}`
    const atual = String(configWatched?.[alvo] ?? "")
    setValue(path as keyof NodeFormValues, `${atual}${atual.endsWith(" ") || atual === "" ? "" : " "}${key} `)
  }

  const onSubmit = handleSubmit((vals) => {
    updateNode(flowId, nodeId, {
      nome: String(vals.nome).trim() || node.data.nome,
      config: (vals.config ?? {}) as Record<string, FieldValue>,
    })
    toast(`Bloco "${vals.nome || def.label}" atualizado`)
    onClose(false)
  })

  const onDelete = () => {
    removeNode(flowId, nodeId)
    toast("Bloco removido do fluxo", "error")
    onClose(false)
  }

  const primeiroTexto = fields.find((f) => f.kind === "textarea")?.key
  const mensagem = String(configWatched?.[primeiroTexto ?? ""] ?? "")
  const temPreview = !!def.supportsVariables && !!primeiroTexto && mensagem.trim().length > 0
  const errosGerais = Object.values(errors).filter((e) => e && "message" in e)

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${cat.color}22`, color: cat.color }}>
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-100">Configurar bloco</h3>
          <p className="truncate text-[11px] text-zinc-500">{def.label}</p>
        </div>
        <button onClick={() => onClose(false)} aria-label="Fechar" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
          <X size={15} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Nome do bloco" required error={errors.nome?.message as string}>
          <input
            {...register("nome")}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-600"
            placeholder={def.label}
          />
        </Field>

        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} error={(errors.config?.[f.key] as any)?.message} help={f.help} suffix={f.suffix}>
            {f.kind === "textarea" ? (
              <>
                <textarea
                  {...register(`config.${f.key}`)}
                  rows={f.key === "corpo" ? 5 : 3}
                  placeholder={f.placeholder}
                  className={`w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-600 ${f.mono ? "font-mono" : ""} ${f.key === "mensagem" ? "min-h-24" : ""}`}
                />
                {def.supportsVariables && (
                  <SelectVariaveis onUse={inserirVariavel} />
                )}
              </>
            ) : f.kind === "select" ? (
              <select
                {...register(`config.${f.key}`)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-600"
              >
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o} className="bg-zinc-900">{fieldLabel(f, o)}</option>
                ))}
              </select>
            ) : f.kind === "number" || f.kind === "percent" ? (
              <div className="relative">
                <input
                  {...register(`config.${f.key}`)}
                  type="number"
                  min={f.kind === "percent" ? 0 : 0}
                  max={f.kind === "percent" ? 100 : undefined}
                  step={f.kind === "percent" ? 5 : 1}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 pr-10 text-xs text-zinc-100 outline-none focus:border-cyan-600"
                />
                {f.suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">{f.suffix || "%"}</span>}
              </div>
            ) : f.kind === "json" ? (
              <textarea
                {...register(`config.${f.key}`)}
                rows={4}
                placeholder={f.placeholder ?? '{"key": "value"}'}
                className={`w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[11px] text-zinc-100 outline-none focus:border-cyan-600 ${(errors.config?.[f.key] as any) ? "border-red-500/70" : ""}`}
              />
            ) : (
              <input
                {...register(`config.${f.key}`)}
                placeholder={f.placeholder}
                className={`w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-600 ${f.mono ? "font-mono" : ""}`}
              />
            )}
          </Field>
        ))}

        {temPreview && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              <Eye size={11} /> Preview ao vivo
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-zinc-900/70 px-2.5 py-2 text-xs leading-relaxed text-zinc-300">
              {previewMensagem(mensagem)}
            </p>
          </div>
        )}

        {errosGerais.length > 0 && def.branching === "split" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-300">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>A soma dos percursos deve ser 100%.</span>
          </div>
        )}
      </form>

      <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-3">
        <button
          onClick={onDelete}
          type="button"
          className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-800 text-zinc-500 hover:border-red-600/60 hover:text-red-400"
          title="Excluir bloco"
        >
          <Trash2 size={15} />
        </button>
        <button type="button" onClick={() => onClose(false)} className="flex-1 rounded-lg border border-zinc-800 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200">
          Cancelar
        </button>
        <button type="submit" className="flex-1 rounded-lg bg-cyan-500 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400">
          Salvar
        </button>
      </div>
    </aside>
  )
}

function Field({ label, required, error, help, suffix, children }: { label: string; required?: boolean; error?: string; help?: string; suffix?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-zinc-300">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        {suffix && !error && <span className="text-[10px] text-zinc-600">{suffix}</span>}
      </div>
      {children}
      {help && !error && <p className="text-[10px] leading-relaxed text-zinc-600">{help}</p>}
      {error && <p className="flex items-center gap-1 text-[10px] text-red-400"><AlertTriangle size={10} /> {error}</p>}
    </div>
  )
}

function SelectVariaveis({ onUse }: { onUse: (key: string) => void }) {
  const chaves = Object.keys(VARIAVEIS_PREVIEW)
  return (
    <div className="flex flex-wrap items-center gap-1 pt-0.5">
      <span className="flex items-center gap-1 text-[10px] text-zinc-500"><Sparkles size={10} /> Variáveis:</span>
      {chaves.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onUse(k)}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 hover:border-cyan-600 hover:bg-zinc-800"
        >
          {k}
        </button>
      ))}
    </div>
  )
}

// Valor exibido em selects: usa o rótulo amigável quando existir
function fieldLabel(f: { key: string }, value: string): string {
  if (f.key === "operador") {
    const m: Record<string, string> = {
      equals: "igual a", not_equals: "diferente de", contains: "contém",
      not_contains: "não contém", greater_than: "maior que", less_than: "menor que",
    }
    return m[value] ?? value
  }
  return value
}