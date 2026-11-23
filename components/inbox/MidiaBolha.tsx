"use client"
import { FileText, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type MidiaInfo = {
  tipo?: "image" | "audio" | "video" | "document" | "sticker" | null
  url?: string | null
  nome?: string | null
}

/** Renderiza a mídia de uma mensagem. Enquanto o arquivo ainda baixa da Evolution (url nula), mostra um carregamento. */
export function MidiaBolha({ midia }: { midia: MidiaInfo }) {
  const { tipo, url, nome } = midia
  if (!tipo) return null
  if (!url) {
    return (
      <div className="mb-1 flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs opacity-80">
        <Loader2 className="size-3.5 animate-spin" /> carregando mídia…
      </div>
    )
  }
  if (tipo === "image" || tipo === "sticker") {
    // eslint-disable-next-line @next/next/no-img-element
    return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Imagem" className={cn("mb-1 rounded-lg object-cover", tipo === "sticker" ? "size-28" : "max-h-64 w-full")} /></a>
  }
  if (tipo === "audio") return <audio controls src={url} className="mb-1 w-56 max-w-full" />
  if (tipo === "video") return <video controls src={url} className="mb-1 max-h-64 w-full rounded-lg" />
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm underline-offset-2 hover:underline">
      <FileText className="size-4 shrink-0" />
      <span className="truncate">{nome || "Abrir documento"}</span>
    </a>
  )
}
