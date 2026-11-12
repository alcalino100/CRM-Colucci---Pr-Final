"use client"

import { Search } from "lucide-react"
import { Card, CardContent, Input, Select } from "@/components/ui/primitives"
import { MOTIVOS_ARQUIVAMENTO, MOTIVO_ARQUIVAMENTO_LABEL, ORIGENS } from "@/lib/mock-data"

export function ArquivadosFilterBar({
  busca,
  setBusca,
  isGestor,
  filtroCorretor,
  setFiltroCorretor,
  filtroMotivo,
  setFiltroMotivo,
  filtroReaparece,
  setFiltroReaparece,
  filtroOrigem,
  setFiltroOrigem,
  dataInicioCustom,
  setDataInicioCustom,
  dataFimCustom,
  setDataFimCustom,
  corretores,
}: {
  busca: string
  setBusca: (v: string) => void
  isGestor: boolean
  filtroCorretor: string
  setFiltroCorretor: (v: string) => void
  filtroMotivo: string
  setFiltroMotivo: (v: string) => void
  filtroReaparece: string
  setFiltroReaparece: (v: string) => void
  filtroOrigem: string
  setFiltroOrigem: (v: string) => void
  dataInicioCustom: string
  setDataInicioCustom: (v: string) => void
  dataFimCustom: string
  setDataFimCustom: (v: string) => void
  corretores: { id: string; nome: string }[]
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {/* Busca textual */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, fone, obs..."
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar lead arquivado"
            />
          </div>

          {/* Corretor (apenas gestor pode escolher outros) */}
          {isGestor ? (
            <Select
              value={filtroCorretor}
              onChange={(e) => setFiltroCorretor(e.target.value)}
              aria-label="Filtrar por corretor"
            >
              <option value="todos">Todos os corretores</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
              <span className="truncate">Meus leads arquivados</span>
            </div>
          )}

          {/* Motivo */}
          <Select
            value={filtroMotivo}
            onChange={(e) => setFiltroMotivo(e.target.value)}
            aria-label="Filtrar por motivo"
          >
            <option value="todos">Todos os motivos</option>
            {MOTIVOS_ARQUIVAMENTO.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_ARQUIVAMENTO_LABEL[m]}
              </option>
            ))}
          </Select>

          {/* Reaparecimento */}
          <Select
            value={filtroReaparece}
            onChange={(e) => setFiltroReaparece(e.target.value)}
            aria-label="Filtrar por data de reaparecimento"
          >
            <option value="todos">Todo o cronograma</option>
            <option value="vencidos">Vencidos (hoje ou antes)</option>
            <option value="proximos_30d">Próximos 30 dias</option>
            <option value="este_mes">Este mês</option>
            <option value="proximos_6m">Próximos 6 meses</option>
            <option value="custom">Personalizado...</option>
          </Select>

          {/* Origem */}
          <Select
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value)}
            aria-label="Filtrar por origem"
          >
            <option value="todas">Todas as origens</option>
            {ORIGENS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </div>

        {/* Filtro de datas personalizado */}
        {filtroReaparece === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Período de reaparecimento:</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">De:</span>
              <Input
                type="date"
                className="w-auto h-8 text-xs"
                value={dataInicioCustom}
                onChange={(e) => setDataInicioCustom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Até:</span>
              <Input
                type="date"
                className="w-auto h-8 text-xs"
                value={dataFimCustom}
                onChange={(e) => setDataFimCustom(e.target.value)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
