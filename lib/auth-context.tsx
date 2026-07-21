"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { Role, User } from "./mock-data"
import { supabase } from "./supabase/client"

type SessionUser = Omit<User, "senha">

interface AuthCtx {
  user: SessionUser | null
  loading: boolean
  login: (email: string, senha: string) => Promise<{ ok: boolean; role?: Role }>
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)
const KEY = "imobcrm.session"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Recupera sessão salva no navegador (mantém login ao recarregar)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setUser(JSON.parse(raw))
    } catch {}
    setLoading(false)
  }, [])

  async function login(email: string, senha: string) {
    // Busca o usuário na tabela `usuarios` do Supabase.
    // Modo transitório: compara senha_hash === senha (texto puro).
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome, email, role, status, senha_hash, criado_em")
      .eq("email", email.trim().toLowerCase())
      .eq("status", "ativo")
      .maybeSingle()

    if (error || !data || data.senha_hash !== senha) return { ok: false }

    // Converte a linha do banco para o formato que o app usa (SessionUser)
    const session: SessionUser = {
      id: data.id,
      nome: data.nome,
      email: data.email,
      role: data.role as Role,
      ativo: data.status === "ativo",
      criadoEm: data.criado_em,
    }
    setUser(session)
    localStorage.setItem(KEY, JSON.stringify(session))
    return { ok: true, role: session.role }
  }

  function logout() {
    setUser(null)
    localStorage.removeItem(KEY)
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider")
  return ctx
}
