// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/SuggestionsPanel.tsx @ ad2e7fdc2 — adaptations : catalogue du moteur (`suggestions.suggestions.paginate` et `dismiss`, réseau courant par `useNetwork()`), demande par `graph.connections.requestConnection({ handle })` ; adresses par la table de routes injectée (`useRoutes()` : profil, page réseau pour « Voir tout ») ; refus de POLITIQUE du moteur (`policyRefused` : réseau gouverné qui sert ses propres suggestions) : le rail s'efface au lieu d'afficher une panne ; textes par l'i18n (espace `reseau`, clés `suggestionsPanel.*`) et refus du moteur dits par leur code ; « Agents à découvrir » devient « Personnes à découvrir », opposition personne / administration de la doc retirée (une page n'est plus une administration) ; règles du module sorties du JSX dans une constante (`DISCOVERY_CONTROLS_CSS`), inchangées ; primitives de `@antsia/ui`, surfaces de la coque ; couleurs par fonction (ADR-0027) : « Se connecter » en variante `social` tant que la demande est possible, neutre une fois envoyée ou reçue ; étude du 22/10/2026 (ADR-0037) : deux formules, Suivre (ou Suivre en retour) et Ajouter (`SuggestionRelationActions`), carte d'une personne suivie gardée à sa place (`withRetainedSuggestions`) ; carrousel du fil à la référence des captures (cartes de 168 px, portrait rond, rangée d'un bord à l'autre au téléphone) ; actions de 25 px.
"use client"

/**
 * « Personnes à découvrir » — la mise en relation entre personnes du réseau.
 *
 * ⚠️ Puisées dans l'annuaire du RÉSEAU (membres découvrables), et nulle part
 * ailleurs : suggérer quelqu'un qui ne s'est pas exposé serait l'exposer à sa
 * place. Aucun score d'affinité — mesurer qui fréquente qui est précisément ce
 * que ce module refuse de faire.
 *
 * Quand il n'a rien à proposer, le panneau conserve son titre et explique
 * l'état vide : le faire disparaître donne l'impression que le rail est cassé.
 *
 * Deux formules (étude du 22/10/2026, décision du propriétaire : « on peut suivre
 * et ne pas être ami, et on peut être ami ») : « Suivre » (ou « Suivre en
 * retour ») et « Ajouter » (`SuggestionRelationActions`). Le catalogue écarte les
 * personnes déjà suivies : la carte d'une personne qu'on vient de suivre reste à
 * sa place, le temps du montage, pour dire « Suivi » et permettre de revenir sur
 * le geste (`withRetainedSuggestions`).
 *
 * Au fil (carrousel), la référence des captures du 22/10/2026 : des cartes qui
 * défilent, grand portrait rond, nom, ligne d'appoint, deux boutons de 25 px et
 * « × » ; au téléphone, la rangée court d'un bord à l'autre de l'écran.
 *
 * ⚠️ Deux états ont quitté ce composant le 2026-09-06 (R-05), parce qu'ils y
 * mentaient au rechargement suivant : le MASQUAGE d'une carte, qui vivait dans
 * un `useState` et ne survivait pas au montage, et « Demande envoyée », qui
 * était posé localement alors que la demande, elle, était en base. Les deux
 * viennent maintenant du serveur (`suggestions.dismiss`, `relationState`) —
 * l'ensemble local ne sert plus qu'à retirer la carte AVANT le retour de la
 * mutation.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { Button, Card, Icon, SkeletonCard } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { RESEAU_SURFACE_STYLE } from "../../shell/design-styles"
import { useConnectionRequest } from "./use-connection-request"
import { Avatar } from "./Avatar"
import { personHref } from "./author-link"
import { DiscoveryEmptyCard } from "./DiscoveryEmptyCard"
import { peopleViewHref, relationErrorText } from "./people-panel"
import { SuggestionRelationActions, type SuggestionRelationPerson } from "./SuggestionRelationActions"
import { type DiscoveryPresentation, type RetainedSuggestion, visibleSuggestions, withRetainedSuggestions } from "./suggestions-actions"

/** Le rail montre CINQ noms. La fenêtre demandée est plus large : le serveur
 *  filtre APRÈS sa page, une page courte n'est donc pas une page finale. */
const RAIL_SUGGESTIONS_SHOWN = 5
const RAIL_SUGGESTIONS_SCAN = 24

