/** Utilidades puras de modelos (templates) — seguras para uso no navegador. */
export type ModeloOficial = { nome: string; idioma: string; status: string; categoria: string | null; corpo: string; variaveis: number }

/** Texto do corpo do modelo com as variáveis aplicadas (é o que aparece na conversa). */
export function renderizarModelo(corpo: string, variaveis: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => variaveis[Number(n) - 1] ?? `{{${n}}}`)
}
