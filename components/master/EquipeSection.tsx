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
    const { error } = await supabase.from("usuarios").update({ role }).eq("id", id)
    if (error) {
      toast("Falha.", "error")
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
