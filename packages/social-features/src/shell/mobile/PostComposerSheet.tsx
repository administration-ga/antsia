// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/mobile/PostComposerSheet.tsx @ ad2e7fdc2 — adaptations : déplacé dans la coque (`shell/mobile/`) ; surface plein écran et seuil mobile de `@antsia/ui/overlay` (la surface porte la charte de l'application, plus celle de l'espace personnel) ; titre, boutons, annonce et nom accessible par l'i18n (clés `reseau:postComposerSheet.*`) ; commentaires sans la conférence (le direct n'existe pas encore dans le moteur) ; comportement inchangé (fermer conserve, abandonner se confirme en place).
"use client"

/**
 * PostComposerSheet — publier une PUBLICATION, depuis une surface ouverte par
 * un geste.
 *
 * ⚠️ Ce composant a changé de portée le 2026-08-20 : il servait le seul
 * téléphone (le composeur du bureau était monté EN PERMANENCE en tête du fil),
 * il sert désormais les DEUX. Le composeur permanent a été retiré du fil —
 * il occupait deux cents pixels au-dessus de la première publication, alors
 * que le geste vit maintenant dans la barre d'identité ÉPINGLÉE. Cette surface
 * est donc la SEULE porte d'une publication au bureau : la refermer sans la
 * remplacer retirerait la capacité de publier dans le fil.
 *
 * ⚠️ C'est le MÊME `PostComposer`, pas une copie. Sa clé d'idempotence, ses
 * médias, sa borne de longueur et son défaut d'audience (le plus restreint) —
 * tout cela est du domaine, et une seconde implémentation les aurait perdus
 * un par un.
 *
 * ── LA POSE EST CELLE DE LA CARTE D'ACTU, ET C'EST UNE RÈGLE ──────────────
 * `composeSheetPose` (module pur) décide : plein écran au téléphone, carte
 * flottante compacte au bureau. Publier une actu, un statut ou une
 * publication sont trois portes d'un même geste ; trois géométries
 * d'ouverture seraient trois produits. Un cliquet
 * (`reseau-layout.test.ts`) interdit à cette décision de diverger de celle
 * des actus.
 *
 * ⚠️ `ImmersiveOverlay` et non un `Sheet` : le composeur porte un champ de
 * saisie, et le clavier mange la moitié de la hauteur. Seule la surface
 * immersive suit `visualViewport` — une feuille calée sur `dvh` placerait le
 * bouton « Publier » derrière le clavier. Portalisée vers `body`, elle porte
 * la charte de l'APPLICATION (celle de `<html>`, lue par la surface
 * immersive) : elle ne sort pas du thème du réseau.
 *
 * ── FERMER N'EST PAS ABANDONNER (R-12, 2026-09-06) ────────────────────────
 * Depuis que le brouillon vit dans `post-draft-store.ts`, « Fermer » le
 * CONSERVE : rouvrir la feuille — y compris après une bascule 959→960→959 —
 * retrouve texte, audience, médias et clé d'idempotence. L'abandon devient
 * donc un geste À PART, offert seulement quand il y a quelque chose à
 * abandonner, et confirmé EN PLACE : un `AlertDialog` imbriqué se rendrait
 * SOUS cette surface (`z-index`), et l'usager cliquerait dans le vide.
 */

import { Button } from "@antsia/ui"
import { ImmersiveOverlay, useIsReseauMobile } from "@antsia/ui/overlay"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { PostComposer } from "../../features/reseau-personnel/PostComposer"
import { isDraftEmpty, postDraftKey } from "../../features/reseau-personnel/post-draft"
import { postDraftStore, usePostDraft } from "../../features/reseau-personnel/post-draft-store"
import { composeSheetPose } from "../reseau-layout"

/** La feuille ne compose QUE dans le fil — les murs de groupe et les pages
 *  montent le composeur en ligne, avec leur propre cible. */
const FEED_DRAFT_KEY = postDraftKey({ kind: "feed" })

export interface PostComposerSheetProps {
  open: boolean
  onClose: () => void
}

