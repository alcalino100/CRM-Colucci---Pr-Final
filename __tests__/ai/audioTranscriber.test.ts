import { describe, expect, it } from "vitest"
import { normalizarMimeAudio } from "@/lib/ai/audioTranscriber"

describe("normalizarMimeAudio", () => {
  it("corta codecs do WhatsApp (opus)", () => {
    expect(normalizarMimeAudio("audio/ogg;codecs=opus")).toBe("audio/ogg")
  })
  it("mapeia variantes comuns", () => {
    expect(normalizarMimeAudio("audio/mpeg")).toBe("audio/mpeg")
    expect(normalizarMimeAudio("audio/mp3")).toBe("audio/mpeg")
    expect(normalizarMimeAudio("audio/x-m4a")).toBe("audio/mp4")
    expect(normalizarMimeAudio("audio/webm")).toBe("audio/webm")
  })
  it("fallback seguro para vazio/desconhecido", () => {
    expect(normalizarMimeAudio(null)).toBe("audio/ogg")
    expect(normalizarMimeAudio("")).toBe("audio/ogg")
    expect(normalizarMimeAudio("application/octet-stream")).toBe("application/octet-stream")
  })
})
