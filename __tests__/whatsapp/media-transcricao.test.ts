import { beforeEach, describe, expect, it, vi } from "vitest"

const transcrever = vi.fn()
const descrever = vi.fn()
vi.mock("@/lib/whatsapp/server", () => ({
  wsupabase: { from: () => ({ insert: async () => ({}) }) },
  baixarEArmazenarMidia: vi.fn(),
  obterAudioBase64: vi.fn(async () => ({ base64: "AAAA", mimeType: "audio/ogg" })),
}))
vi.mock("@/lib/ai/midia", () => ({ transcreverAudioSmart: (...a: unknown[]) => transcrever(...a), descreverImagemSmart: (...a: unknown[]) => descrever(...a) }))

import { processarCorpoMidia } from "@/lib/whatsapp-webhook/media-helpers"

const audio = { tipo: "audio", mimeType: "audio/ogg; codecs=opus", nomeArquivo: null, legenda: null } as any
const imagem = { tipo: "image", mimeType: "image/jpeg", nomeArquivo: null, legenda: null } as any
const base = { instanceName: "i1", telefone: "5518", mensagemId: "M1", deveProcessarMidiaIA: true }

describe("processarCorpoMidia", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("transcreve áudio sem legenda e devolve o texto transcrito", async () => {
    transcrever.mockResolvedValue({ texto: "quando será a vistoria?", provedor: "openai", modelo: "whisper-1" })
    const corpo = await processarCorpoMidia({ ...base, msg: { message: { audioMessage: {} } }, midia: audio })
    expect(transcrever).toHaveBeenCalledTimes(1)
    expect(corpo).toBe("quando será a vistoria?")
  })

  it("descreve imagem sem legenda", async () => {
    descrever.mockResolvedValue({ texto: "foto de um apartamento", provedor: "claude", modelo: "m" })
    const corpo = await processarCorpoMidia({ ...base, msg: { message: { imageMessage: {} } }, midia: imagem })
    expect(corpo).toBe("📷 foto de um apartamento")
  })

  it("se a transcrição falhar, mantém o marcador [mídia]", async () => {
    transcrever.mockRejectedValue(new Error("sem chave"))
    const corpo = await processarCorpoMidia({ ...base, msg: { message: { audioMessage: {} } }, midia: audio })
    expect(corpo).toBe("[mídia]")
  })

  it("não transcreve quando a IA não deve processar", async () => {
    const corpo = await processarCorpoMidia({ ...base, deveProcessarMidiaIA: false, msg: { message: { audioMessage: {} } }, midia: audio })
    expect(transcrever).not.toHaveBeenCalled()
    expect(corpo).toBe("[mídia]")
  })
})
