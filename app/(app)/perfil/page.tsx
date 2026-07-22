"use client"

import { useRef, useState } from "react"
import { Camera, KeyRound, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, useToast } from "@/components/ui/primitives"
import { WhatsappConnectionCard } from "@/components/whatsapp-connection-card"

const MAX_AVATAR_BYTES = 300 * 1024 // limite p/ armazenar como data URL na tabela

export default function PerfilPage() {
  const { user } = useAuth()
  const { users, updateProfile } = useLeads()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [savingFoto, setSavingFoto] = useState(false)
  const [savingSenha, setSavingSenha] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState("")
  const [novaSenha, setNovaSenha] = useState("")
  const [confirma, setConfirma] = useState("")

  if (!user) return null
  const me = users.find((u) => u.id === user.id)
  const initials = user.nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast("Selecione um arquivo de imagem.", "error")
      return
    }
    // Redimensiona no navegador para manter o tamanho pequeno
    const img = new Image()
    img.crossOrigin = "anonymous"
    const url = URL.createObjectURL(file)
    img.onload = async () => {
      const size = 256
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")!
      const min = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
      URL.revokeObjectURL(url)
      if (dataUrl.length > MAX_AVATAR_BYTES) {
        toast("Imagem muito grande. Tente uma menor.", "error")
        return
      }
      setSavingFoto(true)
      const res = await updateProfile({ avatar: dataUrl })
      setSavingFoto(false)
      if (res.ok) toast("Foto de perfil atualizada.")
      else toast(res.error ?? "Erro ao salvar.", "error")
    }
    img.src = url
  }

  async function onChangeSenha(e: React.FormEvent) {
    e.preventDefault()
    if (!me) return
    if (senhaAtual !== me.senha) {
      toast("Senha atual incorreta.", "error")
      return
    }
    if (novaSenha.length < 6) {
      toast("A nova senha deve ter pelo menos 6 caracteres.", "error")
      return
    }
    if (novaSenha !== confirma) {
      toast("A confirmação não confere com a nova senha.", "error")
      return
    }
    setSavingSenha(true)
    const res = await updateProfile({ senha: novaSenha })
    setSavingSenha(false)
    if (res.ok) {
      toast("Senha alterada com sucesso.")
      setSenhaAtual("")
      setNovaSenha("")
      setConfirma("")
    } else {
      toast(res.error ?? "Erro ao salvar.", "error")
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua foto de perfil e sua senha de acesso.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foto de perfil</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-5">
          {me?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar || "/placeholder.svg"} alt="Sua foto de perfil" className="size-20 rounded-full object-cover" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">{initials}</div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{user.nome}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="sr-only" aria-label="Selecionar foto de perfil" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={savingFoto}>
              {savingFoto ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Alterar foto
            </Button>
          </div>
        </CardContent>
      </Card>

      <WhatsappConnectionCard corretorId={user.id} corretorNome={user.nome} compact />

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <CardTitle>Alterar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangeSenha} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="sa">Senha atual *</Label>
              <Input id="sa" type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="ns">Nova senha *</Label>
                <Input id="ns" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required autoComplete="new-password" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cs">Confirmar nova senha *</Label>
                <Input id="cs" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required autoComplete="new-password" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingSenha}>
                {savingSenha && <Loader2 className="size-4 animate-spin" />} Salvar nova senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
