"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Lock, Mail } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/primitives"

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!email || !senha) {
      setError("Preencha e-mail e senha.")
      return
    }
    setLoading(true)
    const res = await login(email, senha)
    setLoading(false)
    if (!res.ok) {
      setError("Credenciais inválidas. Verifique e-mail e senha.")
      return
    }
    router.push(res.role === "gestor" ? "/dashboard-gestao" : "/painel-corretor")
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-primary/95 p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-1/4 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-[-6rem] left-1/4 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute right-[-4rem] top-1/2 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      </div>
      <div className="shine relative w-full max-w-md rounded-2xl bg-card p-8 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.4)]">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo-colucci.png" alt="Colucci Imóveis" className="mb-5 h-20 w-auto" />
          <p className="text-sm text-muted-foreground">Acesse sua conta para continuar</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@imob.com" className="pl-9" aria-label="E-mail" autoComplete="email" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="senha">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••" className="pl-9" aria-label="Senha" autoComplete="current-password" />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" disabled={loading} size="lg" className="shine mt-2 h-11 w-full shadow-[0_10px_28px_-8px_rgb(178_34_34/0.55)]">
            {loading ? <><Loader2 className="size-4 animate-spin" /> Entrando...</> : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Contas de teste (senha: 123456)</p>
          <p className="mt-1">Gestor: ana@imob.com · Corretor: beatriz@imob.com</p>
        </div>
      </div>
    </main>
  )
}
