"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives"

export function Analytics({ id }: { id: string }){
  return (
    <div className="grid gap-4">
      <Card><CardHeader><CardTitle>Analytics</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-2xl font-bold">128</p><p className="text-xs text-muted-foreground">Respostas IA</p></div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-2xl font-bold">12</p><p className="text-xs text-muted-foreground">Escalados</p></div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-2xl font-bold">320</p><p className="text-xs text-muted-foreground">Tokens</p></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Fase 3 vai plugar logs reais de `conversations` e `messages` para popular aqui.</p>
        </CardContent>
      </Card>
    </div>
  )
}
