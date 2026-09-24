"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"

// Trava de papel para páginas Server Component (sem hooks de auth no servidor).
export function RequireGestor({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!loading && user && !isGestorNivel(user.role)) router.replace("/painel-corretor")
  }, [loading, user, router])
  if (loading || !user) return <div className="py-16 text-center text-muted-foreground">Carregando...</div>
  if (!isGestorNivel(user.role)) return null
  return <>{children}</>
}
