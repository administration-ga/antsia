"use client"

import { api } from "@convex/_generated/api"
import { useMutation } from "convex/react"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useSessionState } from "@/components/use-session-state"
import { forgetDemoAccount, pendingDemoAccount } from "@/lib/demo-accounts"

/** Le fuseau des comptes de démonstration : celui du réseau. */
const DEMO_TIME_ZONE = "Africa/Libreville"

/**
 * Développement local ou démonstration déclarée : après une connexion de démonstration (`DemoAccountsPanel`),
 * rejoue l'ACCUEIL RÉEL — consentement, préférences, profil publié, par les
 * mêmes mutations que l'écran d'accueil — puis équipe le compte en son acteur
 * (`equipMyDemoAccount` : entrée dans la racine, identité, page, vitrine, rôle).
 * Sans compte de démonstration en attente dans cet onglet, il ne fait rien ;
 * le serveur refuse l'équipement hors du développement local et de la démonstration déclarée.
 */
export function DemoAccountBootstrap() {
  const session = useSessionState()
  const { t } = useTranslation("antsia")
  const running = useRef(false)
  const recordConsent = useMutation(api.modules.people.consents.recordConsent)
  const setPreferences = useMutation(api.modules.people.preferences.setMyPreferences)
  const publishMyProfile = useMutation(api.modules.people.profile.publishMyProfile)
  const equip = useMutation(api.modules.platform.demoAccounts.equipMyDemoAccount)
  const person = session.status === "welcome" || session.status === "member" ? session.person : null

  useEffect(() => {
    if (running.current || person === null) return
    const account = pendingDemoAccount()
    if (account === null) return
    const profile = account.profile
    // Le nouvel arrivant remplit l'accueil lui-même.
    if (profile === null) {
      forgetDemoAccount()
      return
    }
    running.current = true
    void (async () => {
      try {
        if (!person.published) {
          if (!person.consentsInForce.includes("social_profile")) await recordConsent({ purpose: "social_profile", origin: "onboarding" })
          await setPreferences({ locale: "fr", timeZone: DEMO_TIME_ZONE })
          await publishMyProfile({ handle: profile.handle, displayName: profile.displayName, headline: profile.headline })
        }
        await equip({ actor: account.actor })
        toast.success(t("demo.ready", { name: profile.displayName }))
      } catch {
        toast.error(t("demo.failed"))
      } finally {
        forgetDemoAccount()
      }
    })()
  }, [person, recordConsent, setPreferences, publishMyProfile, equip, t])

  return null
}
