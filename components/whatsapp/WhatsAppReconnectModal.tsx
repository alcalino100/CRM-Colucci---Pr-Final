"use client"

import React from "react"
import { useWhatsAppStatus } from "@/lib/whatsapp-status-context"
import { Dialog } from "@/components/ui/primitives"
import { WhatsappConnectionCard } from "@/components/whatsapp-connection-card"

export function WhatsAppReconnectModal() {
  const { reconnectModalOpen, reconnectTarget, closeReconnectModal } = useWhatsAppStatus()

  if (!reconnectModalOpen || !reconnectTarget) return null

  const title =
    reconnectTarget.titulo ??
    (reconnectTarget.corretorNome
      ? `Reconectar WhatsApp · ${reconnectTarget.corretorNome}`
      : "Reconectar WhatsApp")

  return (
    <Dialog open={reconnectModalOpen} onClose={closeReconnectModal} title={title}>
      <div className="mt-2">
        <WhatsappConnectionCard
          corretorId={reconnectTarget.corretorId}
          corretorNome={reconnectTarget.corretorNome}
          titulo={reconnectTarget.titulo}
          instanceNameFixo={reconnectTarget.instanceName}
          compact
        />
      </div>
    </Dialog>
  )
}
