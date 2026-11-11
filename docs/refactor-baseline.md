# Diagnóstico Baseline e Plano de Execução — "BASE SÓLIDA"

**Projeto:** CRM Colucci Imóveis (white-label)  
**Repositório:** `alcalino100/CRM-Colucci---Pr-Final`  
**Commit de Referência:** `3cb9baa` (incorporando baseline da auditoria `52d6d09`)  
**Data:** 11 de Novembro de 2026  
**Status:** FASE 0, 1 e 2 CONCLUÍDAS — Pronto para FASE 3 (Arquitetura e Decomposição de Arquivos Grandes)

---

## 1. Resumo Executivo e Metodologia de Medição

Este documento consolida o diagnóstico estático e dinâmico do projeto antes de qualquer intervenção de código, estabelecendo o marco zero (*baseline*) para as refatorações de arquitetura, qualidade, performance, resiliência e fundação responsiva.

### Metodologia de Coleta
Todos os números foram auditados via ferramentas de linha de comando nativas (`pnpm`, `tsc`, `vitest`, `git grep`, scripts Node.js e análise de build do Next.js 16/Turbopack), documentadas passo a passo abaixo para permitir reprodução exata a qualquer momento.

---

## 2. Reprodução dos Indicadores do Baseline ("Antes")

| Métrica | Valor Auditado | Comando Documentado para Reprodução | Status / Diagnóstico |
|---|---|---|---|
| **TypeScript (`tsc --noEmit`)** | **0 erros** | `pnpm exec tsc --noEmit` | O compilador passa 100% limpo, porém `next.config.mjs` tem `typescript.ignoreBuildErrors: true` ativado desnecessariamente. |
| **Vitest (Suíte de Testes)** | **99/99 passando** (ou 98/99 offline) | `pnpm test` | 12 arquivos de teste. `__tests__/ai/generateResponse.test.ts` depende de chamadas reais de rede ao Supabase (`aiId: "inexistente"`), sofrendo timeout de 5s quando offline ou sob alta latência. |
| **Uso de `any`** | **471 linhas** (466 de tipagem) | `git grep -w any -- "app/**" "components/**" "lib/**"` | Alta incidência de tipagem flexível em `lib/leads-store.tsx`, `components/inbox/`, `app/api/` e `app/(app)/automacoes/`. |
| **`catch` vazios / sem tratamento** | **128 em linha única** (32 estritamente silenciosos em fluxos críticos) | `node -e '...'` via AST / RegExp em `app`, `components`, `lib` | Catches com `/* silent */` ou corpo vazio sem telemetria, dificultando depuração de falhas de rede e permissão. |
| **Chamadas `console.*`** | **36 ocorrências** | `git grep -E "console\.(log\|warn\|error\|info\|debug)" -- app components lib` | 36 logs diretos que vazam mensagens ou parâmetros no terminal sem padronização ou mascaramento LGPD. |
| **Diretivas `eslint-disable`** | **16 ocorrências** | `git grep "eslint-disable" -- app components lib` | Quase todas suprimindo `@next/next/no-img-element` e regras de hooks. |
| **Consultas `select("*")`** | **68 ocorrências** | `git grep -E 'select\(\s*["'\''"][*]["'\''"]\s*\)' -- app components lib` | Busca de tabelas inteiras (`leads`, `lead_historico`, `mensagens`, `whatsapp_conversas`) sem projeção de colunas necessárias. |
| **`setInterval` ativos** | **10 ocorrências** | `git grep -w "setInterval"` | Polling repetido em `inbox`, `presence`, `automacoes`, `whatsapp` sem pausar quando a aba está em background. |
| **Canais Realtime Supabase** | **9 instâncias** | `git grep -E "\.channel\("` | 6 arquivos instanciando canais independentes (`crm-realtime`, `crm-celebracoes`, `whatsapp-chat`, `automations-realtime`, etc.) sem compartilhamento de conexão. |
| **Páginas "use client"** | **37 de 41 (90.2%)** | Análise de `app/**/page.tsx` e `app/**/layout.tsx` | Apenas 4 arquivos são Server Components: `agents/page.tsx`, `automacoes/fluxos/page.tsx`, `inbox/page.tsx`, `login/page.tsx`. |
| **Import Dinâmico (`next/dynamic`)** | **0 ocorrências** | `git grep "next/dynamic"` | Pacotes pesados (`recharts`, `@xyflow/react`, `@hello-pangea/dnd`) carregados no bundle inicial de rotas que nem sempre os exibem. |
| **Páginas de Erro/Loading** | **0 ocorrências** | `git ls-files "app/**/error.tsx" "app/**/loading.tsx" "app/**/not-found.tsx"` | Ausência total de Error Boundaries de rota e skeletons declarativos do Next.js App Router. |
| **Sentry / Telemetria Externa** | **0 ocorrências** | `git grep -i "sentry"` | Nenhuma ferramenta de observabilidade de exceções configurada. |
| **Validação com Zod em APIs** | **0 de 70 rotas** | `git ls-files "app/api/**/route.ts"` vs import de `zod` | Todas as 70 rotas de API fazem parse manual de JSON ou cast `any` direto do `req.json()`. |
| **Tags `<img>` nativas** | **11 ocorrências** | `git grep "<img"` | 11 imagens de avatars, logos e criativos usando tag HTML crua sem lazy load, dimensões fixas ou otimização Next. |
| **Configuração de Imagens** | **`unoptimized: true`** | `next.config.mjs` | Todas as imagens são entregues brutas sem redimensionamento do Next.js Image Optimization. |
| **Metadados de Pacote & CI** | **`name: "my-project"`** | `package.json`, `README.md` | Nome de boilerplate, README genérico de v0, script `pnpm lint` falha com código 127 (`eslint: command not found`). |
| **Scripts de Banco de Dados** | **Duplicações (003, 022, 026)** | `ls scripts/` e `ls supabase/migrations/` | 34 scripts em `scripts/` (001 a 033) e 3 migrations em `supabase/migrations/` (20250908, 20250910, 20250911). |
| **Volume de JS Estático Gerado** | **4.762,7 KB** (81 chunks) | Análise de `.next/static/chunks/` | Os 4 maiores chunks somam 1.415 KB (353,9 KB cada). |

