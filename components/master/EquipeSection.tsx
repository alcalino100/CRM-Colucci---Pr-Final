"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { ROLE_LABEL } from "@/lib/roles"
import type { Role } from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle, Select, Table, TD, TH, THead, TR, useToast } from "@/components/ui/primitives"

export function EquipeSection() {
  const toast = useToast()
  const [users, setUsers] = useState<{ id: string; nome: string; email: string; role: Role }[]>([])

  const carregar = async () => {
    const { data } = await supabase.from("usuarios").select("id,nome,email,role").order("nome")
    setUsers((data ?? []) as { id: string; nome: string; email: string; role: Role }[])
  }
  useEffect(() => {
    carregar()
  }, [])

  const trocar = async (id: string, role: Role) => {
    // A troca de perfil passa pelo servidor, que aplica as regras de permissão (antes ia direto ao banco).
    try {
      const r = await fetch(`/api/usuarios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) })
      const j = await r.json().catch(() => ({}))
      if (!j?.ok) {
        toast(r.status === 401 ? "Sua sessão precisa ser renovada: saia do CRM e entre novamente." : j?.erro || "Falha.", "error")
        carregar()
        return
      }
    } catch {
      toast("Sem conexão. Tente novamente.", "error")
      return
    }
    toast("Perfil atualizado.")
    carregar()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipe ({users.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              <TH>Nome</TH>
              <TH>E-mail</TH>
              <TH>Perfil</TH>
            </TR>
          </THead>
          <tbody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD>{u.nome}</TD>
                <TD className="text-xs text-muted-foreground">{u.email}</TD>
                <TD>
                  <Select
                    value={u.role}
                    onChange={(e) => trocar(u.id, e.target.value as Role)}
                    className="h-8 text-xs"
                  >
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  )
}
