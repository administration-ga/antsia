"use client"

import { CommercialConversationView, icomProHref } from "@antsia/social-features/messagerie"
import { useNetwork } from "@antsia/api/network"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { routes } from "@/lib/routes"
import { ContactCrm } from "./contact-crm"
import { ContactInbox } from "./contact-inbox"

/** L'application ANTSIA seule injecte son canal boutique dans la destination iCom. */
export function useCommercialMessages() {
  const router = useRouter()
  const { networkId, personId } = useNetwork()
  return useMemo(() => ({
    renderList: (query: string) => <ContactInbox query={query} />,
    renderConversation: (threadId: string) => <CommercialConversationView key={JSON.stringify([networkId, personId, threadId])} threadId={threadId} onBack={() => router.push(icomProHref(routes.messages()))} onOpenOffer={(handle, offerRef) => router.push(routes.shopOffer(handle, offerRef))} renderExtras={(thread) => <ContactCrm thread={thread} />} />,
  }), [router, networkId, personId])
}
