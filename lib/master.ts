import { supabase } from "@/lib/supabase/client"

// Painel Master: acesso exclusivo do proprietário.
// Por env (NEXT_PUBLIC_MASTER_EMAIL) para cada whitelabel ter o seu dono;
// default = Colucci. O link do menu nem é renderizado para os demais.
export const MASTER_EMAIL = (process.env.NEXT_PUBLIC_MASTER_EMAIL || "guilherme@colucci.com").toLowerCase()

export function isMasterEmail(email: string | null | undefined): boolean {
  return (email || "").toLowerCase().trim() === MASTER_EMAIL
}

export interface BrandLinks {
  site: string
  instagram: string
  suporte: string
}

export interface BrandSettings {
  id: string
  brand_name: string
  logo_url: string | null
  cor_primaria: string
  links: BrandLinks
}

export const BRAND_DEFAULTS: BrandSettings = {
  id: "main",
  brand_name: "Colucci Imóveis",
  logo_url: null,
  cor_primaria: "#b22222",
  links: { site: "", instagram: "", suporte: "" },
}

// Aplica a identidade na sessão atual (CSS vars + título). Falha silenciosa.
export function applyBrand(b: Partial<BrandSettings>): void {
  try {
    if (typeof document === "undefined") return
    if (b.cor_primaria) document.documentElement.style.setProperty("--primary", b.cor_primaria)
    if (b.brand_name) document.title = `${b.brand_name} — CRM`
  } catch { /* best-effort */ }
}

export async function loadBrand(): Promise<{ ok: boolean; settings: BrandSettings; faltaTabela: boolean }> {
  try {
    const { data, error } = await supabase.from("workspace_settings").select("*").eq("id", "main").maybeSingle()
    if (error) {
      const faltaTabela = String(error.message || "").toLowerCase().includes("does not exist")
        || String((error as { code?: string }).code || "") === "42P01"
      return { ok: false, settings: BRAND_DEFAULTS, faltaTabela }
    }
    if (!data) return { ok: true, settings: BRAND_DEFAULTS, faltaTabela: false }
    const d = data as Record<string, unknown>
    return {
      ok: true,
      faltaTabela: false,
      settings: {
        id: "main",
        brand_name: String(d.brand_name ?? BRAND_DEFAULTS.brand_name),
        logo_url: (d.logo_url as string | null) ?? null,
        cor_primaria: String(d.cor_primaria ?? BRAND_DEFAULTS.cor_primaria),
        links: { ...BRAND_DEFAULTS.links, ...((d.links ?? {}) as Partial<BrandLinks>) },
      },
    }
  } catch {
    return { ok: false, settings: BRAND_DEFAULTS, faltaTabela: false }
  }
}

export async function saveBrand(s: BrandSettings): Promise<{ ok: boolean; erro?: string }> {
  try {
    const { error } = await supabase.from("workspace_settings").upsert({
      id: "main",
      brand_name: s.brand_name,
      logo_url: s.logo_url || null,
      cor_primaria: s.cor_primaria,
      links: s.links,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
