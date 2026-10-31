// app/api/mcp/meta-ads/route.ts
// Endpoint oficial do servidor MCP (Model Context Protocol) para Meta Ads & CRM Colucci Imobiliária.
// Compatível com JSON-RPC 2.0 (especificação MCP 2024-11-05).
// Pode ser consumido por Antigravity, Claude Desktop, Cursor, scripts externos ou pela UI do CRM.

import { NextResponse } from "next/server"
import { MCP_TOOLS_DEFINITIONS, executeMcpTool } from "@/lib/meta/mcp-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/mcp/meta-ads
 * Retorna as informações do servidor MCP, ferramentas disponíveis e instruções de conexão.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin

  return NextResponse.json({
    name: "colucci-crm-meta-ads-mcp",
    title: "Colucci CRM - Meta Ads & Real Attribution MCP Server",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
    description: "Servidor MCP para auditoria de tráfego imobiliário, reconciliação de anúncios Meta Ads e cálculo de ROAS/CAC com dados reais do Supabase.",
    status: "active",
    endpoint: `${origin}/api/mcp/meta-ads`,
    toolsCount: MCP_TOOLS_DEFINITIONS.length,
    tools: MCP_TOOLS_DEFINITIONS,
    configSnippet: {
      mcpServers: {
        "colucci-meta-ads": {
          url: `${origin}/api/mcp/meta-ads`,
        },
      },
    },
  })
}

/**
 * POST /api/mcp/meta-ads
 * Manipulador JSON-RPC 2.0 para requisições MCP
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { id, method, params } = body

    // 1. Inicialização do MCP
    if (method === "initialize") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "colucci-crm-meta-ads-mcp",
            version: "1.0.0",
          },
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
        },
      })
    }

    // 2. Notificação pós-inicialização
    if (method === "notifications/initialized") {
      return new NextResponse(null, { status: 204 })
    }

    // 3. Ping
    if (method === "ping") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {},
      })
    }

    // 4. Listagem de Ferramentas (tools/list)
    if (method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: MCP_TOOLS_DEFINITIONS,
        },
      })
    }

    // 5. Chamada de Ferramenta (tools/call)
    if (method === "tools/call") {
      const toolName = params?.name
      const toolArgs = params?.arguments || {}

      if (!toolName) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: "Nome da ferramenta não especificado em params.name",
          },
        }, { status: 400 })
      }

      try {
        const resultado = await executeMcpTool(toolName, toolArgs)
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: typeof resultado === "string" ? resultado : JSON.stringify(resultado, null, 2),
              },
            ],
          },
        })
      } catch (err: any) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: `Erro ao executar ferramenta ${toolName}: ${err.message}`,
          },
        })
      }
    }

    // Método desconhecido
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Método não suportado: ${method}`,
      },
    }, { status: 404 })

  } catch (e: any) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: `Parse error: ${e.message}`,
      },
    }, { status: 400 })
  }
}
