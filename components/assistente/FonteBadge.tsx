import { Badge } from "@/components/ui/primitives"

export function FonteBadge({ fonte }: { fonte?: string }) {
  if (!fonte) return null
  return fonte === "banco" ? <Badge variant="green">dados reais</Badge> : <Badge variant="gray">dados de demonstração · tabelas ainda não criadas</Badge>
}