---

## 3. Mapeamento de Arquivos Grandes (>600 linhas)

Foram identificados **11 arquivos** que excedem o limiar de 600 linhas no repositório:

| Arquivo | Linhas | Complexidade / Responsabilidades Acumuladas |
|---|---|---|
| [`app/(app)/automacoes/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/app/(app)/automacoes/page.tsx) | **1.596** | Dashboard completo, métricas de resgate, tabelas de fila, botões de ação emergencial, modal de visualização e gráficos. |
| [`app/api/automation/worker/route.ts`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/app/api/automation/worker/route.ts) | **1.490** | Motor de automação: verificação de inatividade, D+1/D+2/D+3, rate limit de 30 msgs/h, anti-ban, execução de IA e persistência. |
| [`app/(app)/meta-ads/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/app/(app)/meta-ads/page.tsx) | **1.094** | Gerenciador de campanhas, conjuntos de anúncios, criativos, tabelas de métricas, conciliação e edição de orçamento. |
| [`app/api/whatsapp/webhook/route.ts`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/app/api/whatsapp/webhook/route.ts) | **1.023** | Recepção de webhooks da Evolution API, parser de mensagens, deduplicação, resolução de LID, cadastro automático de lead e gatilhos de IA. |
| [`components/kanban-board.tsx`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/components/kanban-board.tsx) | **1.001** | Funil de vendas, drag-and-drop, filtros complexos de temperatura/corretor/data, celebração de vendas, destaques de reativados. |
| [`app/(app)/arquivados/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/app/(app)/arquivados/page.tsx) | **989** | Gestão de hibernação, filtros por motivo/data, ações em lote (reativar, estender data, excluir), KPIs e exportação CSV. |
| [`lib/ai/inboxHandler.ts`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/lib/ai/inboxHandler.ts) | **930** | Orquestração do bot de IA, detector de escalada para humano, consulta à base de conhecimento (RAG) e regras de resposta. |
| [`lib/leads-store.tsx`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/lib/leads-store.tsx) | **917** | Store central de leads, sincronização realtime, rotinas de hibernação, desarquivamento, tags e mutações locais. |
| [`app/(app)/master/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/app/(app)/master/page.tsx) | **797** | Painel master multi-workspace, gestão de usuários, branding (cores, logos), instâncias e logs de sistema. |
| [`components/kanban-board-locacao.tsx`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/components/kanban-board-locacao.tsx) | **724** | Funil de locação duplicando a maior parte da lógica do kanban geral de vendas. |
| [`app/(app)/automacoes/nova/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/CRM-Colucci---Pr-Final/app/(app)/automacoes/nova/page.tsx) | **604** | Formulário e builder de novas regras de automação. |

---

## 4. Diagnóstico de Responsividade e Fundação de Design (Fase 6)

Auditamos a interface com base nos padrões de ergonomia móvel, acessibilidade (WCAG 2.1 AA) e no grid de 8pt:

### 4.1 Espaçamento e Grid de 8pt
- **1.315 classes fora do grid** detectadas em 72 arquivos (`p-3`, `p-5`, `p-7`, `gap-3`, `gap-5`, `py-1.5`, `px-2.5`, etc.).
- Os maiores ofensores são: `app/(app)/meta-ads/page.tsx` (140), `app/(app)/automacoes/page.tsx` (124), `components/meta-ads/audit-reconciliation.tsx` (84) e `components/ai-agents/ControlCenter.tsx` (51).
- **Proposta de Solução (Fase 6.1):** Registrar `scripts/check-spacing.mjs` com baseline de tolerância para código legado e bloqueio em código novo; introduzir tokens semânticos `--space-item (8/16px)`, `--space-group (24px)`, `--space-section (32/48px)`, `--gutter (16/24/32px)`.

### 4.2 Tipografia e Zoom Automático no iOS
- Em `components/ui/primitives.tsx:48`, o componente `Input` utiliza `text-sm` (14px). Em navegadores Safari no iOS, focar em qualquer campo com menos de 16px causa **zoom involuntário na tela**, quebrando o layout da página.
- **Proposta de Solução (Fase 6.2):** Alterar inputs para `text-base md:text-sm`, garantindo 16px no mobile sem zoom forçado.
- Títulos usam classes fixas (ex.: `text-2xl`, `text-3xl`) que causam quebras de linha indesejadas em larguras 320–360px. Serão migrados para funções fluidas `clamp()`.

### 4.3 Áreas de Toque e Ergonomia (Alvos <44x44px)
- O componente base `Button` (`components/ui/button.tsx`) possui alturas de `h-8` (32px), `h-6` (24px), `h-7` (28px) e `h-9` (36px). **Nenhuma delas atinge o mínimo recomendado de 44x44px no mobile**.
- Ícones de ação no `lead-card` (como menu de opções e botões de chamada) têm áreas de toque inferiores a 28x28px, gerando cliques falsos em telas sensíveis ao toque.
- **Proposta de Solução (Fase 6.3):** Ajustar `<Button/>` e `<IconButton/>` para `min-h-11 min-w-11 lg:min-h-8` abaixo do breakpoint `lg`, mantendo a densidade compacta no desktop.

### 4.4 Navegação Mobile (Barra Inferior Fixa)
- O sistema hoje possui apenas sidebar expansível (`app/(app)/layout.tsx`), que no mobile precisa ser aberta via hambúrguer.
- **Proposta de Navegação Inferior (5 Rotas):**
  - **Perfil Corretor:** 
    1. 📋 Kanban (`/painel-corretor`)
    2. 📦 Arquivados (`/arquivados`)
    3. 📅 Agenda (`/agenda`)
    4. 🏢 Locação (`/locacao`)
    5. 👤 Perfil (`/perfil`)
  - **Perfil Gestor:**
    1. 📋 Kanban (`/painel-corretor`)
    2. 📥 Inbox (`/inbox`)
    3. 📊 Dashboard (`/dashboard-gestao`)
    4. ⚡ Automações (`/automacoes`)
    5. ☰ Mais (abre drawer lateral com Meta Ads, Master, Auditoria, Configurações)

### 4.5 Tabelas sem Versão Card para Mobile
Mapeamos 14 tabelas na aplicação sem suporte responsivo adequado:
1. `app/(app)/arquivados/page.tsx:633` (tabela de leads arquivados)
2. `app/(app)/automacoes/page.tsx:1191` (tabela da fila de mensagens)
3. `app/(app)/dashboard-gestao/page.tsx:429` (ranking de corretores)
4. `app/(app)/fechamento/page.tsx:299` (relatório de fechamentos)
5. `app/(app)/locacao/contratos/page.tsx:299` (contratos de locação)
6. `app/(app)/locacao/dashboard/page.tsx:419` (dashboard locação)
7. `app/(app)/meta-ads/page.tsx:605` (tabela de campanhas com 14 colunas e larguras fixas em px)
8. `app/(app)/master/page.tsx:210, 486, 719` (3 tabelas: usuários, workspaces, logs)
- **Proposta de Solução (Fase 6.4):** Criar o componente `<ResponsiveTable/>` que renderiza cards (label-value) abaixo de `md` (768px) e tabela tradicional com overflow isolado em telas maiores.

### 4.6 Kanban e Lead Card
- Colunas do Kanban usam largura fixa `w-72` (288px) com scroll horizontal ríspido. Em mobile (320–390px), duas colunas cortadas poluem a visão.
- O componente `lead-card.tsx` tem **zero breakpoints** (`sm:`, `md:`, `lg:`).
- Não há alternativa acessível para drag-and-drop no mobile.
- **Proposta de Solução:** Adicionar seletor/chips de coluna no mobile exibindo uma coluna com scroll-snap, e menu contextual com a ação "Mover para..." em cada card.

### 4.7 Inbox (WhatsApp Chat)
- Atualmente divide a tela em 3 colunas com larguras fixas (`w-[280px]`, `w-full`, `w-[240px]`).
- No mobile, o usuário precisa de um fluxo linear clássico: Lista de Conversas ➔ Conversa Selecionada (com botão voltar no topo) ➔ Painel de Informações do Lead (drawer retrátil).

---

## 5. Plano de Execução por Pull Request e Gestão de Riscos

Seguindo a regra de isolamento estrito e sem alterações fora de escopo:

```
[FASE 0: Diagnóstico] (ATUAL)
         │
         ▼
[FASE 1: Tooling & CI] (PR 1)
 ├── ESLint flat config + scripts check/typecheck/lint/test
 ├── Mock offline de __tests__/ai/generateResponse.test.ts
 ├── Remoção de ignoreBuildErrors e unoptimized: true
 └── CI no GitHub Actions com mocks
         │
         ▼
[FASE 2: Qualidade & Segurança de Código] (PR 2)
 ├── Tipos do banco Supabase em lib/supabase/database.types.ts
 ├── Redução de 75% dos `any` e eliminação de catch vazios
 ├── lib/logger.ts com mascaramento LGPD (telefone/email)
 ├── Validação Zod nas rotas de mutação
 ├── Sanitização de filtro PostgREST em api/leads
 └── Remoção de XSS em meta-ai-chat e hardcodes em test-kleber
         │
         ▼
[FASE 3: Arquitetura & Decomposição Modular] (PR 3 - Sub-PRs)
 ├── Testes de caracterização prévios para cada módulo
 ├── PR 3.1: api/whatsapp/webhook (parser, LID, deduplicação, auto-cadastro)
 ├── PR 3.2: api/automation/worker (anti-ban, D+1/2/3, rate limits)
 ├── PR 3.3: lib/ai/inboxHandler (escalada, RAG, regras)
 ├── PR 3.4: lib/leads-store (operações, hibernação, sync)
 ├── PR 3.5: components/kanban-board (container vs apresentação)
 └── PR 3.6: páginas gigantes (automacoes, meta-ads, arquivados)
         │
         ▼
[FASE 4: Dados & Performance] (PR 4)
 ├── LEAD_LIST_COLUMNS e eliminação de 58+ select("*")
 ├── Provider unificado de Realtime (1 canal multiplexado)
 ├── Migração de setInterval para SWR / visibilitychange
 └── Dynamic imports de recharts, xyflow e dnd
         │
         ▼
[FASE 5: Resiliência & Experiência] (PR 5)
 ├── error.tsx, loading.tsx e not-found.tsx em (app)
 ├── Mutações otimistas com rollback no Kanban e Arquivados
 ├── Migração de 11 <img> para next/image
 └── Acessibilidade: foco visível, ESC fecha modais, reduced-motion
         │
         ▼
[FASE 6: Fundação de Design Responsivo] (PR 6)
 ├── Tokens 8pt em app/globals.css e scripts/check-spacing.mjs
 ├── Inputs 16px (sem zoom iOS) e botões >=44px no mobile
 ├── Barra de navegação inferior mobile (5 rotas)
 ├── Componente <ResponsiveTable/> aplicado
 ├── Kanban responsivo com abas e ação "Mover para..."
 └── Redesenho responsivo do LeadCard e Inbox
```

### Análise de Riscos e Mitigações

| Risco Identificado | Impacto | Estratégia de Mitigação Obrigatória |
|---|---|---|
| **Regressão no fluxo "Arquivar com data para reaparecer"** | Crítico | Execução da suíte `__tests__/leads/hibernacao-arquivados.test.ts` em cada commit e inclusão de teste de equivalência na Fase 3. |
| **Quebra do Webhook do WhatsApp / perda de mensagens** | Crítico | Testes de caracterização completos (com payloads reais mockados de texto, áudio, localização e reações) antes de extrair qualquer linha de `webhook/route.ts`. |
| **Envio duplicado ou disparo fora do horário comercial pelo worker** | Crítico | Testar isoladamente a lógica de pure-business-logic do worker (anti-ban e janela de envio) desacoplada de chamadas de banco. |
| **Alteração inadvertida em RLS ou auth** | Bloqueante | Escopo negativo estritamente preservado: nenhum arquivo de política ou client de autenticação com localStorage será modificado. |
| **Divergência de tipos Supabase sem acesso ao servidor** | Médio | Como o comando `supabase gen types` requer credenciais ativas do projeto remoto, os tipos serão derivados e verificados contra os 34 scripts de migration e tabelas existentes em `lib/supabase/database.types.ts`. |

---

## 6. Lista de Fluxos Críticos Cobertos por Testes de Caracterização (Fase 3)

Antes de iniciar a divisão de qualquer arquivo gigante na Fase 3, os seguintes testes de caracterização serão gravados:

1. **Webhook do WhatsApp (`api/whatsapp/webhook`):**
   - Deduplicação de `messageId` idêntico em rajada.
   - Mensagem de lead originada de anúncio do Meta (Click-to-WhatsApp) com atribuição automática de corretor e tag.
   - Conversa iniciada por contato existente com resolvedor de LID vs JID padrão.
   - Mensagem enviada pelo corretor/humano pausando automaticamente a IA.
2. **Worker de Automação (`api/automation/worker`):**
   - Pausa global ativada impedindo qualquer envio.
   - Respeito ao limite estrito de anti-ban (máximo 30 mensagens por hora por instância).
   - Cadência temporal D+1, D+2, D+3 calculando horários e pulando domingos/fora de expediente.
3. **Inbox e Escalada de IA (`lib/ai/inboxHandler`):**
   - Gatilhos de frustração ou pedido explícito de humano ativando escalada e notificando gestor.
   - Fallback gracioso quando o modelo de IA responde com erro ou tempo limite.
4. **Armazenamento e Hibernação de Leads (`lib/leads-store`):**
   - Lead arquivado com motivo, observação e data futura saindo do funil ativo.
   - Reativação na data ou desarquivamento manual promovendo lead para "Novo Lead", com tag original e marca visual.
   - Mutações otimistas revertendo estado local em caso de falha de conexão.
5. **Kanban Geral (`components/kanban-board`):**
   - Movimentação de card entre etapas atualizando o status do lead sem perda de metadados.
   - Filtragem composta (busca textual + corretor + tags + reativados).
6. **Campanhas de Meta Ads (`app/(app)/meta-ads`):**
   - Totalizadores de gasto, impressões e CPL calculados fielmente a partir do payload da Meta Graph API.
7. **Gestão de Arquivados (`app/(app)/arquivados`):**
   - Ações em lote aplicando atualização atômica de data e corretor para múltiplos registros.
8. **Validação de Formulários (`lead-form` / `arquivar-lead-dialog`):**
   - Bloqueio de submissão com data de reaparecimento no passado ou sem motivo preenchido.

---

## 7. Progresso da Execução

### FASE 1 — Build, Tooling e CI (Concluída em PR #17)
- [x] Remoção de \`typescript.ignoreBuildErrors\` e \`images.unoptimized\` de \`next.config.mjs\`.
- [x] Instalação e configuração de ESLint 9 Flat Config (\`eslint.config.mjs\`) com \`@next/next\` e \`react-hooks\`.
- [x] Padronização de metadados: pacote renomeado para \`"crm-colucci"\`, engines (Node >=20, pnpm >=9), \`.nvmrc\` (22).
- [x] Isolamento de testes offline: mock de Supabase e OpenAI em \`__tests__/ai/generateResponse.test.ts\` e separação do teste de integração em \`test:int\`.
- [x] Documentação e auditoria: criação de \`.env.example\`, \`README.md\` profissional e documentação de migrações canônicas em \`supabase/migrations/README.md\`.
- [x] CI GitHub Actions rodando \`pnpm check\` (\`typecheck\`, \`lint\`, \`test\`, \`build\`) 100% verde.

### FASE 2 — Qualidade de Código e Segurança (Concluída em PR #18)
- [x] **Tipagem Supabase:** Mapeamento de todas as 44 tabelas do banco em \`lib/supabase/database.types.ts\`, tipando clientes \`supabase\` (\`client.ts\`), \`supabaseAdmin\` (\`admin.ts\`) e \`wsupabase\` (\`whatsapp/server.ts\`).
- [x] **Logger LGPD:** Criação de \`lib/logger.ts\` com mascaramento automático de telefones, e-mails e proteção de corpo de mensagens. Substituição de todas as 36 chamadas diretas de \`console.*\` por chamadas ao \`logger\`.
- [x] **Padronização de API:** Helpers \`lib/api/response.ts\` (\`ok\`, \`fail\`) e validação de corpo e query com Zod em \`lib/api/validate.ts\`.
- [x] **Segurança:** Sanitização de filtros PostgREST (\`sanitizePostgrestFilter\`), renderização segura contra XSS no chat Meta AI (\`renderSafeBoldText\`), sanitização de \`bootStyle\` e eliminação de telefone pessoal hardcoded.
- [x] **UI & Contraste (Lead Reativado):** Correção do fundo sólido (\`bg-card\`) e contraste de texto para modo noturno e diurno no bloco do lead e banner do Kanban.
- [x] **Testes Unitários:** 4 novas suítes de testes (\`postgrest-sanitize\`, \`safe-markdown\`, \`logger\`, \`api-helpers\`), totalizando 16 arquivos e 128 testes passando.

---

## 8. Próximo Passo: FASE 3 (Arquitetura e Decomposição de Arquivos Grandes)

Conforme estabelecido no planejamento, a Fase 3 atacará os 11 arquivos >600 linhas com **testes de caracterização prévios** e um PR por domínio de arquivo dividido:
1. \`app/(app)/automacoes/page.tsx\` (1.596 linhas)
2. \`app/api/automation/worker/route.ts\` (1.490 linhas)
3. \`app/(app)/meta-ads/page.tsx\` (1.094 linhas)
4. \`app/api/whatsapp/webhook/route.ts\` (1.023 linhas)
5. \`components/kanban-board.tsx\` (1.001 linhas)
6. \`app/(app)/arquivados/page.tsx\` (989 linhas)
7. \`lib/ai/inboxHandler.ts\` (930 linhas)
8. \`lib/leads-store.tsx\` (917 linhas)
9. \`app/(app)/master/page.tsx\` (797 linhas)
10. \`components/kanban-board-locacao.tsx\` (724 linhas)
11. \`app/(app)/automacoes/nova/page.tsx\` (604 linhas)

**Aguardando autorização expressa do usuário para iniciar a FASE 3.**
