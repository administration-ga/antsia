"use client"

import { isMemberThemeId, type MemberThemeId } from "@antsia/social-contracts/appearance"
import { ThemeChoiceProvider, useOptionalAppearance } from "@antsia/social-features/shell/appearance"
import { api } from "@convex/_generated/api"
import { useMutation } from "convex/react"
import { type ReactNode, useCallback, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { engineErrorMessage } from "@/lib/engine-errors"
import { createThemeAccountSync, type ThemeAccountSync } from "@/lib/theme-account-sync"

/**
 * Choisir un thème EN SESSION : appliqué tout de suite, enregistré sur le compte ; `null`
 * hors session. Le contexte vit dans le moteur (ADR-0030) : le sélecteur du rail
 * (`AppearanceControl`) s'en sert comme Préférences > Thème.
 */
export { useThemeChoice } from "@antsia/social-features/shell/appearance"

/**
 * Le thème du compte, sous la session : il s'applique à l'appareil (et y reste en
 * cache pour le script d'amorçage), et le choix du membre s'y enregistre — règles
 * dans `lib/theme-account-sync.ts`. Hors session (`signedIn` faux), aucun choix
 * n'est enregistré : le sélecteur retombe sur la mémoire de l'appareil.
 */
export function PersonalTheme({ signedIn, accountTheme, children }: { signedIn: boolean; accountTheme: MemberThemeId | undefined; children: ReactNode }) {
  const appearance = useOptionalAppearance()
  const savePreferences = useMutation(api.modules.people.preferences.setMyPreferences)
  const { t } = useTranslation("antsia")
  // La synchronisation vit aussi longtemps que le composant : créée au montage,
  // elle relit les fonctions courantes plutôt que celles du premier rendu.
  const current = useRef({ setTheme: appearance?.setTheme, savePreferences, signedIn, t })
  const sync = useRef<ThemeAccountSync<MemberThemeId> | null>(null)
  useEffect(() => {
    current.current = { setTheme: appearance?.setTheme, savePreferences, signedIn, t }
  })
  useEffect(() => {
    if (!signedIn) return
    const accountSync = createThemeAccountSync<MemberThemeId>({
      apply: (theme) => current.current.setTheme?.(theme),
      save: (theme) => current.current.savePreferences({ theme }),
      onSaveFailed: (error) => {
        const translate = current.current.t
        toast.error(translate("preferences.theme.saveFailed", { reason: engineErrorMessage(error, translate) }))
      },
    })
    sync.current = accountSync
    return () => {
      accountSync.dispose()
      sync.current = null
    }
  }, [signedIn])

  useEffect(() => {
    if (signedIn) sync.current?.accountChanged(accountTheme)
  }, [signedIn, accountTheme])

  const choose = useCallback((theme: string) => {
    if (current.current.signedIn && isMemberThemeId(theme)) sync.current?.choose(theme)
  }, [])

  return <ThemeChoiceProvider choose={signedIn ? choose : null}>{children}</ThemeChoiceProvider>
}
