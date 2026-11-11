"use client"

// Client único do Supabase para o navegador.
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "./config"
import type { Database } from "./database.types"

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY)

