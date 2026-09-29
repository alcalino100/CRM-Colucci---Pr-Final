-- DESATIVADO (29/09/2026): era rename Trafichub, nunca aplicar na Colucci —
-- aqui as duas etapas coexistem (visita 8 + reuniao 9). Mantido p/ histórico.
-- Renomeia a etapa "visita agendada" -> "reuniao agendada" (Trafichub: agência).
-- Seguro re-rodar. Rode no banco do cliente.
select 1 where false;
-- update public.leads
-- set status = 'reuniao agendada', atualizado_em = now()
-- where status = 'visita agendada';

-- update public.pipeline_stages
-- set key = 'reuniao agendada', label = 'Reunião Agendada', updated_at = now()
-- where key = 'visita agendada';
