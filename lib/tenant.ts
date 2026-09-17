import { supabase } from "@/lib/supabase/client"

// Fase A multi-tenant: resolução da conta ativa.
// Ordem: ?w=<slug> (troca explícita) > subdomínio (<slug>.dominio) > "main".
// Fase A só RESOLVE (sem enforcement nas queries — Fase B).
export const MAIN_WORKSPACE = "main";

export function resolveWorkspaceSlug(host?: string, search?: string): string {
  try {
    if (search) {
      const w = new URLSearchParams(search).get("w");
      if (w && /^[a-z0-9-]{1,40}$/.test(w)) return w;
    }
    const h = (host || "").split(":")[0].toLowerCase();
    const parts = h.split(".");
    // <slug>.dominio.tld (3+ partes) e não-www
    if (parts.length >= 3 && parts[0] !== "www") return parts[0];
  } catch { /* default */ }
  return MAIN_WORKSPACE;
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  try {
    const { data } = await supabase.from("workspaces").select("id,slug,name,active").order("created_at");
    return ((data ?? []) as Workspace[]);
  } catch {
    return [];
  }
}

export async function createWorkspace(slug: string, name: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const clean = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    if (!clean) return { ok: false, erro: "Slug inválido." };
    const { error } = await supabase.from("workspaces").insert({ id: clean, slug: clean, name: name.trim() || clean, active: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
