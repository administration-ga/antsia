import { browserAppPath } from "@/lib/app-path"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import fr from "@/i18n/locales/fr/antsia.json"
import en from "@/i18n/locales/en/antsia.json"
import { routes } from "@/lib/routes"
import { NOTIFICATION_REFERENCE_PARAM } from "@/lib/notification-open"
import { notificationWorkerScript } from "@/lib/notification-worker"

export function GET() {
  const script = notificationWorkerScript({ title: BRAND_NAME, messages: { fr: fr.personal.pushBody, en: en.personal.pushBody }, openPath: browserAppPath(routes.openNotification()), fallbackPath: browserAppPath(routes.notificationCenter()), referenceParam: NOTIFICATION_REFERENCE_PARAM })
  return new Response(script, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "Service-Worker-Allowed": `${browserAppPath(routes.home()).replace(/\/$/u, "")}/` } })
}
