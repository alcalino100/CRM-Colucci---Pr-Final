-- 022b: Fix — adicionar tabelas faltantes ao supabase_realtime
-- Execute no SQL Editor do Supabase

do $$ begin
  alter publication supabase_realtime add table public.automation_message_templates;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.automation_global_settings;
exception when duplicate_object then null; end $$;
