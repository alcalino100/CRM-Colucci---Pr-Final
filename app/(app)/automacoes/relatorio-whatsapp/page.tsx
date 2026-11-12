"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function RelatorioWhatsappRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/relatorios")
  }, [router])

  return (
    <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
      Redirecionando para Relatórios Automáticos no WhatsApp...
    </div>
  )
}
