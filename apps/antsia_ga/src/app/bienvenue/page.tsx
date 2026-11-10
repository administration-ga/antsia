import type { Metadata } from "next"

import { WelcomeScreen } from "@/components/welcome-screen"
import { getAppT } from "@/i18n/server"
import { parsePublicPostContinuation, PUBLIC_POST_CONTINUATION_PARAM } from "@/lib/public-post-continuation"
import { shopContactFromSearch } from "@/lib/shop-contact-continuation"
import { NOTIFICATION_REFERENCE_PARAM, parseNotificationReference } from "@/lib/notification-open"
import { specializedDestinationFromSearch } from "@/lib/routes"

export function generateMetadata(): Metadata {
  const { t } = getAppT()
  return { title: t("welcome.title") }
}

export default async function WelcomePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams ?? {}
  return <WelcomeScreen publicPostId={parsePublicPostContinuation(search[PUBLIC_POST_CONTINUATION_PARAM])} notificationReference={parseNotificationReference(search[NOTIFICATION_REFERENCE_PARAM])} shopContact={shopContactFromSearch(search)} specializedDestination={specializedDestinationFromSearch(search)} />
}
