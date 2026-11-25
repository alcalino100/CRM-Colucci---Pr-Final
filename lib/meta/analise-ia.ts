import { chamarClaudeComFallback, CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO } from "@/lib/ai/claude"
import { resolverCredencialClaude } from "@/lib/assistente/ia-claude"

export type TipoAnalise = "instagram" | "campanhas"

const BASE = `Você é um analista sênior de marketing digital do mercado imobiliário (Colucci Imóveis, interior de SP).
Escreva em português do Brasil, direto e útil para o dono e a equipe comercial.
REGRAS: use SOMENTE os números fornecidos; nunca invente métricas, causas ou resultados; quando a amostra for pequena, diga que a conclusão é preliminar;
valores em reais no formato R$ 1.234,56. Não use tabelas nem emojis em excesso.
FORMATO (markdown simples, títulos com ##):
## Resumo
2-3 frases com o retrato do período (e a comparação com o período anterior, se houver).
## O que funcionou
## Pontos de atenção
## Recomendações
Lista numerada de 3 a 5 ações concretas e priorizadas (o que fazer, onde e por quê).
## Próximo período
1-2 testes ou metas sugeridos.`

const FOCO: Record<TipoAnalise, string> = {
  instagram: "Foco: desempenho de conteúdo no Instagram (formatos, dias/horários, posts de destaque e fracos, engajamento relativo ao alcance, crescimento). Sugira temas e formatos de conteúdo para imóveis.",
  campanhas: "Foco: tráfego pago (Meta Ads) cruzado com o CRM: custo por lead real, qualidade (visitas, fechamentos, VGV, comissão), discrepância entre leads da Meta e do CRM. Cada campanha traz uma ação sugerida pelas regras do sistema; confirme, questione ou refine com base nos números.",
}

/** Gera a análise em texto com o Claude (chave do agente/ambiente já configurada no CRM). */
export async function gerarAnaliseIA(tipo: TipoAnalise, dados: unknown): Promise<{ ok: true; texto: string; modelo: string } | { ok: false; erro: string }> {
  const cred = await resolverCredencialClaude().catch(() => null)
  if (!cred) return { ok: false, erro: "Chave do Claude não configurada." }
  let json = JSON.stringify(dados)
  if (json.length > 14000) json = json.slice(0, 14000) + "…(truncado)"
  try {
    const r = await chamarClaudeComFallback({
      apiKey: cred.apiKey,
      modelos: [CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO],
      system: `${BASE}\n${FOCO[tipo]}`,
      messages: [{ role: "user", content: `Dados do período (JSON):\n${json}` }],
      maxTokens: 1800,
      timeoutMs: 50_000,
      maxRetries: 1,
    })
    return r.texto.trim() ? { ok: true, texto: r.texto.trim(), modelo: r.modelo } : { ok: false, erro: "A IA devolveu uma resposta vazia." }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao gerar a análise." }
  }
}
