import React from "react"

/**
 * Renderiza texto com formatação básica de negrito (*texto* ou **texto**)
 * com segurança absoluta contra XSS (zero dangerouslySetInnerHTML).
 * Qualquer tag HTML ou script é tratado estritamente como texto puro escapado pelo React.
 */
export function renderSafeBoldText(input: string): React.ReactNode {
  if (!input) return null
  const parts = input.split(/(\*\*?[^*]+?\*\*?)/g)
  return parts.map((part, index) => {
    if (
      (part.startsWith("**") && part.endsWith("**") && part.length > 4) ||
      (part.startsWith("*") && part.endsWith("*") && part.length > 2)
    ) {
      const inner = part.replace(/^\*\*?|\*\*?$/g, "")
      return (
        <strong key={index} className="font-semibold">
          {inner}
        </strong>
      )
    }
    return <span key={index}>{part}</span>
  })
}
