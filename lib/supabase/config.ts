// Conexão Supabase — por env para cada whitelabel ter seu banco.
// Default = Colucci (produção atual). Defina no projeto novo:
// NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lehqtdajfjzfhucxpvje.supabase.co"
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_msjWwAcjLaN5IOVlZhPSwg_gYk0i2K5"