const SEE_ALL_STYLE = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--primary-600)",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
} as const

/**
 * Les règles du module de découverte, HORS du JSX : un littéral enfant de
 * `<style>` passerait pour une chaîne d'interface (cliquet
 * `no-hardcoded-strings`). Le carrousel (`.rp-sugg-*`) reprend la référence du
 * 22/10/2026 : cartes de 168 px, portrait rond de 80 px, angle des médias ; au
 * téléphone (coquille de moins de 600 px), la rangée passe d'un bord à l'autre
 * de l'écran, comme les publications.
 */
const DISCOVERY_CONTROLS_CSS = `
        .rp-discovery-module { --ui2-button-sm-min-h: 25px; }
        .rp-discovery-dismiss:focus-visible,
        .rp-sugg a:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .rp-relation-actions { display: flex; gap: 6px; width: 100%; min-width: 0; }
        .rp-relation-actions[data-layout="stack"] { flex-direction: column; margin-top: auto; }
        .rp-relation-actions[data-layout="row"] { flex-wrap: wrap; justify-content: flex-end; }
        .rp-relation-actions[data-layout="row"] > * { flex: 1 1 0; min-width: max-content; }
        .rp-relation-answer {
          background: var(--ui2-button-outline-bg, var(--muted));
          color: var(--foreground);
          text-decoration: none;
        }
        .rp-sugg { display: grid; gap: 8px; min-width: 0; }
        .rp-sugg-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
        .rp-sugg-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--foreground); }
        .rp-sugg-list {
          display: flex;
          gap: 8px;
          margin: 0;
          padding: 0 0 4px;
          list-style: none;
          overflow-x: auto;
          overscroll-behavior-inline: contain;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
        }
        .rp-sugg-list::-webkit-scrollbar { display: none; }
        .rp-sugg-card {
          position: relative;
          display: flex;
          flex: 0 0 168px;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          min-width: 0;
          padding: 16px 12px 12px;
          border-radius: var(--esp-media-radius, 12px);
          background: var(--esp-surface-card, var(--card));
          box-shadow: inset 0 0 0 1px var(--esp-surface-border, transparent);
          text-align: center;
          scroll-snap-align: start;
        }
        .rp-sugg-dismiss {
          position: absolute;
          top: 4px;
          right: 4px;
          display: inline-flex;
          width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: var(--muted-foreground);
          cursor: pointer;
        }
        .rp-sugg-portrait { display: inline-flex; margin-bottom: 8px; border-radius: 999px; }
        .rp-sugg-name {
          max-width: 100%;
          overflow: hidden;
          color: var(--foreground);
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rp-sugg-meta {
          max-width: 100%;
          margin: 0 0 10px;
          overflow: hidden;
          color: var(--muted-foreground);
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @container rm-scroll (max-width: 599px) {
          .rp-sugg { margin-inline: -12px; }
          .rp-sugg-head { padding-inline: 12px; }
          .rp-sugg-list { padding-inline: 12px; scroll-padding-inline: 12px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rp-discovery-module *, .rp-sugg * { scroll-behavior: auto !important; }
        }
      `

type SuggestionRow = SuggestionRelationPerson & { headline: string | null; avatarUrl: string | null; dismissed: boolean }

