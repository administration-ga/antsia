/**
 * L'avis d'un geste de protection (MB-04) : il SURVIT à la surface qui l'a
 * déclenché. Bloquer retire aussitôt la publication, le commentaire ou la
 * conversation de l'écran, souvent avant que la réponse du moteur ne revienne :
 * le geste a eu lieu, il se dit ici, au-dessus de la barre des destinations
 * (équivalent natif du toast du site). Le texte est annoncé aux lecteurs
 * d'écran par `Status` (iOS explicitement, région vivante sous Android).
 *
 * Monté une fois par session de membre (`ReadyMember`) : un changement de
 * personne ou de session le remonte, et l'avis d'une autre session disparaît.
 * Hors fournisseur, `notify` ne fait rien (aucun écran ne casse).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Pressable, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { NativeIcon } from "./icon"
import { Status } from "./ui"

type Notice = { id: number; text: string; error: boolean }
type NoticeState = { notice: Notice | null; notify: (text: string, error?: boolean) => void; dismiss: () => void }
const NOTICE_MS = 8_000
const NoticeContext = createContext<NoticeState>({ notice: null, notify: () => undefined, dismiss: () => undefined })

/** `notify(texte, erreur)` : l'avis remplace le précédent et s'efface seul après quelques secondes. */
export function useNativeNotice(): Pick<NoticeState, "notify"> {
  return useContext(NoticeContext)
}

export function NativeNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const counter = useRef(0)
  const notify = useCallback((text: string, error = false) => { counter.current += 1; setNotice({ id: counter.current, text, error }) }, [])
  const dismiss = useCallback(() => setNotice(null), [])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(current => current?.id === notice.id ? null : current), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  const value = useMemo(() => ({ notice, notify, dismiss }), [notice, notify, dismiss])
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>
}

/** Le bandeau, toujours monté (le nœud d'annonce reste en place), vide sans avis. */
export function NativeNoticeBanner() {
  const { tokens, t } = useNativeAppearance(), { notice, dismiss } = useContext(NoticeContext)
  return <View style={notice ? { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginBottom: 8, paddingLeft: 14, borderRadius: tokens.radiusField, borderWidth: 1, borderColor: notice.error ? tokens.danger : tokens.border, backgroundColor: tokens.card } : undefined}>
    <View style={notice ? { flex: 1, paddingVertical: 10 } : undefined}><Status label={notice?.text ?? ""} error={notice?.error ?? false} /></View>
    {notice ? <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.safety.notice.close")} onPress={dismiss} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><NativeIcon name="close" size={18} /></Pressable> : null}
  </View>
}
