/**
 * Utilitários para higienização e proteção de filtros PostgREST / Supabase.
 * Previne query injection e quebra sintática de filtros or() / filter().
 */

/**
 * Higieniza um termo de busca antes de inseri-lo em queries PostgREST dinâmicas (ex: or(), ilike()).
 *
 * Remove delimitadores de sintaxe que alteram a AST do PostgREST:
 * - Vírgula (,) que divide condições no or()
 * - Parênteses ( e ) que agrupam expressões
 * - Dois-pontos (:) que delimitam operadores
 * - Colchetes ([ e ])
 * - Aspas (" e ')
 * - Caracteres de controle e barras invertidas
 */
export function sanitizePostgrestFilter(term: unknown): string {
  if (typeof term !== "string") return ""
  return term
    .replace(/[\u0000-\u001F\u007F]/g, "") // remove caracteres de controle
    .replace(/[(),:\[\]"'\\]/g, "")         // remove delimitadores sintáticos do PostgREST
    .replace(/[%_]/g, "\\$&")             // escapa wildcards literais
    .trim()
}
