"use client"
import { cn } from "@/lib/utils"

const CORES = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600", "bg-orange-600"]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function iniciais(nome: string) {
  const p = nome.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "#"
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase()
}

/** Avatar redondo com iniciais e cor estável por contato (como no WhatsApp). */
export function Avatar({ nome, chave, tamanho = "md" }: { nome: string; chave?: string; tamanho?: "sm" | "md" }) {
  const cor = CORES[hash(chave || nome) % CORES.length]
  return (
    <span aria-hidden className={cn("flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white", cor, tamanho === "sm" ? "size-8 text-xs" : "size-11 text-sm")}>
      {iniciais(nome)}
    </span>
  )
}
