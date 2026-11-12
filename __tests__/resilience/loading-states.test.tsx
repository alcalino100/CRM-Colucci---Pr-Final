import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import AppLoading from "@/app/(app)/loading"
import RootLoading from "@/app/loading"

describe("Estados de Carregamento (Loading States)", () => {
  it("renderiza esqueleto completo da área interna do app", () => {
    const html = renderToStaticMarkup(<AppLoading />)
    expect(html).toContain("animate-pulse")
    expect(html).toContain("grid-cols-1")
    expect(html).toContain("xl:grid-cols-5")
  })

  it("renderiza esqueleto do shell root com sidebar e topbar", () => {
    const html = renderToStaticMarkup(<RootLoading />)
    expect(html).toContain("animate-pulse")
    expect(html).toContain("w-64")
  })
})
