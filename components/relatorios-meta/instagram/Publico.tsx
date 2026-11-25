"use client"
import { ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives"
import { inteiro, pct } from "../util"
import { BarrasLista, Painel, Vazio } from "./Graficos"
import type { DadosInstagram } from "./types"

/** Perfil do público, hashtags e stories ativos. */
export function Publico({ d }: { d: DadosInstagram }) {
  const demo = d.demografia
  const totalGenero = (demo?.generos ?? []).reduce((a, x) => a + x.valor, 0) || 1
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Painel titulo="Quem acompanha você" sub="Perfil dos seguidores (a Meta exige 100+ seguidores)">
        {!demo ? <Vazio texto="A Meta não liberou o perfil do público para esta conta." /> : (
          <div className="flex flex-col gap-4">
            {demo.generos.length > 0 && <div><p className="mb-1.5 text-xs font-semibold">Gênero</p><BarrasLista itens={demo.generos.map((g) => ({ rotulo: g.rotulo, valor: g.valor, extra: `${Math.round((g.valor / totalGenero) * 100)}%` }))} cor="#7c3aed" /></div>}
            {demo.faixasEtarias.length > 0 && <div><p className="mb-1.5 text-xs font-semibold">Faixa etária</p><BarrasLista itens={demo.faixasEtarias} cor="#0284c7" /></div>}
            {demo.cidades.length > 0 && <div><p className="mb-1.5 text-xs font-semibold">Principais cidades</p><BarrasLista itens={demo.cidades} cor="#059669" /></div>}
          </div>
        )}
      </Painel>

      <Painel titulo="Hashtags" sub="Mais usadas e o engajamento dos posts em que aparecem">
        {d.analise.hashtags.length === 0 ? <Vazio texto="Nenhuma hashtag nas legendas do período." /> : (
          <ul className="flex flex-col gap-1.5">
            {d.analise.hashtags.map((h) => (
              <li key={h.tag} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                <span className="truncate font-medium text-primary">{h.tag}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{h.posts} post(s) · <b className="text-foreground">{pct(h.taxaEngajamentoMedia)}</b></span>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Stories no ar agora</CardTitle><p className="text-xs text-muted-foreground">A Meta só mostra os stories das últimas 24h</p></CardHeader>
        <CardContent>
          {d.stories.length === 0 ? <Vazio texto="Nenhum story ativo no momento." /> : (
            <ul className="flex flex-col gap-2">
              {d.stories.map((s) => (
                <li key={s.id}>
                  <a href={s.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-border p-2 hover:bg-muted/40">
                    {s.miniatura ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.miniatura} alt="" className="h-16 w-10 shrink-0 rounded object-cover" loading="lazy" /> : <div className="h-16 w-10 shrink-0 rounded bg-muted" />}
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="flex items-center gap-1 font-semibold">{new Date(s.publicadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}<ExternalLink className="size-3 text-muted-foreground" /></p>
                      <p className="text-muted-foreground">Alcance {inteiro(s.alcance)} · visualizações {inteiro(s.visualizacoes)} · respostas {inteiro(s.respostas)}</p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
