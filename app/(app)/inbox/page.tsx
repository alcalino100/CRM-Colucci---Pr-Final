import { InboxClient } from "@/components/inbox/InboxClient"
import { RequireGestor } from "@/components/RequireGestor"

export const metadata = { title: "Inbox - CRM" }

export default function InboxPage(){
  // Server Component: layout + SEO, client interactivity fica em InboxClient
  return <RequireGestor><InboxClient /></RequireGestor>
}
