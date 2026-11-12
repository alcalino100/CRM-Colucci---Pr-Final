import type { SWRConfiguration } from "swr"

/**
 * Configuração canônica de SWR para o CRM Colucci.
 * Evita rajadas de requests para a Meta API e Supabase quando corretores
 * trocam frequentemente de abas no navegador.
 */
export const SWR_DEFAULT_CONFIG: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 10_000, // 10 segundos de deduplicação
  errorRetryCount: 2,
  errorRetryInterval: 5_000,
}
