#!/usr/bin/env node
/**
 * scripts/check-spacing.mjs
 * Validador da escala 8pt do CRM Colucci.
 * Avisa se classes arbitrárias de espaçamento fora da escala (ex: p-[13px], m-[7px])
 * forem introduzidas no projeto.
 */

import fs from "fs"
import path from "path"

const TARGET_DIRS = ["components", "app", "hooks"]
const ARBITRARY_SPACING_REGEX = /\b(p|m|gap|py|px|pt|pb|pl|pr|my|mx|mt|mb|ml|mr)-\[(\d+)px\]/g

let totalFiles = 0
let totalWarnings = 0
const warnings = []

function scanDir(dir) {
  if (!fs.existsSync(dir)) return
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        scanDir(fullPath)
      }
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      totalFiles++
      const content = fs.readFileSync(fullPath, "utf-8")
      const lines = content.split("\n")
      lines.forEach((line, lineIdx) => {
        let match
        while ((match = ARBITRARY_SPACING_REGEX.exec(line)) !== null) {
          const val = parseInt(match[2], 10)
          // Escala 8pt aceita múltiplos de 4px / 8px (ex: 4, 8, 12, 16, 20, 24, 32, 40, 48, etc.)
          if (val % 4 !== 0) {
            totalWarnings++
            warnings.push({
              file: path.relative(process.cwd(), fullPath),
              line: lineIdx + 1,
              matched: match[0],
              pixels: val,
            })
          }
        }
      })
    }
  }
}

for (const dir of TARGET_DIRS) {
  scanDir(path.resolve(process.cwd(), dir))
}

console.log(`\n🔍 Verificação de Espaçamento 8pt: ${totalFiles} arquivos analisados.`)
if (warnings.length > 0) {
  console.warn(`⚠️  Encontrados ${warnings.length} espaçamentos arbitrários fora da escala 8pt:`)
  warnings.slice(0, 10).forEach((w) => {
    console.warn(`   • ${w.file}:${w.line} -> "${w.matched}" (${w.pixels}px não é múltiplo de 4/8pt)`)
  })
  if (warnings.length > 10) {
    console.warn(`   ... e mais ${warnings.length - 10} avisos.`)
  }
} else {
  console.log("✅ Todos os espaçamentos respeitam a grade 8pt ou classes utilitárias padrão do Tailwind!")
}

process.exit(0)
