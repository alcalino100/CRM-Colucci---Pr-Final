import OpenAI from "openai"

export const createOpenAIClient = (apiKey: string) => new OpenAI({ apiKey })

// Fallback para Gemini se OPENAI_API_KEY não estiver setada (você já tem GEMINI_API_KEY no Vercel)
export function getAIClient(apiKey?: string){
  const key = apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
  if(!key) throw new Error("Nenhuma API key de IA configurada")
  // Se for Gemini, o caller deve usar lib/gemini; aqui mantemos OpenAI como default do guia
  return createOpenAIClient(key)
}
