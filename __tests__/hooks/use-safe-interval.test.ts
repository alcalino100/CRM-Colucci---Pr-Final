import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { safeSetInterval } from "@/hooks/use-safe-interval"

describe("use-safe-interval / safeSetInterval", () => {
  let listeners: Record<string, (() => void)[]> = {}
  let currentVisibility: DocumentVisibilityState = "visible"

  beforeEach(() => {
    vi.useFakeTimers()
    listeners = {}
    currentVisibility = "visible"

    // Mock minimal window and document in node environment
    const mockDoc = {
      get visibilityState() {
        return currentVisibility
      },
      addEventListener(event: string, fn: () => void) {
        listeners[event] = listeners[event] || []
        listeners[event].push(fn)
      },
      removeEventListener(event: string, fn: () => void) {
        listeners[event] = (listeners[event] || []).filter((l) => l !== fn)
      },
      dispatchEvent(_event: unknown) {
        return true
      },
    }

    vi.stubGlobal("window", {})
    vi.stubGlobal("document", mockDoc)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function triggerVisibility(vis: DocumentVisibilityState) {
    currentVisibility = vis
    for (const fn of listeners["visibilitychange"] || []) {
      fn()
    }
  }

  it("calls callback periodically when document is visible", () => {
    const cb = vi.fn()
    const cleanup = safeSetInterval(cb, 1000)

    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(cb).toHaveBeenCalledTimes(3)

    cleanup()
  })

  it("pauses execution when document becomes hidden", () => {
    const cb = vi.fn()
    const cleanup = safeSetInterval(cb, 1000)
    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(1)

    // User hides tab
    triggerVisibility("hidden")

    vi.advanceTimersByTime(5000)
    // No new executions while hidden
    expect(cb).toHaveBeenCalledTimes(1)

    // User returns to tab
    triggerVisibility("visible")

    // Executes immediately on return
    expect(cb).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(3)

    cleanup()
  })
})
