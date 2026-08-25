-- Suporte a mídia no Chat do WhatsApp (imagem, áudio, vídeo, documento, figurinha).
-- O webhook detecta o tipo, baixa o arquivo da Evolution e guarda no Storage; estas
-- colunas apontam para o arquivo e descrevem o tipo.

alter table whatsapp_mensagens add column if not exists tipo_midia text;       -- image | audio | video | document | sticker
alter table whatsapp_mensagens add column if not exists midia_url text;         -- URL pública no Storage (nula enquanto baixa / se indisponível)
alter table whatsapp_mensagens add column if not exists mime_type text;
alter table whatsapp_mensagens add column if not exists nome_arquivo text;

-- Bucket público para os arquivos de mídia das conversas (limite de 25 MB por arquivo).
-- Público segue o mesmo modelo de acesso do resto do projeto (chave publishable / sem RLS).
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-midia', 'whatsapp-midia', true, 26214400)
on conflict (id) do nothing;

-- Permite que a chave anon/publishable leia e grave objetos nesse bucket (o app não usa
-- sessão de usuário do Supabase; o webhook grava com a chave secreta, a leitura é pública).
do $$
begin
  perform 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'whatsapp_midia_all';
  if not found then
    create policy whatsapp_midia_all on storage.objects
      for all
      using (bucket_id = 'whatsapp-midia')
      with check (bucket_id = 'whatsapp-midia');
  end if;
end $$;
