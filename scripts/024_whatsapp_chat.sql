-- Base para o Chat do WhatsApp (visão do gestor): distingue mensagem
-- recebida de mensagem enviada pelo corretor, e evita duplicidade quando a
-- Evolution reenvia o mesmo evento de webhook.

alter table whatsapp_mensagens add column if not exists de_mim boolean not null default false;
alter table whatsapp_mensagens add column if not exists mensagem_id text;

-- Evita linha duplicada quando a Evolution reentrega o mesmo evento
-- (retry por timeout, por exemplo). Nula quando o id não veio no payload.
create unique index if not exists whatsapp_mensagens_msgid_uidx
  on whatsapp_mensagens (mensagem_id)
  where mensagem_id is not null;

-- Acelera a listagem de conversas por lead dentro de uma instância
create index if not exists whatsapp_mensagens_lead_idx
  on whatsapp_mensagens (lead_id);
