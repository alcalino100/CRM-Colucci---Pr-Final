"use client"

// Ponte de rastreio (Click-to-WhatsApp com UTM/fbc/fbp).
// O anúncio aponta para /r?wa=<telefone>&ref=<ref>&utm_campaign={{campaign.id}}&utm_adset={{adset.id}}&utm_ad={{ad.id}}
// Aqui: dispara o pixel Meta (gera _fbp), lê _fbc/_fbp/UTMs, registra o clique em rastreio_cliques
// e redireciona para o WhatsApp com um código curto no fim da mensagem pré-preenchida.
// O webhook casa o código com o clique e grava os dados no lead.
import { useEffect } from "react"

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "2053723892017546"
const NUMERO_PADRAO = process.env.NEXT_PUBLIC_WHATSAPP_NUMERO || ""

function cookieVal(nome: string): string {
  const m = new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`).exec(document.cookie)
  return m?.[1] ?? ""
}

function carregarPixel() {
  const w = window as any
  if (w.fbq) return
  w.fbq = function (...args: any[]) {
    ;(w.fbq.queue = w.fbq.queue || []).push(args)
  }
  w._fbq = w.fbq
  w.fbq.push = w.fbq
  w.fbq.loaded = true
  w.fbq.version = "2.0"
  w.fbq.queue = []
  const s = document.createElement("script")
  s.async = true
  s.defer = true
  s.src = "https://connect.facebook.net/en_US/fbevents.js"
  document.head.appendChild(s)
  w.fbq("init", PIXEL_ID)
  w.fbq("track", "PageView")
}

export default function RastreioPage() {
  useEffect(() => {
    let cancelado = false
    const params = new URLSearchParams(window.location.search)
    const wa = params.get("wa") || NUMERO_PADRAO
    const ref = params.get("ref") || ""
    const msgOverride = params.get("msg") || ""
    const fbclid = params.get("fbclid") || ""
    const utm = (n: string) => params.get(n) || ""

    carregarPixel()
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

    ;(async () => {
      // Aguarda o pixel gerar o cookie _fbp (até ~1,2s)
      let fbp = ""
      for (let i = 0; i < 12 && !cancelado; i++) {
        await esperar(100)
        fbp = cookieVal("_fbp")
        if (fbp) break
      }
      if (cancelado) return
      let fbc = cookieVal("_fbc")
      if (!fbc && fbclid) fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`

      const payload = {
        fbc: fbc || null,
        fbp: fbp || null,
        fbclid: fbclid || null,
        utm_source: utm("utm_source"),
        utm_medium: utm("utm_medium"),
        utm_campaign: utm("utm_campaign"),
        utm_term: utm("utm_term"),
        utm_content: utm("utm_content"),
      }

      let codigo = ""
      try {
        const res = await fetch("/api/meta/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const j = await res.json()
        if (j.click_id) codigo = String(j.click_id)
      } catch {
        // falha no rastreio não impede o redirecionamento
      }
      if (cancelado) return

      const texto = msgOverride ||
        `Olá! Vi o anúncio do imóvel${ref ? ` ${ref}` : ""}.${codigo ? ` Código: ${codigo}` : ""}`
      const destino = wa
        ? `https://wa.me/${String(wa).replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`
        : "/"
      window.location.href = destino
    })()

    return () => {
      cancelado = true
    }
  }, [])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6">
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Redirecionando para o WhatsApp…</p>
    </main>
  )
}