export function PostComposerSheet({ open, onClose }: PostComposerSheetProps) {
  const { t } = useTranslation("reseau")
  const pose = composeSheetPose(useIsReseauMobile())
  const draft = usePostDraft(FEED_DRAFT_KEY, "")
  const vide = isDraftEmpty(draft)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  // La demande d'abandon ne SURVIT pas à la fermeture : rouvrir la feuille sur
  // deux boutons rouges surprendrait qui vient seulement reprendre son texte.
  useEffect(() => {
    if (!open) setConfirmingDiscard(false)
  }, [open])
  useEffect(() => {
    if (vide) setConfirmingDiscard(false)
  }, [vide])

  const corps = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: "var(--foreground)",
          }}
        >
          {t("postComposerSheet.title")}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {vide ? null : confirmingDiscard ? (
            <>
              {/* La bascule ne change RIEN pour qui n'a pas l'écran si elle ne
                  s'annonce pas : la région le dit, et le bouton destructeur
                  prend le focus. */}
              <span role="status" aria-live="polite" className="sr-only">
                {t("postComposerSheet.confirmAnnouncement")}
              </span>
              <Button
                variant="danger"
                size="sm"
                autoFocus
                onClick={() => {
                  postDraftStore.discard(FEED_DRAFT_KEY)
                  setConfirmingDiscard(false)
                  onClose()
                }}
              >
                {t("postComposerSheet.confirmDiscard")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDiscard(false)}
              >
                {t("postComposerSheet.back")}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              onClick={() => setConfirmingDiscard(true)}
            >
              {t("postComposerSheet.discard")}
            </Button>
          )}
          {/* Une sortie VISIBLE, en plus d'Échap : au téléphone il n'y a pas de
              touche Échap, et un dialogue sans bouton de fermeture ne se quitte
              que par le geste « retour » du système — qui, lui, quitte la page.
              ⚠️ Fermer CONSERVE le brouillon (cf. en-tête). */}
          <Button variant="ghost" size="sm" icon="x" onClick={onClose}>
            {t("postComposerSheet.close")}
          </Button>
        </div>
      </div>
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: 12,
          // La place que le clavier prend en bas, publiée par
          // `useVisualViewport`. Sans elle, la dernière ligne du composeur
          // reste sous le clavier et rien ne permet de l'atteindre.
          paddingBottom: "calc(12px + var(--kb-inset, 0px))",
        }}
      >
        <PostComposer autoFocus onPublished={onClose} />
      </div>
    </>
  )

  return (
    <ImmersiveOverlay
      open={open}
      onClose={onClose}
      label={t("postComposerSheet.title")}
      scrim={pose === "card"}
    >
      {/* Garder les mêmes parents au changement de taille : le sélecteur natif
          garde une référence au champ de fichier pendant son ouverture. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            padding: pose === "card" ? 16 : 0,
          }}
        >
          <div
            style={{
              // Les mêmes traits que la carte d'actu (`.st-compose-frame`) :
              // même rayon, même filet, même fond. Seule la LARGEUR change, et
              // pour une raison mesurée — la rangée d'outils du composeur
              // (média, audience, décompte, publier) se replie sur trois
              // lignes en dessous de ~520 px, ce qui donnait l'écran signalé
              // le 2026-08-20, où « Qui peut voir » tenait sur trois lignes.
              display: "flex",
              flexDirection: "column",
              width: pose === "card" ? "min(560px, 100%)" : "100%",
              height: pose === "card" ? undefined : "100%",
              minHeight: 0,
              maxHeight: pose === "card" ? "min(760px, 92dvh)" : "100%",
              borderRadius: pose === "card" ? "var(--esp-primitive-card-radius, 18px)" : 0,
              border: pose === "card" ? "1px solid var(--esp-raised-border, var(--border))" : undefined,
              background: pose === "card" ? "var(--esp-surface-raised, var(--background))" : undefined,
              overflow: "hidden",
            }}
          >
            {corps}
          </div>
        </div>
    </ImmersiveOverlay>
  )
}
