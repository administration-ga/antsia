// Écrit pour le moteur (lot U09, épure du 21/10/2026, sans équivalent au socle) : la porte de publication en tête du fil sous l'opt-in adaptatif — la photo du membre, « Quoi de neuf ? », puis Photo et Direct. Elle remplace la carte d'identité, que la destination Profil du rail porte déjà.
"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { Button } from "@antsia/ui"
import type { CSSProperties } from "react"
import { useTranslation } from "react-i18next"

import { Avatar } from "../features/reseau-personnel/Avatar"

/** Le prénom d'un nom affiché : le premier mot qui n'est pas un NOM (écrit en capitales). */
export function firstNameOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  return words.find((word) => word !== word.toLocaleUpperCase("fr")) ?? words[0] ?? ""
}

const FIELD_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  padding: "0 16px",
  border: "1px solid var(--esp-surface-border, var(--border))",
  borderRadius: 999,
  background: "var(--muted)",
  color: "var(--muted-foreground)",
  font: "inherit",
  fontSize: 15,
  textAlign: "left",
  cursor: "pointer",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

export function FeedComposerPrompt({ onPublish, onLive }: { onPublish: () => void; onLive: (() => void) | null }) {
  const { t } = useTranslation("reseau")
  const { t: tDirect } = useTranslation("direct")
  const myPerson = useAuthenticatedConvexQuery(api.modules.people.persons.getMyPerson, {})
  const displayName = myPerson.data?.displayName ?? ""
  const firstName = firstNameOf(displayName)

  return (
    <section className="esk-card rp-composer" aria-label={t("reseauAgentPage.composerLabel")} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <Avatar displayName={displayName} avatarUrl={myPerson.data?.avatar?.url ?? null} size={40} />
        <button type="button" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={FIELD_STYLE} onClick={onPublish}>
          {firstName ? t("reseauAgentPage.composerPrompt", { name: firstName }) : t("reseauAgentPage.composerPromptAnonymous")}
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, borderTop: "1px solid var(--esp-surface-border, var(--border))", paddingTop: 12 }}>
        <Button variant="ghost" size="sm" icon="image" onClick={onPublish}>{t("reseauAgentPage.composerPhoto")}</Button>
        {onLive !== null ? <Button variant="ghost" size="sm" icon="video" onClick={onLive}>{tDirect("create.title")}</Button> : null}
      </div>
    </section>
  )
}
