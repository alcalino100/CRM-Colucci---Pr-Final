import { BRAND_DEFAULTS, type BrandSettings } from "@/lib/master";
import { SUPABASE_URL } from "@/lib/supabase/config";

// Marca no SERVIDOR (sem flash): lida por request (no-store) e embutida no HTML.
// Fallback = identidade Colucci (produção atual sem linha personalizada).
export async function fetchBrandServer(): Promise<BrandSettings> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!base || !secret) return BRAND_DEFAULTS;
    const res = await fetch(`${base.replace(/\/+$/, "")}/rest/v1/workspace_settings?id=eq.main&select=*`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) return BRAND_DEFAULTS;
    const rows = (await res.json()) as Record<string, unknown>[];
    const d = rows?.[0];
    if (!d) return BRAND_DEFAULTS;
    return {
      id: "main",
      brand_name: String(d.brand_name ?? BRAND_DEFAULTS.brand_name),
      logo_url: (d.logo_url as string | null) ?? null,
      favicon_url: (d.favicon_url as string | null) ?? null,
      cor_primaria: String(d.cor_primaria ?? BRAND_DEFAULTS.cor_primaria),
      fonte_titulo: String(d.fonte_titulo ?? BRAND_DEFAULTS.fonte_titulo),
      fonte_texto: String(d.fonte_texto ?? BRAND_DEFAULTS.fonte_texto),
      sidebar_bg: String(d.sidebar_bg ?? BRAND_DEFAULTS.sidebar_bg),
      sidebar_fg: String(d.sidebar_fg ?? BRAND_DEFAULTS.sidebar_fg),
      sidebar_accent: String(d.sidebar_accent ?? BRAND_DEFAULTS.sidebar_accent),
      links: { ...BRAND_DEFAULTS.links, ...((d.links ?? {}) as Record<string, string>) },
    };
  } catch {
    return BRAND_DEFAULTS;
  }
}
