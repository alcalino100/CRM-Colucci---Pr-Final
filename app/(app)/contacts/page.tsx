import Link from "next/link"
export default function ContactsPage(){
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">Contacts</h1>
      <p className="text-sm text-muted-foreground">Lista completa de contatos — em breve. Por enquanto use o widget no <Link href="/inbox" className="text-cyan-600 underline">Inbox</Link>.</p>
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Mock: 120 contatos cadastrados</div>
    </div>
  )
}
