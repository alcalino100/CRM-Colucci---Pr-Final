-- Notificações via WhatsApp (Evolution) para o gestor
-- Coluna notif_grupo na instância do gestor: guarda o JID do grupo que recebe
-- as notificações de venda fechada (ex.: 120363012345678901@g.us).
-- Sem essa coluna, as notificações de venda vão para o número direto do gestor.
alter table whatsapp_instancias add column if not exists notif_grupo text;
