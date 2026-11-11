# CRM Colucci Imóveis

CRM imobiliário moderno, focado em alta conversão de leads, automações inteligentes de follow-up via WhatsApp, orquestração de IA com detector de escalada para corretores, gestão de hibernação/arquivamento programado e integração com Meta Ads.

---

## 🛠️ Stack Tecnológica

- **Framework Web:** Next.js 16 (App Router com Turbopack), React 19, TypeScript 5.7
- **Estilização & Design:** Tailwind CSS 4.2, Shadcn UI / Radix primitives, Lucide Icons, Framer Motion
- **Banco de Dados & Realtime:** Supabase (PostgreSQL, Supabase Realtime, Storage)
- **Mensageria & WhatsApp:** Evolution API (v2), webhook com deduplicação e resolvedor de LID
- **Inteligência Artificial:** OpenAI GPT-4o-mini / Gemini Flash (RAG, detector de sentimentos e transcrição de áudio)
- **Fluxos & Kanban:** `@xyflow/react`, `@hello-pangea/dnd`, `@tanstack/react-virtual`
- **Qualidade & Testes:** Vitest 5, TypeScript (`tsc --noEmit`), ESLint (Flat Config)
- **Gerenciador de Pacotes:** `pnpm` (>= 9.0.0)
- **Ambiente de Runtime:** Node.js 20+

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- **Node.js:** versão `>= 20.0.0` (recomendado gerenciar via `.nvmrc` com `nvm use`)
- **pnpm:** versão `>= 9.0.0` (`corepack enable` ou `npm install -g pnpm`)

### 1. Clonar e Instalar Dependências
```bash
git clone https://github.com/alcalino100/CRM-Colucci---Pr-Final.git
cd CRM-Colucci---Pr-Final
pnpm install --frozen-lockfile
```

### 2. Configurar Variáveis de Ambiente
Copie o template de variáveis de ambiente:
```bash
cp .env.example .env.local
```
Preencha as chaves no `.env.local` conforme as instruções documentadas no próprio arquivo (Supabase, Evolution API, Meta Ads e OpenAI).

### 3. Rodar em Desenvolvimento
```bash
pnpm dev
```
Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## 📋 Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia o servidor Next.js em modo de desenvolvimento com Turbopack. |
| `pnpm build` | Gera o build otimizado de produção do Next.js. |
| `pnpm start` | Inicia o servidor em modo de produção. |
| `pnpm typecheck` | Executa a checagem estática de tipos do TypeScript (`tsc --noEmit`). |
| `pnpm lint` | Analisa a conformidade do código via ESLint. |
| `pnpm test` | Executa a suíte de testes unitários rápidos e isolados via Vitest. |
| `pnpm test:int` | Executa testes de integração (requer conectividade de banco/provedor). |
| `pnpm check` | Roda em sequência: `typecheck` ➔ `lint` ➔ `test` ➔ `build`. |

---

## 🏗️ Arquitetura Resumida

```
├── app/                        # Next.js App Router
│   ├── (app)/                  # Rotas autenticadas da aplicação (Painel, Kanban, Arquivados, etc.)
│   ├── api/                    # Rotas de API e endpoints de cron jobs protegidos
│   ├── layout.tsx              # Root Layout com inicialização de marca e dark mode
│   └── globals.css             # Tailwind v4, temas CSS e variáveis semânticas
├── components/                 # Componentes de UI reutilizáveis e painéis
│   ├── inbox/                  # Interface do WhatsApp Inbox e chat
│   ├── automation/             # Componentes do construtor de fluxos e nós
│   └── ui/                     # Primitivos de interface e botões
├── lib/                        # Lógica de negócio, clientes e utilitários
│   ├── ai/                     # Transcrição, detecção de escalada e prompts
│   ├── supabase/               # Conexões cliente e admin com Supabase
│   ├── whatsapp/               # Clientes e rotinas para Evolution API
│   └── leads-store.tsx         # Store Zustand de sincronização de leads
├── supabase/                   # Migrations canônicas e histórico do banco
│   └── migrations/             # Migrações versionadas (fonte canônica)
├── docs/                       # Documentação técnica, baselines e relatórios
└── __tests__/                  # Suíte de testes com Vitest
```

---

## 🧪 Como Rodar os Testes

Para rodar todos os testes unitários isolados e offline:
```bash
pnpm test
```

Para rodar em modo watch durante o desenvolvimento:
```bash
pnpm vitest
```

Para validar a integridade completa antes de abrir um Pull Request:
```bash
pnpm check
```
