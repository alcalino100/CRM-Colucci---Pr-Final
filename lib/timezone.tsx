"use client"

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"

const BRT = "America/Sao_Paulo"

export function fmtDateTimeBRT(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: BRT,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function fmtDateBRT(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: BRT })
}

export function fmtTimeBRT(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: BRT, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function nowBRT() {
  return new Date().toLocaleString("pt-BR", { timeZone: BRT })
}

export function nowBRTHour() {
  return Number(
    new Date().toLocaleString("en-US", { timeZone: BRT, hour: "numeric", hour12: false })
  )
}

export function BRTClock() {
  const [time, setTime] = useState("")

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleString("pt-BR", {
          timeZone: BRT,
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      )
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums">
      <Clock className="size-3.5 shrink-0" />
      <span>{time}</span>
      <span className="text-[10px] font-bold text-primary/60">BRT</span>
    </div>
  )
}
