import { criarMockProvider } from "./mock-provider"
import type { ImmobillisProvider } from "./provider"

/**
 * Único ponto que decide qual provedor do Immobillis o assistente usa.
 * Enquanto não existir `ImmobillisHttpProvider` (depende da documentação da API), devolve o simulado.
 * O handler do WhatsApp usa `provider.nome === "simulado"` para NUNCA mostrar dado fictício a cliente real.
 */
export function obterProvider(): ImmobillisProvider {
  // Futuro: if (process.env.IMMOBILLIS_API_URL && process.env.IMMOBILLIS_API_KEY) return criarImmobillisHttpProvider(...)
  return criarMockProvider()
}

export const providerEhReal = (p: ImmobillisProvider) => p.nome !== "simulado"