export function SuggestionsPanel({ presentation = "rail" }: { presentation?: DiscoveryPresentation }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  /* ⚠️ `graph.follows.suggestions` reste EXPORTÉ et servi ailleurs ; ce rail
     lit le catalogue, qui seul porte l'état relationnel serveur et les
     masquages durables (R-05). La fenêtre est plus large que ce qu'on affiche
     parce que le filtrage se fait après la page côté serveur. */
  const suggestions = useAuthenticatedConvexQuery(api.modules.suggestions.suggestions.paginate, {
    networkId,
    paginationOpts: { numItems: RAIL_SUGGESTIONS_SCAN, cursor: null },
  })
  const connectionRequest = useConnectionRequest()
  const dismissSuggestion = useMutation(api.modules.suggestions.suggestions.dismiss)
  const [busyHandle, setBusyHandle] = useState<string | null>(null)
  /* Retrait OPTIMISTE, le temps de l'aller-retour : la persistance, elle, est
     au serveur — la carte ne revient plus au rechargement suivant. */
  const [dismissedHandles, setDismissedHandles] = useState<ReadonlySet<string>>(new Set())
  /* Les cartes des personnes suivies pendant ce montage : le catalogue les écarte,
     l'écran les garde à leur place pour dire « Suivi » (ADR-0037). */
  const [retained, setRetained] = useState<readonly RetainedSuggestion<SuggestionRow>[]>([])

  const served: SuggestionRow[] = (suggestions.data?.page ?? []).slice(0, RAIL_SUGGESTIONS_SHOWN + retained.length)
  const items = visibleSuggestions(withRetainedSuggestions(served, retained), dismissedHandles).slice(0, RAIL_SUGGESTIONS_SHOWN + retained.length)
  if (suggestions.isLoading) return <SkeletonCard />
  // Un réseau GOUVERNÉ par une tranche sert ses propres suggestions (annuaire
  // opt-in) : le catalogue générique le refuse par une POLITIQUE, pas par une
  // panne — le rail s'efface au lieu de proposer un « Réessayer » sans issue.
  if (suggestions.isError && engineErrorCode(suggestions.error) === "policyRefused") return null
  if (suggestions.isError) {
    return (
      <Card padded style={RESEAU_SURFACE_STYLE}>
        <p style={{ margin: 0, color: "var(--ink-700)", fontSize: 13 }}>{t("suggestionsPanel.unavailable")}</p>
        <Button variant="secondary" size="sm" style={{ minHeight: 44, marginTop: 8 }} onClick={() => void suggestions.refetch()}>
          {t("suggestionsPanel.retry")}
        </Button>
      </Card>
    )
  }
  if (items.length === 0) {
    return <DiscoveryEmptyCard title={t("suggestionsPanel.title")} message={t("suggestionsPanel.empty")} presentation={presentation} />
  }

  // Mêmes libellés que la recherche du volet Relations (`PeoplePanel.tsx`)
  // pour la même action — qui connaît déjà l'un des deux volets reconnaît l'autre.
  const handleConnect = async (handle: string) => {
    setBusyHandle(handle)
    try {
      if (!(await connectionRequest.send({ handle }))) return
      // Aucun état local d'aboutissement : la query se recalcule et rend
      // `relationState: "requested_by_me"` — c'est LUI qui dira « Demande
      // envoyée », y compris au prochain chargement.
      toast.success(t("suggestionsPanel.connectionSent"))
    } catch (error) {
      toast.error(relationErrorText(error, "reseau:suggestionsPanel.actionFailed", t))
    } finally {
      setBusyHandle(null)
    }
  }

  /** Masquer DURABLEMENT — le retrait local ne fait que devancer le serveur. */
  const handleDismiss = async (handle: string) => {
    setDismissedHandles((current) => new Set([...current, handle]))
    try {
      await dismissSuggestion({ networkId, handle })
    } catch (error) {
      setDismissedHandles((current) => {
        const next = new Set(current)
        next.delete(handle)
        return next
      })
      toast.error(relationErrorText(error, "reseau:suggestionsPanel.dismissFailed", t))
    }
  }

  /** Une personne suivie garde sa carte, à sa place, jusqu'au démontage. */
  const retain = (person: SuggestionRow) => (handle: string, following: boolean) => {
    if (!following) return
    setRetained((current) => (current.some((entry) => entry.row.handle === handle) ? current : [...current, { row: person, index: items.findIndex((item) => item.handle === handle) }]))
  }

  const connectFor = (person: SuggestionRow) => ({
    busy: busyHandle === person.handle,
    disabled: connectionRequest.disabled,
    waitLabel: connectionRequest.waitLabel,
    onConnect: () => void handleConnect(person.handle),
  })

  const dismissDisabled = (person: SuggestionRow) => busyHandle === person.handle || connectionRequest.pendingHandle === person.handle

  if (presentation === "carousel") {
    return (
      <section className="rp-sugg rp-discovery-module" aria-label={t("suggestionsPanel.title")}>
        <header className="rp-sugg-head">
          <h2 className="rp-sugg-title">{t("suggestionsPanel.title")}</h2>
          {/* « Voir tout » ouvre le CATALOGUE, pas le volet Relations tout court (R-05). */}
          <Link href={peopleViewHref("suggestions", routes.home())} style={SEE_ALL_STYLE}>
            {t("suggestionsPanel.seeAll")}
          </Link>
        </header>
        <ul className="rp-sugg-list" aria-label={t("suggestionsPanel.listLabel")}>
          {items.map((person) => {
            const href = personHref(person.handle, routes.profile)
            return (
              <li key={person.handle} className="rp-sugg-card">
                <button
                  type="button"
                  className="rp-sugg-dismiss rp-discovery-dismiss"
                  aria-label={t("suggestionsPanel.dismissLabel", { name: person.displayName })}
                  disabled={dismissDisabled(person)}
                  onClick={() => void handleDismiss(person.handle)}
                >
                  <Icon name="x" size={16} />
                </button>
                <Link href={href} className="rp-sugg-portrait" aria-label={t("suggestionsPanel.profileOf", { name: person.displayName })}>
                  <Avatar displayName={person.displayName} avatarUrl={person.avatarUrl} size={80} />
                </Link>
                <Link href={href} className="rp-sugg-name">
                  {person.displayName}
                </Link>
                <p className="rp-sugg-meta">
                  @{person.handle}
                  {person.headline ? ` · ${person.headline}` : ""}
                </p>
                <SuggestionRelationActions person={person} connect={connectFor(person)} layout="stack" onFollowChange={retain(person)} />
              </li>
            )
          })}
        </ul>
        <style href="rp-discovery-controls" precedence="default">
          {DISCOVERY_CONTROLS_CSS}
        </style>
      </section>
    )
  }

  return (
    <>
      <Card padded={false} style={RESEAU_SURFACE_STYLE}>
        <section className="rp-discovery-module" style={{ padding: 20 }}>
          <header style={{ display: "flex", minHeight: 44, alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--ink-500)" }}>
              {t("suggestionsPanel.title")}
            </h2>
            {/* « Voir tout » ouvre le CATALOGUE, pas le volet Relations tout court
                (R-05) : jusqu'au 2026-09-06 le lien menait à un écran qui ne
                portait aucune liste de suggestions. */}
            <Link href={peopleViewHref("suggestions", routes.home())} style={SEE_ALL_STYLE}>
              {t("suggestionsPanel.seeAll")}
            </Link>
          </header>
          <ul style={{ listStyle: "none", margin: 0, padding: "4px 0 0", display: "flex", flexDirection: "column", gap: 12 }} aria-label={t("suggestionsPanel.listLabel")}>
            {items.map((person) => {
              const href = personHref(person.handle, routes.profile)
              return (
                /* DEUX RANGÉES, jamais une seule (2026-08-20) : identité en
                     haut (nom et identifiant ELLIPSÉS — patron ProfileMiniCard),
                     boutons en bas. */
                <li key={person.handle} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, minWidth: 0, padding: "0 44px 0 0" }}>
                  <button
                    type="button"
                    className="rp-discovery-dismiss"
                    aria-label={t("suggestionsPanel.dismissLabel", { name: person.displayName })}
                    disabled={dismissDisabled(person)}
                    onClick={() => void handleDismiss(person.handle)}
                    style={{ position: "absolute", zIndex: 1, top: -5, right: -5, display: "inline-flex", width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", border: 0, borderRadius: "var(--radius-lg)", background: "transparent", color: "var(--ink-500)", cursor: "pointer" }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                    <Link href={href} aria-label={t("suggestionsPanel.profileOf", { name: person.displayName })} style={{ display: "inline-flex", flexShrink: 0 }}>
                      <Avatar displayName={person.displayName} avatarUrl={person.avatarUrl} size={34} />
                    </Link>
                    <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                      <Link href={href} style={{ display: "block", margin: 0, fontSize: 12.5, fontWeight: 700, color: "var(--ink-900)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {person.displayName}
                      </Link>
                      <p style={{ margin: 0, color: "var(--ink-500)", fontSize: 10.5, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        @{person.handle}
                        {person.headline ? ` · ${person.headline}` : ""}
                      </p>
                    </div>
                  </div>
                  <SuggestionRelationActions person={person} connect={connectFor(person)} layout="row" onFollowChange={retain(person)} />
                </li>
              )
            })}
          </ul>
        </section>
      </Card>
      <style href="rp-discovery-controls" precedence="default">
        {DISCOVERY_CONTROLS_CSS}
      </style>
    </>
  )
}
