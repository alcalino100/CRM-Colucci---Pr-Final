import { describe, it, expect } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { renderSafeBoldText } from "@/lib/safe-markdown"

describe("renderSafeBoldText - Proteção XSS e Renderização Segura de Negrito", () => {
  it("deve renderizar negrito com asteriscos simples e duplos", () => {
    const elSimple = renderSafeBoldText("Olá *Mundo* aqui")
    const htmlSimple = renderToString(React.createElement("div", null, elSimple))
    expect(htmlSimple).toContain("<strong class=\"font-semibold\">Mundo</strong>")
    expect(htmlSimple).toContain("Olá ")

    const elDouble = renderSafeBoldText("Texto com **destaque forte** aqui")
    const htmlDouble = renderToString(React.createElement("div", null, elDouble))
    expect(htmlDouble).toContain("<strong class=\"font-semibold\">destaque forte</strong>")
  })

  it("deve escapar estritamente tags HTML maliciosas (XSS payload)", () => {
    const xssPayload = '<img src=x onerror=alert(1)>'
    const el = renderSafeBoldText(xssPayload)
    const html = renderToString(React.createElement("div", null, el))

    // O HTML gerado deve escapar os caracteres < e >, NUNCA renderizar a tag <img> crua
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
  })

  it("deve escapar tags de script injetadas dentro de negrito", () => {
    const xssScript = '*<script>alert("hacked")</script>*'
    const el = renderSafeBoldText(xssScript)
    const html = renderToString(React.createElement("div", null, el))

    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;")
  })

  it("deve retornar null para entrada vazia", () => {
    expect(renderSafeBoldText("")).toBeNull()
  })
})
