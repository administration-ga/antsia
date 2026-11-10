"use client"

import { IdentityEntry } from "@antsia/social-features/identity"
import { api } from "@convex/_generated/api"
import { useQuery } from "convex/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { DemoAccountsPanel } from "@/components/demo-accounts-panel"
import { CenteredStatus } from "@/components/shared/controls"
import { useSessionState } from "@/components/use-session-state"
import { authClient } from "@/lib/auth-client"
import { browserAppPath } from "@/lib/app-path"
import { parsePublicPostContinuation } from "@/lib/public-post-continuation"
import { parseNotificationReference } from "@/lib/notification-open"
import { parseShopContactContinuation, type ShopContactContinuation } from "@/lib/shop-contact-continuation"
import { parseSpecializedDestination, type SpecializedDestination } from "@/lib/specialized-navigation"
import { routes, specializedDestinationPath } from "@/lib/routes"
import { fencedIdentityEntryClient } from "@/lib/session-bridge-client"

const entryClient = fencedIdentityEntryClient(authClient)

/** Indice de développement local seulement ; le serveur décide s'il peut le rendre. */
function DevCodeHint({ identifier }: { identifier: string }) {
  const { t } = useTranslation("identity")
  const latest = useQuery(api.modules.platform.devTools.latestOtp, { email: identifier })
  if (!latest) return null
  return <div className="rounded-lg border border-dashed border-border bg-muted px-4 py-3 text-sm"><p className="font-mono text-base">{t("localCode", { code: latest.code })}</p><p className="text-xs text-muted-foreground">{t("localCodeHint")}</p></div>
}

/** Même porte sur l'accueil et /entrer ; le fournisseur garde toute l'autorité. */
export function SignInCard({ compact = false, intent = "sign-in", signOutIncomplete = false, publicPostId, notificationReference, shopContact, specializedDestination }: {
  compact?: boolean
  intent?: "sign-in" | "sign-up"
  signOutIncomplete?: boolean
  publicPostId?: string
  notificationReference?: string
  shopContact?: ShopContactContinuation
  specializedDestination?: SpecializedDestination
}) {
  const { t } = useTranslation("antsia")
  const { t: tIdentity } = useTranslation("identity")
  const router = useRouter()
  const session = useSessionState()
  const configuration = useQuery(api.modules.platform.authentication.configuration, {})
  const signUp = intent === "sign-up"
  const continuationPostId = parsePublicPostContinuation(publicPostId)
  const notification = continuationPostId ? undefined : parseNotificationReference(notificationReference)
  const contact = continuationPostId || notification ? undefined : parseShopContactContinuation(shopContact)
  const space = continuationPostId || notification || contact ? undefined : parseSpecializedDestination(specializedDestination)
  const destination = continuationPostId ? routes.memberPost(continuationPostId) : notification ? routes.openNotification(notification) : contact ? routes.shopContact(contact.handle, contact.offerRef) : specializedDestinationPath(space) ?? routes.feed()
  const welcomePath = routes.welcome(continuationPostId, notification, contact, space)

  useEffect(() => {
    if (signOutIncomplete) return
    if (session.status === "restricted") router.replace(routes.personalControls())
    else if (session.status === "member") router.replace(destination)
    else if (session.status === "welcome") router.replace(welcomePath)
  }, [session.status, signOutIncomplete, destination, welcomePath, router])

  if (session.status === "loading" || (!signOutIncomplete && (session.status === "restricted" || session.status === "member" || session.status === "welcome"))) return <CenteredStatus label={t("session.checking")} />

  return (
    <div className={compact ? "rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg sm:p-6" : undefined}>
      {signOutIncomplete ? <p role="alert" className="mb-6 rounded-lg border border-border bg-muted p-4 text-sm">{tIdentity("signOutIncomplete")}</p> : null}
      <IdentityEntry
        key={intent}
        authClient={entryClient}
        configuration={configuration}
        callbackURL={browserAppPath(welcomePath)}
        onAuthenticated={() => window.location.assign(browserAppPath(welcomePath))}
        renderLocalCode={(identifier) => <DevCodeHint identifier={identifier} />}
        presentation={compact ? "compact" : "default"}
        headingLevel={compact ? 2 : 1}
        title={signUp ? t("access.signUpTitle") : compact ? t("access.signInTitle") : undefined}
        lead={signUp ? t("access.signUpLead") : compact ? "" : undefined}
      />
      <div className="mt-5 border-t border-border pt-5 text-center">
        {!signUp ? <p className="mb-3 text-sm text-muted-foreground">{t("access.newHere")}</p> : null}
        <Link href={routes.signIn(signUp ? undefined : "sign-up", continuationPostId, notification, contact, space)} prefetch={false} style={compact && !signUp ? { background: "var(--esp-green-strong)", color: "var(--on-fill)" } : undefined} className={compact ? `inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 py-3 text-base font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 sm:w-auto ${signUp ? "border border-border text-primary" : ""}` : "inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"}>
          {t(signUp ? "access.existingAccount" : "access.createAccount")}
        </Link>
        {!signUp ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("access.accountPromise")}</p> : null}
      </div>
      {/* Développement local, ou déploiement de démonstration déclaré : le serveur en décide, le catalogue est vide ailleurs. */}
      {configuration && (configuration.localCodes || "demoAccounts" in configuration && configuration.demoAccounts === true) ? <DemoAccountsPanel authClient={entryClient} shared={!configuration.localCodes} /> : null}
    </div>
  )
}
