-- Motivo de exclusão de leads (e futuras ações que exijam justificativa)
-- Idempotente: seguro para rodar múltiplas vezes.
alter table auditoria add column if not exists motivo text;
alter table auditoria add column if not exists motivo_detalhe text;
