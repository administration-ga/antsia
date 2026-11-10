"use client"

/**
 * SuggestionRelationActions — les deux formules de relation d'une personne
 * suggérée (étude du 22/10/2026). Écrit pour le moteur, aucun équivalent au socle.
 *
 *  · SUIVRE (`graph.follows`) : unilatéral, on voit ses publications sans être
 *    amis. « Suivre en retour » quand la personne vous suit déjà (`followsYou`
 *    du catalogue), puis « Suivi » : un second geste retire le suivi.
 *  · AJOUTER (`graph.connections`) : la demande de connexion. Acceptée, chacun
 *    voit les publications de l'autre — être ami vaut suivre. Son état vient du
 *    SERVEUR (`relationState`) et son geste du parent (verrou partagé de
 *    `useConnectionRequest`) : « Demande envoyée » une fois partie ; quand
 *    l'invitation vient de l'autre, « Répondre à l'invitation » mène à la
 *    sous-vue Invitations, où la réponse se donne.
 *
 * Boutons compacts de 25 px (`COMPACT_SOCIAL_ACTION_STYLE`) ; Suivre à la
 * couleur des relations tant qu'il est possible, Ajouter en tonal (ADR-0027 :
 * une seule couleur vive pour le geste dominant).
 */

import { api, type Id } from "@antsia/api/engine"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Button } from "@antsia/ui"
import { useMutation } from "convex/react"
import { Check, UserPlus } from "lucide-react"
import { useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { COMPACT_SOCIAL_ACTION_STYLE } from "../social-action-style"
import { peopleViewHref, relationErrorText } from "./people-panel"
import { followActionKey, offersInvitationAnswer, relationActionDisabled, relationActionLabel, type SuggestionRelationState } from "./suggestions-actions"

export interface SuggestionRelationPerson {
  personId: Id<"persons">
  handle: string
  displayName: string
  relationState: SuggestionRelationState
  /** Facultatif : absent tant que le backend qui le calcule n'est pas déployé. */
  followsYou?: boolean
}

/** Le geste « Ajouter », tenu par le parent : un seul verrou de demande pour tout l'écran. */
export interface SuggestionConnectControl {
  busy: boolean
  disabled: boolean
  waitLabel: string | null
  onConnect: () => void
}

const ACTION_STYLE: CSSProperties = {
  ...COMPACT_SOCIAL_ACTION_STYLE,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 13,
}

/**
 * « Suivre » seul : Suivre, Suivre en retour, puis Suivi (un second geste retire
 * le suivi). Servi aussi par le catalogue du volet Relations.
 */
export function SuggestionFollowButton({
  person,
  width,
  onFollowChange,
}: {
  person: Pick<SuggestionRelationPerson, "personId" | "handle" | "displayName" | "followsYou">
  width?: CSSProperties["width"]
  onFollowChange?: (handle: string, following: boolean) => void
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const follow = useMutation(api.modules.graph.follows.follow)
  const unfollow = useMutation(api.modules.graph.follows.unfollow)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  const followKey = followActionKey({ following, followsYou: person.followsYou === true })

  const toggleFollow = async () => {
    if (followBusy) return
    setFollowBusy(true)
    try {
      if (following) {
        await unfollow({ networkId, targetPersonId: person.personId })
        setFollowing(false)
        onFollowChange?.(person.handle, false)
        toast.success(t("suggestionRelation.unfollowed", { name: person.displayName }))
      } else {
        await follow({ networkId, handle: person.handle })
        setFollowing(true)
        onFollowChange?.(person.handle, true)
        toast.success(t("suggestionRelation.followed", { name: person.displayName }))
      }
    } catch (error) {
      toast.error(relationErrorText(error, "reseau:suggestionRelation.followFailed", t))
    } finally {
      setFollowBusy(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={following ? "secondary" : "social"}
      disabled={followBusy}
      aria-busy={followBusy || undefined}
      aria-label={t(`suggestionRelation.${followKey}Label`, { name: person.displayName })}
      style={{ ...ACTION_STYLE, width }}
      onClick={() => void toggleFollow()}
    >
      {following ? <Check aria-hidden="true" size={14} strokeWidth={2.4} /> : null}
      {t(`suggestionRelation.${followKey}`)}
    </Button>
  )
}

export function SuggestionRelationActions({
  person,
  connect,
  layout = "stack",
  onFollowChange,
}: {
  person: SuggestionRelationPerson
  connect: SuggestionConnectControl
  /** `stack` : pleine largeur, l'un sous l'autre (carrousel) ; `row` : côte à côte (rail). */
  layout?: "stack" | "row"
  /** Le parent retient la carte d'une personne suivie : le catalogue, lui, l'écarte. */
  onFollowChange?: (handle: string, following: boolean) => void
}) {
  const { t } = useTranslation("reseau")
  const routes = useRoutes()
  const width = layout === "stack" ? "100%" : undefined
  const open = person.relationState === "none"
  return (
    <div className="rp-relation-actions" data-layout={layout}>
      <SuggestionFollowButton person={person} width={width} onFollowChange={onFollowChange} />
      {offersInvitationAnswer(person.relationState) ? (
        <Link href={peopleViewHref("invitations", routes.home())} className="rp-relation-answer" style={{ ...ACTION_STYLE, width }}>
          {t("peopleActions.answerInvitation")}
        </Link>
      ) : (
        <Button
          type="button"
          size="sm"
          // Ajouter : tonal tant que la demande est possible, neutre une fois partie.
          variant={open ? "secondary" : "ghost"}
          disabled={relationActionDisabled(person.relationState, connect.busy) || connect.disabled}
          aria-busy={connect.busy || undefined}
          style={{ ...ACTION_STYLE, width, ...(open ? null : { color: "var(--muted-foreground)" }) }}
          onClick={connect.onConnect}
        >
          {open && !connect.busy ? <UserPlus aria-hidden="true" size={14} strokeWidth={2.2} /> : null}
          {(open && connect.waitLabel) || (open && !connect.busy ? t("peopleActions.add") : relationActionLabel(person.relationState, connect.busy, t))}
        </Button>
      )}
    </div>
  )
}
