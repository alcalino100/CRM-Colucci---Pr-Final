"use client"

// Client único do Supabase para o navegador.
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "./config"

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
