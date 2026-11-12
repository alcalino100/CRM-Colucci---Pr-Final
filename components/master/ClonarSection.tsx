"use client"

import { supabase } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, Label, Textarea, useToast } from "@/components/ui/primitives"
import { btn } from "./MasterUiAtoms"

export function ClonarSection() {
  const toast = useToast()

  const exportar = async () => {
    try {
      const get = async (t: string, sel = "*") =>
        (await supabase.from(t).select(sel).limit(5000)).data ?? []
      const pack = {
        exportado_em: new Date().toISOString(),
        workspace_settings: await get("workspace_settings"),
        pipeline_stages: await get("pipeline_stages"),
        ai_agents: await get("ai_agents"),
        automations: await get("automations"),
        automation_message_templates: await get("automation_message_templates"),
      }
      const blob = new Blob([JSON.stringify(pack, null, 1)], { type: "application/json" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `crm-clone-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast("Pacote de clone baixado.")
    } catch {
      toast("Falha ao exportar.", "error")
    }
  }

  const importar = async (f: File) => {
    try {
      const pack = JSON.parse(await f.text()) as Record<string, { id?: string }[]>
      for (const t of [
        "workspace_settings",
        "pipeline_stages",
        "ai_agents",
        "automations",
        "automation_message_templates",
      ] as const) {
        const rows = pack[t] ?? []
        for (const row of rows) {
          const { error } = await supabase.from(t).upsert(row, { onConflict: "id" })
          if (error) throw new Error(`${t}: ${error.message}`)
        }
      }
      toast("Clone restaurado.")
    } catch (e) {
      toast(`Falha: ${e instanceof Error ? e.message : e}`, "error")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clonar workspace</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-muted-foreground">
          Exporta marca + IAs + automações + templates em JSON. Importar restaura por id
          (sobrescreve). Infra (projeto Vercel + banco novo) segue roteiro à parte.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportar} className={btn(true)}>
            Exportar clone
          </button>
          <Label className={btn()}>
            Importar clone
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importar(f)
                e.target.value = ""
              }}
            />
          </Label>
        </div>
        <Textarea
          readOnly
          rows={6}
          className="mt-3 text-[11px]"
          value={
            "Roteiro infra do clone:\n1. Novo projeto no Supabase → rode scripts/002..026 em ordem\n2. Novo projeto na Vercel (mesmo repo/branch) + envs\n3. Importe este JSON no Master do novo CRM\n4. Reconecte Evolution/Meta"
          }
        />
      </CardContent>
    </Card>
  )
}
