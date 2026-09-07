import { InboxClient } from "@/components/inbox/InboxClient"

export const metadata = { title: "Inbox - CRM" }

export default function InboxPage(){
  // Server Component: layout + SEO, client interactivity fica em InboxClient
  return <InboxClient />
}
