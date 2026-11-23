import { redirect } from "next/navigation"

// O Chat foi unificado ao Inbox (mesma base de conversas, com mais recursos).
export default function ChatPage() {
  redirect("/inbox")
}
