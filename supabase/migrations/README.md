# Gestão Canônica de Migrations do Banco de Dados (Supabase PostgreSQL)

Este documento define a ordem canônica de execução dos scripts de banco de dados do projeto, documenta as duplicações históricas e estabelece a política definitiva para novas migrações.

---

## 1. Fonte Canônica da Verdade

- **A partir desta data, a pasta `supabase/migrations/` é a ÚNICA FONTE DA VERDADE para migrações do projeto.**
- **Regra inegociável:** Scripts legados já aplicados em produção **NÃO** podem ser renomeados nem editados, a fim de preservar a idempotência e histórico de auditoria.
- **Novas migrations:** Qualquer alteração futura de schema, funções, índices ou triggers deve ser criada exclusivamente como um novo arquivo em `supabase/migrations/` utilizando o formato de timestamp:
  ```
  supabase/migrations/<YYYYMMDDHHMMSS>_<descricao_em_snake_case>.sql
  ```

---

## 2. Histórico de Scripts e Numerações Duplicadas

No histórico legado existiam duas pastas: `scripts/` (scripts numerados de 001 a 033) e `supabase/migrations/` (migrations com data).

### Duplicações Conhecidas na Pasta `scripts/`:
1. **Prefixo `003` duplicado:**
   - `scripts/003_meta_ads.sql`: Criação das tabelas de integração de anúncios do Meta.
   - `scripts/003_telefone_unico.sql`: Regra de unicidade e higienização de telefones de leads.
   - *Ordem canônica:* Executar `003_meta_ads.sql` antes de `003_telefone_unico.sql`.
2. **Prefixo `022` / `022b`:**
   - `scripts/022_automations.sql`: Schema principal do módulo de automações.
   - `scripts/022b_automations_fix_realtime.sql`: Correção de publicação de réplica e triggers realtime.
   - *Ordem canônica:* `022_automations.sql` seguido de `022b_automations_fix_realtime.sql`.
3. **Prefixo `026` duplicado:**
   - `scripts/026_automacao_followup.sql`: Tabelas e campos da régua de follow-up temporal (D+1, D+2, D+3).
   - `scripts/026_workspace_settings.sql`: Tabela de configurações por workspace.
   - *Ordem canônica:* Executar `026_automacao_followup.sql` antes de `026_workspace_settings.sql`.
4. **Pulos de numeração no histórico:**
   - Não existem os scripts `023` e `031` (numerações reservadas descartadas em versões anteriores).

---

## 3. Ordem Canônica de Execução Completa (Bootstrap do Zero)

Caso seja necessário recriar o banco do zero em um ambiente de desenvolvimento ou staging, a sequência exata de execução é:

1. `scripts/001_base_whitelabel.sql`
2. `scripts/002_crm_upgrade.sql`
3. `scripts/003_meta_ads.sql`
4. `scripts/003_telefone_unico.sql`
5. `scripts/004_notificacoes_admin.sql`
6. `scripts/005_justificativas_operacionais.sql`
7. `scripts/006_fix_notificacoes_autoria.sql`
8. `scripts/007_whatsapp_evolution.sql`
9. `scripts/008_auditoria_motivo.sql`
10. `scripts/009_meta_event_logs.sql`
11. `scripts/010_notif_grupo.sql`
12. `scripts/011_fechamento.sql`
13. `scripts/012_comissao.sql`
14. `scripts/013_rastreio.sql`
15. `scripts/014_tipo_imovel_vendido.sql`
16. `scripts/015_fix_tipo_imovel_vendido.sql`
17. `scripts/016_crm_sessoes.sql`
18. `scripts/017_locacao.sql`
19. `scripts/018_roles_separacao.sql`
20. `scripts/019_usuarios_rls_off.sql`
21. `scripts/020_notificacoes_modulo.sql`
22. `scripts/021_meta_orcamento.sql`
23. `scripts/022_automations.sql`
24. `scripts/022b_automations_fix_realtime.sql`
25. `scripts/024_whatsapp_chat.sql`
26. `scripts/025_whatsapp_midia.sql`
27. `scripts/026_automacao_followup.sql`
28. `scripts/026_workspace_settings.sql`
29. `scripts/027_pipeline_stages.sql`
30. `scripts/028_workspaces.sql`
31. `scripts/029_brand_upload.sql`
32. `scripts/030_brand_sidebar.sql`
33. `scripts/032_pipeline_reuniao.sql`
34. `scripts/033_arquivar_reaparecimento.sql`
35. `supabase/migrations/20250908_ai_conversational.sql`
36. `supabase/migrations/20250910_tags.sql`
37. `supabase/migrations/20250911_escalation_improvements.sql`
38. *(Novas migrações a partir daqui em `supabase/migrations/`)*
