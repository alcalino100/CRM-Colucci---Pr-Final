"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Lock, Mail } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { homeDaRole } from "@/lib/roles"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/primitives"

export default function LoginForm() {
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
    router.push(res.role ? homeDaRole(res.role) : "/painel-corretor")
  }

  return (
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

      <Button type="submit" disabled={loading} className="mt-1 h-11 w-full text-sm font-semibold">
        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
        Entrar
      </Button>
    </form>
  )
}
