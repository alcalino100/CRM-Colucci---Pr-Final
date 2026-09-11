"use client"
import React from "react"

// Contém o erro num painel: em vez de derrubar a página inteira
// ("This page couldn't load"), mostra fallback só naquele painel.
export class PanelBoundary extends React.Component<{ nome: string; children: React.ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  componentDidCatch(erro: Error) {
    console.error(`[inbox:${this.props.nome}]`, erro)
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Erro no painel {this.props.nome}</p>
          <p className="max-w-[220px] text-xs text-slate-500">Tente recarregar a página. Se persistir, anote o horário e avise o suporte.</p>
          <button
            onClick={() => this.setState({ erro: null })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Tentar de novo
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
