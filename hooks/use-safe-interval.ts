import { useEffect, useRef } from "react"

/**
 * useSafeInterval
 * Executa callback em intervalo fixo apenas quando a aba estiver VISÍVEL (document.visibilityState === "visible").
 * Quando o usuário troca de aba ou minimiza a janela, o timer é pausado automaticamente,
 * economizando CPU, bateria e tráfego de rede Supabase/Vercel.
 * Ao retornar para a aba, opcionalmente dispara a execução imediatamente se immediateOnVisible for true.
 */
export function useSafeInterval(
  callback: () => void | Promise<void>,
  delay: number | null,
  options?: { immediateOnVisible?: boolean }
) {
  const savedCallback = useRef(callback)
  const immediateOnVisible = options?.immediateOnVisible ?? true

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null || typeof window === "undefined") return

    let timerId: ReturnType<typeof setInterval> | null = null

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      void savedCallback.current()
    }

    const startTimer = () => {
      if (timerId === null) {
        timerId = setInterval(tick, delay)
      }
    }

    const stopTimer = () => {
      if (timerId !== null) {
        clearInterval(timerId)
        timerId = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (immediateOnVisible) {
          void savedCallback.current()
        }
        startTimer()
      } else {
        stopTimer()
      }
    }

    if (document.visibilityState === "visible") {
      startTimer()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      stopTimer()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [delay, immediateOnVisible])
}

/**
 * safeSetInterval
 * Helper imperativo para código fora de componentes React ou em singletons/contexts.
 * Pausa quando document.visibilityState === "hidden". Retorna a função de limpeza.
 */
export function safeSetInterval(
  callback: () => void | Promise<void>,
  delay: number,
  options?: { immediateOnVisible?: boolean }
): () => void {
  if (typeof window === "undefined") return () => {}

  let timerId: ReturnType<typeof setInterval> | null = null
  const immediateOnVisible = options?.immediateOnVisible ?? true

  const tick = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return
    void callback()
  }

  const start = () => {
    if (timerId === null) {
      timerId = setInterval(tick, delay)
    }
  }

  const stop = () => {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      if (immediateOnVisible) void callback()
      start()
    } else {
      stop()
    }
  }

  if (document.visibilityState === "visible") {
    start()
  }

  document.addEventListener("visibilitychange", onVisibility)

  return () => {
    stop()
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
