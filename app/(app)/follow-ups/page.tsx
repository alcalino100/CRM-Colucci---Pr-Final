import Link from "next/link"
export default function FollowUpsPage(){
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">Follow-ups</h1>
      <p className="text-sm text-muted-foreground">Histórico de follow-ups automáticos — em breve. Veja o status no <Link href="/inbox" className="text-cyan-600 underline">Inbox</Link>.</p>
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Mock: 8 follow-ups ativos</div>
    </div>
  )
}
