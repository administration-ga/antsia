// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/PeoplePanel.tsx @ ad2e7fdc2 — adaptations : fonctions du moteur, réseau courant par `useNetwork()` — recherche dans l'annuaire du réseau (`people.directory.searchPeople`), demandes par identifiant (`graph.connections.requestConnection({ handle, message? })`), réponses (`graph.connections.respondToConnection`), suivis (`graph.follows.{follow, unfollow, paginateMyFollows, myFollowerCount}`), catalogue de suggestions (`suggestions.suggestions.{paginate, dismiss, restore, paginateDismissed, paginateSentInvitations}`) ; listes paginées nativement par une chaîne de pages à curseur (invitations envoyées, suivis — la pagination numérotée des suivis devient « Voir plus » —, catalogue), décomptes PLANCHERS marqués « + » quand une page reste ; ligne « fonction » réduite au titre publié (poste et administration retirés) ; personnes au DTO du moteur (`otherPersonId`, nom nullable rendu par le libellé neutre) ; appel d'une relation par `useRingRelation` de la brique d'appel (`features/iappel`, `calls.direct.callMember({ target: { personId } })`) ; adresses par la table de routes injectée (`useRoutes()` : profil, messagerie, page réseau) ; textes par l'i18n (espace `reseau`, clés `peoplePanel.*`) et refus du moteur dits par leur code ; « Agents à découvrir » devient « Personnes à découvrir » ; feuille du volet sortie du JSX dans une constante de module (`PEOPLE_PANEL_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface —, règles inchangées ; primitives de `@antsia/ui` et kit d'espace de `@antsia/ui/espace-kit` (onglets « chemise », état vide ; la pagination numérotée n'est plus employée), surfaces de la coque ; Suivre, Se connecter et Accepter en variante `social`, couleur des relations (ADR-0027), Se connecter neutre une fois la demande envoyée ou reçue ; « Écrire » d'une carte de relation à la couleur des messages (`.rp-person-action--message`, `--role-message-*`), lien d'origine en repli ; étude du 22/10/2026 (ADR-0037) : le catalogue des suggestions offre aussi « Suivre » (ou « Suivre en retour »), au-dessus d'Ajouter et Masquer.
"use client"

/**
 * Trouver, inviter, accepter, suivre.
 *
 * ⚠️ Toutes les actions de CONNEXION passent par `graph.connections.*` du
 * moteur — un seul graphe par réseau, et la décision revient à sa garde
 * (adhésion, découvrabilité, blocage). Aucun état d'accès n'est calculé ici —
 * l'écran affiche ce que le serveur répond, et un refus ne se distingue jamais
 * d'une absence.
 */

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link, useTabQueryState } from "@antsia/api/routing"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { Badge, Button, Card, Field, TextInput } from "@antsia/ui"
import { EspaceDossierTabs, EspaceEmptyState, EspaceKitStyles } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import type { FunctionReference, FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { RESEAU_PILL_ACTION_STYLE, RESEAU_SURFACE_STYLE } from "../../shell/design-styles"
import { etatDeQuery, montreElements, montreEtatVide, montreSquelette } from "../../shell/query-state"
import { RESEAU_AGENT_VUE_PARAM } from "../../shell/reseau-agent-nav"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { useRingRelation, type RingRelation } from "../iappel/useRingRelation"
import { COMPACT_SOCIAL_ACTION_STYLE } from "../social-action-style"
import { PresenceDot, useConnectionsPresence, type PresenceState } from "../iappel/presence-dot"
import { draftKey } from "../messagerie/messagerie-dock"
import { conversationHref } from "../messagerie/messagerie-routes"
import { personHref } from "./author-link"
import { useConnectionRequest } from "./use-connection-request"
import { SuggestionFollowButton } from "./SuggestionRelationActions"
import { Avatar } from "./Avatar"
import {
  appendCursorPage,
  initialCursorPages,
  mergedCursorRows,
  nextCursor,
  recordCursorPage,
  removeCursorRows,
  type CursorPageMount,
  type CursorPageSnapshot,
} from "./cursor-pages"
import {
  appendFollowPage,
  initialFollowsPages,
  mergedFollowRows,
  nextFollowsCursor,
  recordFollowPage,
  removeFollowRow,
  type FollowPageMount,
  type FollowPageSnapshot,
} from "./follows-pagination"
import { reseauEmptyState, type ReseauEmptyStateId } from "./empty-states"
import {
  PEOPLE_VIEW_DEFAULT,
  PEOPLE_VIEW_IDS,
  parsePeopleView,
  peopleViewHref,
  peopleViewLabel,
  personTitleLine,
  relationErrorText,
  showPresence,
  type PeoplePersonKind,
} from "./people-panel"
import { CONNECTION_MESSAGE_MAX_LENGTH } from "./shared"
import { offersInvitationAnswer, relationActionDisabled, relationActionLabel } from "./suggestions-actions"
import { usePersonalConnections, usePersonalPendingConnections } from "./use-dual-connection-pagination"

/**
 * Un état vide du volet — texte et action décidés dans `empty-states.ts` (X-09).
 *
 * Six cartes vides vivaient ici en littéraux : deux d'entre elles portaient en
 * plus l'explication de ce qu'ouvre une connexion ou un suivi, soit deux
 * phrases de doctrine dans la carte qui constate un vide. Le registre les
 * raccourcit et pose, sur les deux seules surfaces où c'est utile, l'unique
 * chemin de sortie : les SUGGESTIONS, qui sont une autre sous-vue.
 *
 * ⚠️ Un lien, pas un bouton : la sous-vue est adressable (`?vue=suggestions`),
 * donc c'est de la navigation (X-10). Le rendu passe par la variante compacte.
 */
function ReseauEmptyCard({ id }: { id: ReseauEmptyStateId }) {
  const { t } = useTranslation("reseau")
  const routes = useRoutes()
  const state = reseauEmptyState(id, routes.home(), t)
  return (
    <EspaceEmptyState
      compact
      text={state.text}
      action={state.action?.kind === "lien" ? <Link href={state.action.href}>{state.action.label}</Link> : null}
    />
  )
}

/** Tailles des pages natives du moteur : les pages suivantes gardent la
 * même taille, sans gonfler la fenêtre de lecture du serveur. */
const CONNECTIONS_PAGE_SIZE = 12
const FOLLOWS_PAGE_SIZE = 12
const PENDING_REQUESTS_PAGE_SIZE = 10
const SENT_INVITATIONS_PAGE_SIZE = 12
/** Le catalogue de suggestions (R-05) : une page de serveur à la fois. */
const SUGGESTIONS_PAGE_SIZE = 24
/**
 * Les masquées ne servent qu'au DÉCOMPTE du bouton : une page, au plafond du
 * serveur ; au-delà, le décompte est un plancher (« 50+ »).
 */
const DISMISSED_COUNT_WINDOW = 50

// ═══════════════════════════════════════════════════════════════
// Pagination native : une chaîne de pages montées par curseur
// ═══════════════════════════════════════════════════════════════

/** Une page de la pagination native du moteur. */
interface CursorPage<Row> {
  page: Row[]
  isDone: boolean
  continueCursor: string
}

/** La clé de la PREMIÈRE page de la chaîne. */
const FIRST_PAGE_KEY = "start"

/**
 * D'où viennent les pages : la requête, la lecture de sa réponse et l'identité
 * d'une ligne. Constantes de module : leur identité ne change jamais d'un rendu
 * à l'autre (même patron que la pagination double des connexions).
 */
interface PagedSource<Query extends FunctionReference<"query">, Row> {
  query: Query
  page: (data: FunctionReturnType<Query>) => CursorPage<Row>
  key: (row: Row) => string
}

/** Une invitation que J'AI envoyée, encore sans réponse. */
type SentInvitationRow = FunctionReturnType<typeof api.modules.suggestions.suggestions.paginateSentInvitations>["page"][number]

/** Une carte du catalogue des suggestions. */
type SuggestionCatalogRow = FunctionReturnType<typeof api.modules.suggestions.suggestions.paginate>["page"][number]

const SUGGESTIONS_SOURCE: PagedSource<typeof api.modules.suggestions.suggestions.paginate, SuggestionCatalogRow> = {
  query: api.modules.suggestions.suggestions.paginate,
  page: (data) => data,
  key: (row) => row.handle,
}

/**
 * La chaîne des pages d'une liste paginée — le patron du catalogue (R-05),
 * utilisé par le catalogue. Chaque page remplace la sienne par clé, et
 * l'ensemble se dédoublonne par `source.key`. Les suivis et les invitations
 * envoyées ont des chaînes réactives où toutes les pages restent abonnées.
 *
 * Seule la DERNIÈRE page montée est abonnée : les précédentes sont des
 * instantanés, que les gestes locaux corrigent (`update`) en attendant le
 * serveur — une carte que le serveur vient d'écarter ne doit pas rester.
 *
 * ⚠️ Le serveur filtre parfois APRÈS sa page : une page peut être courte sans
 * être la dernière — c'est `isDone` qui tranche, jamais le nombre d'items.
 */
function usePagedList<Query extends FunctionReference<"query">, Row>(source: PagedSource<Query, Row>, argsFor: (cursor: string | null) => Query["_args"]) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [pages, setPages] = useState<Record<string, Row[]>>({})
  const result = useAuthenticatedConvexQuery(source.query, argsFor(cursor))

  const pageKey = cursor ?? FIRST_PAGE_KEY
  const data = result.data
  useEffect(() => {
    if (data === undefined) return
    const rows = source.page(data).page
    // Réécrire la MÊME page relancerait un rendu pour rien : la query rend une
    // identité stable tant que la donnée ne bouge pas, on la respecte.
    setPages((current) => (current[pageKey] === rows ? current : { ...current, [pageKey]: rows }))
  }, [data, pageKey, source])

  const items = useMemo(() => {
    const unique = new Map<string, Row>()
    for (const rows of Object.values(pages)) {
      for (const row of rows) unique.set(source.key(row), row)
    }
    return [...unique.values()]
  }, [pages, source])

  const current = data === undefined ? undefined : source.page(data)
  const nextCursor = current !== undefined && !current.isDone ? current.continueCursor : null
  const loadMore = useCallback(() => {
    if (nextCursor !== null) setCursor(nextCursor)
  }, [nextCursor])

  /** Repartir de zéro — un changement de filtre ne mêle pas deux listes. */
  const reset = useCallback(() => {
    setCursor(null)
    setPages({})
  }, [])

  /** Corriger les pages tenues : la ligne rendue, ou `null` pour la retirer. */
  const update = useCallback((edit: (row: Row) => Row | null) => {
    setPages((held) =>
      Object.fromEntries(
        Object.entries(held).map(([key, rows]) => [
          key,
          rows.flatMap((row) => {
            const next = edit(row)
            return next === null ? [] : [next]
          }),
        ]),
      ),
    )
  }, [])

  const loadedAnyPage = Object.keys(pages).length > 0
  // Une page déjà tenue n'est plus une attente : sans ce report, chaque
  // « Voir plus » rendrait un squelette par-dessus une liste déjà lisible.
  const etat = etatDeQuery(
    {
      isPending: result.isPending && !loadedAnyPage,
      isFetching: result.isFetching,
      isError: result.isError,
      fetchStatus: result.fetchStatus,
    },
    items.length,
  )
  const { refetch } = result
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  return { items, etat, isError: result.isError, hasMore: nextCursor !== null, loadMore, reset, update, retry }
}


/**
 * La feuille du volet, HORS du JSX : un littéral enfant de `<style>` passerait
 * pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 */
const PEOPLE_PANEL_CSS = `
      .rp-people-panel {
        /* ⚠️ Le seuil se mesure sur LE VOLET, pas sur la page : le chrome
           confisque de la largeur, et le palier pris sur la page entière
           réservait une colonne fixe à la recherche dans un volet qui n'en
           faisait parfois que 618. C'est ce palier que R-04 retire. */
        container-type: inline-size;
        container-name: rp-people;
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 16px;
      }
      .rp-people-content {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 16px;
      }
      .rp-person-tiles {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
      }
      .rp-invitation-list {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .rp-invitation-row {
        min-width: 0;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--esp-primitive-surface-border, var(--ink-200));
      }
      .rp-person-action-pair {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 8px;
      }
      .rp-person-action-pair > * { width: 100%; min-width: 0; }
      @container rp-people (min-width: 560px) {
        .rp-person-tiles { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
        .rp-invitation-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .rp-person-tile {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        border: 1px solid var(--ink-200);
        border-radius: 16px;
        background: var(--ink-0);
      }
      /* DEUX lignes pour le nom : un patronyme composé ne tient pas sur une
         ligne de 240px, et l'ellipse d'origine le tronquait au prénom.
         Au-delà de deux lignes, l'ellipse reprend ses droits. */
      .rp-person-name {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .rp-person-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: auto;
      }
      .rp-person-action {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        padding: 0 10px;
        border-radius: 999px;
        color: var(--primary-600);
        font-size: 12px;
        font-weight: 700;
        text-decoration: none;
      }
      /* Écrire : couleur des messages (ADR-0027), lien d'origine en repli. */
      .rp-person-action--message {
        background: var(--role-message-soft, transparent);
        color: var(--role-message-ink, var(--primary-600));
      }
      .rp-person-action:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
`

/**
 * Les styles du volet — posés par TOUT écran qui monte l'une de ses cartes.
 *
 * ⚠️ Ils vivaient dans le corps de `PeoplePanel` : `PeopleSearchPanel`, monté
 * seul dans le rail du fil, rendait donc ses tuiles `rp-person-tile` SANS
 * feuille de style. React 19 hisse et dédoublonne par `href` — les monter
 * deux fois ne coûte rien.
 */
export function PeoplePanelStyles() {
  return (
    <style href="rp-people-panel" precedence="default">
      {PEOPLE_PANEL_CSS}
    </style>
  )
}

export function PeoplePanel() {
  const { t } = useTranslation("reseau")
  // La sous-vue est ADRESSABLE : « Voir tout » des suggestions y mène, un lien
  // se partage, et le bouton retour la repose. Même contrat que les volets
  // (`useTabQueryState`), un cran plus bas.
  const [rawView, setView] = useTabQueryState(RESEAU_AGENT_VUE_PARAM, PEOPLE_VIEW_DEFAULT, PEOPLE_VIEW_IDS)
  const view = parsePeopleView(rawView)
  const pending = usePersonalPendingConnections({
    pageSize: PENDING_REQUESTS_PAGE_SIZE,
  })
  const panelId = useId()
  const idPrefix = `${panelId}-vue-`
  const invitations = pending.items.length

  const tabs = PEOPLE_VIEW_IDS.map((id) => ({
    id,
    label: peopleViewLabel(id, t),
    // Un décompte qui n'a pas tout lu est un PLANCHER : « 10+ ».
    badge: id === "invitations" && invitations > 0 ? `${invitations}${pending.hasMore ? "+" : ""}` : null,
    // Un « 3 » nu annoncé après « Invitations » ne dit pas 3 quoi.
    badgeLabel:
      id === "invitations" && invitations > 0
        ? t(pending.hasMore ? "peoplePanel.invitationsBadgeAtLeast" : "peoplePanel.invitationsBadge", { count: invitations })
        : null,
  }))

  return (
    /* `data-collection` (R-15) : une COLLECTION n'est pas un article. La
       colonne de lecture — bornée sur tablette — se relâche pour elle, et les
       tuiles remplissent la largeur au lieu de s'empiler. */
    <div className="rp-people-panel" data-collection="relations">
      <EspaceKitStyles />
      <PeoplePanelStyles />
      {/* La recherche prend TOUTE la largeur, en tête : c'est le geste par
          lequel on entre dans ce volet, et il n'a plus de colonne à lui. */}
      <SearchCard />
      <EspaceDossierTabs tabs={tabs} current={view} onChange={setView} aria-label={t("peoplePanel.viewsLabel")} panelId={panelId} idPrefix={idPrefix} />
      <div id={panelId} role="tabpanel" aria-labelledby={idPrefix + view} tabIndex={-1} className="rp-people-content">
        {view === "suggestions" ? (
          <SuggestionsCatalogCard />
        ) : view === "invitations" ? (
          <>
            <PendingRequestsCard pending={pending} />
            <SentInvitationsCard />
          </>
        ) : (
          <>
            <ConnectionsCard />
            <FollowsCard />
          </>
        )}
      </div>
    </div>
  )
}

/** Version étroite du même outil, rendue dans le rail du fil. */
export function PeopleSearchPanel() {
  return (
    <>
      <PeoplePanelStyles />
      <SearchCard compact />
    </>
  )
}

export function PanelCard({
  title,
  count,
  countIsFloor = false,
  eyebrow = false,
  children,
}: {
  title: string
  count?: number
  /** Le décompte ne couvre que les pages lues : il s'affiche en plancher (« 12+ »). */
  countIsFloor?: boolean
  eyebrow?: boolean
  children: ReactNode
}) {
  return (
    <Card padded={false} style={RESEAU_SURFACE_STYLE}>
      <section style={{ padding: eyebrow ? 20 : "18px 20px" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: eyebrow ? 10.5 : 15,
              fontWeight: 700,
              letterSpacing: eyebrow ? "0.09em" : "normal",
              textTransform: eyebrow ? "uppercase" : "none",
              color: eyebrow ? "var(--ink-500)" : "var(--ink-900)",
            }}
          >
            {title}
          </h2>
          {count !== undefined && count > 0 ? (
            <Badge tone="neutral" size="sm" style={{ fontFamily: "var(--font-mono)" }}>
              {`${count}${countIsFloor ? "+" : ""}`}
            </Badge>
          ) : null}
        </header>
        {children}
      </section>
    </Card>
  )
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 13, color: "var(--ink-600)" }}>{children}</p>
}

function SearchCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const [term, setTerm] = useState("")
  const [submittedTerm, setSubmittedTerm] = useState("")
  const [message, setMessage] = useState("")
  const [busyHandle, setBusyHandle] = useState<string | null>(null)

  const query = compact ? submittedTerm : term.trim()

  // Une requête vide ne rend rien côté serveur : on ne l'envoie pas non plus.
  const results = useAuthenticatedConvexQuery(api.modules.people.directory.searchPeople, query.length > 0 ? { networkId, query } : "skip")
  const found = results.data ?? []
  // Sans saisie la query est DÉSACTIVÉE : ni attente, ni vide, ni panne (IC-07).
  const resultsEtat = etatDeQuery(results, found.length, query.length > 0)

  const connectionRequest = useConnectionRequest()
  const follow = useMutation(api.modules.graph.follows.follow)

  const run = async (handle: string, action: () => Promise<unknown>, doneKey: string) => {
    setBusyHandle(handle)
    try {
      const result = await action()
      if (result !== false) toast.success(t(doneKey))
    } catch (error) {
      toast.error(relationErrorText(error, "reseau:peoplePanel.search.actionFailed", t))
    } finally {
      setBusyHandle(null)
    }
  }

  return (
    <PanelCard title={t("peoplePanel.search.title")} eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field hint={compact ? t("peoplePanel.search.hintCompact") : t("peoplePanel.search.hint")} htmlFor="reseau-recherche">
          <form
            role="search"
            aria-label={t("peoplePanel.search.formLabel")}
            onSubmit={(event) => {
              event.preventDefault()
              if (compact) setSubmittedTerm(term.trim())
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <TextInput
                id="reseau-recherche"
                icon={compact ? undefined : "search"}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t("peoplePanel.search.placeholder")}
                aria-label={t("peoplePanel.search.inputLabel")}
                style={
                  compact
                    ? {
                        borderRadius: 11,
                        border: "1px solid var(--ink-300)",
                        padding: "10px 12px",
                        fontSize: 13,
                      }
                    : undefined
                }
              />
            </div>
            {compact ? (
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                style={{
                  borderRadius: 11,
                  background: "var(--ink-150)",
                  color: "var(--ink-900)",
                  padding: "10px 13px",
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                {t("peoplePanel.search.submit")}
              </Button>
            ) : null}
          </form>
        </Field>

        {/* Une recherche en panne le DIT — jamais « Aucune personne trouvée »
            (R-08) ; les derniers résultats tenus restent dessous. */}
        {results.isError ? (
          <ReseauQueryError
            title={t("peoplePanel.search.errorTitle")}
            message={t("peoplePanel.search.errorMessage")}
            onRetry={() => void results.refetch()}
          />
        ) : null}
        {resultsEtat === "inactif" ? null : montreSquelette(resultsEtat) ? (
          <EmptyLine>{t("peoplePanel.search.loading")}</EmptyLine>
        ) : montreEtatVide(resultsEtat, found.length) ? (
          <ReseauEmptyCard id="relations-recherche" />
        ) : !montreElements(resultsEtat, found.length) ? null : (
          <>
            <Field label={t("peoplePanel.search.messageLabel")} htmlFor="reseau-message">
              <TextInput
                id="reseau-message"
                value={message}
                maxLength={CONNECTION_MESSAGE_MAX_LENGTH}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("peoplePanel.search.messagePlaceholder")}
              />
            </Field>
            <ul
              className="rp-person-tiles"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {found.map((person) => (
                <li key={person.handle} className="rp-person-tile">
                  <PersonLine
                    kind="recherche"
                    displayName={person.displayName}
                    handle={person.handle}
                    headline={person.headline}
                    avatarUrl={person.avatarUrl}
                  />
                  {/* `flexWrap` : deux pilules côte à côte (~215 px) débordent
                      d'une tuile de 200 px — elles s'empilent au lieu de
                      dépasser (2026-08-20). */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <Button
                      size="sm"
                      icon="userPlus"
                      // Se connecter : couleur des relations (ADR-0027).
                      variant="social"
                      disabled={busyHandle === person.handle || connectionRequest.disabled}
                      style={RESEAU_PILL_ACTION_STYLE}
                      onClick={() =>
                        void run(
                          person.handle,
                          () =>
                            connectionRequest.send({
                              handle: person.handle,
                              ...(message.trim().length > 0 ? { message: message.trim() } : {}),
                            }),
                          "peoplePanel.search.connectionSent",
                        )
                      }
                    >
                      {/* Même libellé que les cartes de suggestion : une seule source. */}
                      {connectionRequest.waitLabel ?? t("suggestionsActions.connect")}
                    </Button>
                    <Button
                      size="sm"
                      // Suivre : couleur des relations (ADR-0027).
                      variant="social"
                      disabled={busyHandle === person.handle}
                      style={RESEAU_PILL_ACTION_STYLE}
                      onClick={() => void run(person.handle, () => follow({ networkId, handle: person.handle }), "peoplePanel.search.followDone")}
                    >
                      {t("peoplePanel.search.follow")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PanelCard>
  )
}

/**
 * Les invitations REÇUES. Le hook est monté par `PeoplePanel` et descendu ici :
 * son décompte pastille l'onglet « Invitations », et deux montages du même
 * hook donneraient deux listes à tenir d'accord.
 */
function PendingRequestsCard({ pending }: { pending: ReturnType<typeof usePersonalPendingConnections> }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const respond = useMutation(api.modules.graph.connections.respondToConnection)
  const responding = useRef(new Set<Id<"connections">>())
  const [busy, setBusy] = useState<ReadonlySet<Id<"connections">>>(new Set())

  const decide = async (connectionId: Id<"connections">, accept: boolean) => {
    if (responding.current.has(connectionId)) return
    responding.current.add(connectionId)
    setBusy(new Set(responding.current))
    try {
      await respond({ networkId, connectionId, accept })
      pending.remove(connectionId)
      toast.success(t(accept ? "peoplePanel.pending.accepted" : "peoplePanel.pending.declined"))
    } catch (error) {
      toast.error(relationErrorText(error, "reseau:peoplePanel.pending.respondFailed", t))
    } finally {
      responding.current.delete(connectionId)
      setBusy(new Set(responding.current))
    }
  }

  const items = pending.items
  return (
    <PanelCard title={t("peoplePanel.pending.title")} count={items.length} countIsFloor={pending.hasMore}>
      {pending.isLoading ? (
        <EmptyLine>{t("peoplePanel.loading")}</EmptyLine>
      ) : pending.isError ? (
        <ReseauQueryError title={t("peoplePanel.pending.errorTitle")} message={t("peoplePanel.pending.errorMessage")} onRetry={pending.retry} />
      ) : items.length === 0 ? (
        <ReseauEmptyCard id="relations-invitations-recues" />
      ) : (
        <>
          <ul className="rp-invitation-list">
            {items.map((request) => (
              <li key={request.connectionId} className="rp-invitation-row" aria-busy={busy.has(request.connectionId)}>
                <PersonLine
                  kind="invitation"
                  displayName={request.displayName}
                  handle={request.handle}
                  headline={request.headline}
                  avatarUrl={request.avatarUrl}
                  avatarSize={64}
                  requestedAt={request.at}
                />
                {request.message ? (
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 13,
                      color: "var(--ink-700)",
                      fontStyle: "italic",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {t("peoplePanel.pending.quotedMessage", { message: request.message })}
                  </p>
                ) : null}
                <div className="rp-person-action-pair">
                  <Button
                    size="sm"
                    icon="check"
                    variant="social"
                    disabled={busy.has(request.connectionId)}
                    style={COMPACT_SOCIAL_ACTION_STYLE}
                    onClick={() => void decide(request.connectionId, true)}
                  >
                    {t("peopleActions.confirm")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy.has(request.connectionId)}
                    style={COMPACT_SOCIAL_ACTION_STYLE}
                    onClick={() => void decide(request.connectionId, false)}
                  >
                    {t("peopleActions.decline")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {pending.hasMore ? (
            <Button variant="secondary" size="sm" onClick={pending.loadMore}>
              {t("peoplePanel.pending.loadMore")}
            </Button>
          ) : null}
          {pending.isLoadingMore ? <EmptyLine>{t("peoplePanel.pending.loadingMore")}</EmptyLine> : null}
        </>
      )}
    </PanelCard>
  )
}

/**
 * Les invitations que J'AI envoyées, encore sans réponse.
 *
 * Une annulation vise la VERSION rendue par le serveur : réutiliser la même
 * ligne après une réémission ne donne jamais le droit d'annuler la suivante.
 * Toutes les pages restent abonnées aux réponses de leurs destinataires.
 */
export interface SentInvitationsSectionProps {
  discover?: { href: string; label: string }
}

export function SentInvitationsSection(props: SentInvitationsSectionProps) {
  return (
    <div className="rp-people-panel" data-collection="relations">
      <PeoplePanelStyles />
      <EspaceKitStyles />
      <SentInvitationsCard {...props} />
    </div>
  )
}

function SentInvitationsCard(props: SentInvitationsSectionProps) {
  const { networkId, personId } = useNetwork()
  return <SentInvitationsPages key={JSON.stringify([networkId, personId])} {...props} />
}

type RetrySentPage = () => Promise<unknown>

function SentInvitationsQueryPage(props: {
  mount: CursorPageMount
  report: (mount: CursorPageMount, snapshot: CursorPageSnapshot<SentInvitationRow>) => void
  registerRetry: (id: number, retry: RetrySentPage) => () => void
}) {
  const { networkId } = useNetwork()
  const { mount, report, registerRetry } = props
  const query = useAuthenticatedConvexQuery(api.modules.suggestions.suggestions.paginateSentInvitations, {
    networkId,
    paginationOpts: { numItems: SENT_INVITATIONS_PAGE_SIZE, cursor: mount.cursor },
  })
  useEffect(() => {
    report(mount, { data: query.data ?? undefined, isPending: query.isPending, isError: query.isError })
  }, [mount, query.data, query.isPending, query.isError, report])
  useEffect(() => registerRetry(mount.id, query.refetch), [mount.id, query.refetch, registerRetry])
  return null
}

function SentInvitationsPages({ discover }: SentInvitationsSectionProps) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const [state, setState] = useState(() => initialCursorPages<SentInvitationRow>())
  const retries = useRef(new Map<number, RetrySentPage>())
  const pendingRequests = useRef(new Set<string>())
  const [busyRequests, setBusyRequests] = useState<ReadonlySet<string>>(new Set())
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const report = useCallback((mount: CursorPageMount, snapshot: CursorPageSnapshot<SentInvitationRow>) => {
    setState((previous) => recordCursorPage(previous, mount, snapshot))
  }, [])
  const registerRetry = useCallback((id: number, retry: RetrySentPage) => {
    retries.current.set(id, retry)
    return () => {
      if (retries.current.get(id) === retry) retries.current.delete(id)
    }
  }, [])
  const retry = () => {
    for (const refetch of retries.current.values()) {
      void (async () => { try { await refetch() } catch { /* Le hook porte la panne. */ } })()
    }
  }
  const cancelSentRequest = useMutation(api.modules.graph.connections.cancelSentRequest)
  const items = mergedCursorRows(state, (row) => String(row.connectionId))
  const last = state.mounts[state.mounts.length - 1]!
  const current = state.pages[last.id]
  const hasError = state.mounts.some((mount) => state.pages[mount.id]?.isError)
  const initialLoading = state.pages[0]?.data === undefined && !hasError
  const loadingMore = state.mounts.length > 1 && (!current?.data || current.isPending) && !current?.isError
  const hasMore = nextCursor(state) !== null
  const empty = !initialLoading && !hasError && items.length === 0 && !hasMore && !loadingMore

  const cancel = async (request: SentInvitationRow) => {
    if (pendingRequests.current.has(request.connectionId)) return
    pendingRequests.current.add(request.connectionId)
    setBusyRequests(new Set(pendingRequests.current))
    try {
      await cancelSentRequest({ networkId, connectionId: request.connectionId, expectedRequestedAt: request.at })
      if (!active.current) return
      setState((previous) => removeCursorRows(previous, (row) => row.connectionId === request.connectionId && row.at === request.at))
      toast.success(t("peoplePanel.sent.cancelled"))
    } catch (error) {
      if (!active.current) return
      toast.error(relationErrorText(error, "reseau:peoplePanel.sent.cancelFailed", t))
    } finally {
      pendingRequests.current.delete(request.connectionId)
      if (active.current) setBusyRequests(new Set(pendingRequests.current))
    }
  }

  return (
    <PanelCard title={t("peoplePanel.sent.title")} count={items.length} countIsFloor={hasMore || loadingMore || hasError}>
      {state.mounts.map((mount) => <SentInvitationsQueryPage key={mount.id} mount={mount} report={report} registerRetry={registerRetry} />)}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy={initialLoading || loadingMore}>
        {/* La panne se DIT et ne vide pas la liste tenue (R-08). */}
        {hasError ? <ReseauQueryError title={t("peoplePanel.sent.errorTitle")} message={t("peoplePanel.sent.errorMessage")} onRetry={retry} /> : null}
        {initialLoading ? (
          <EmptyLine>{t("peoplePanel.loading")}</EmptyLine>
        ) : empty ? (
          discover ? (
            <EspaceEmptyState compact text={reseauEmptyState("relations-demandes-envoyees", routes.home(), t).text} action={<Link href={discover.href}>{discover.label}</Link>} />
          ) : <ReseauEmptyCard id="relations-demandes-envoyees" />
        ) : null}
        {items.length > 0 ? (
            <ul className="rp-person-tiles" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((request) => (
                <li key={request.connectionId} className="rp-person-tile">
                  <PersonLine
                    kind="invitation"
                    displayName={request.displayName}
                    handle={request.handle}
                    headline={request.headline}
                    avatarUrl={request.avatarUrl}
                    avatarSize={48}
                    requestedAt={request.at}
                  />
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "var(--ink-600)",
                    }}
                  >
                    {t("peoplePanel.sent.awaiting")}
                  </p>
                  <div className="rp-person-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      style={COMPACT_SOCIAL_ACTION_STYLE}
                      disabled={busyRequests.has(request.connectionId)}
                      aria-busy={busyRequests.has(request.connectionId)}
                      aria-label={t("peoplePanel.sent.cancelLabel", { name: request.displayName ?? t("peoplePanel.unnamed") })}
                      onClick={() => void cancel(request)}
                    >
                      {t("peoplePanel.sent.cancel")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
        ) : null}
        {hasMore || loadingMore ? (
          <Button variant="secondary" size="sm" disabled={loadingMore || hasError} onClick={() => setState(appendCursorPage<SentInvitationRow>)}>
            {t(loadingMore ? "peoplePanel.loading" : "peoplePanel.sent.loadMore")}
          </Button>
        ) : null}
      </div>
    </PanelCard>
  )
}

/**
 * Le CATALOGUE des suggestions — la destination de « Voir tout » (R-05).
 *
 * Chaîne de pages montées par curseur, jamais une limite gonflée : chaque
 * page remplace la sienne par clé, et l'ensemble se dédoublonne par handle.
 * ⚠️ Le serveur filtre APRÈS sa page : une page peut être courte sans être la
 * dernière — c'est `isDone` qui tranche, jamais le nombre d'items rendus.
 */
function SuggestionsCatalogCard() {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const [includeDismissed, setIncludeDismissed] = useState(false)
  const [busyHandle, setBusyHandle] = useState<string | null>(null)

  const catalogue = usePagedList(SUGGESTIONS_SOURCE, (cursor) => ({
    networkId,
    paginationOpts: { numItems: SUGGESTIONS_PAGE_SIZE, cursor },
    includeDismissed,
  }))
  const masquees = useAuthenticatedConvexQuery(api.modules.suggestions.suggestions.paginateDismissed, {
    networkId,
    paginationOpts: { numItems: DISMISSED_COUNT_WINDOW, cursor: null },
  })
  const connectionRequest = useConnectionRequest()
  const dismiss = useMutation(api.modules.suggestions.suggestions.dismiss)
  const restore = useMutation(api.modules.suggestions.suggestions.restore)

  const items = catalogue.items
  const { reset, update } = catalogue

  // Changer de filtre REPART de zéro : mêler des pages prises avec et sans
  // les masquées donnerait une liste dont personne ne saurait dire ce
  // qu'elle contient.
  const toggleDismissed = useCallback(() => {
    setIncludeDismissed((current) => !current)
    reset()
  }, [reset])

  const dismissedCount = masquees.data?.page.length ?? 0
  const dismissedIsFloor = masquees.data !== undefined && !masquees.data.isDone

  const connect = async (handle: string) => {
    setBusyHandle(handle)
    try {
      if (await connectionRequest.send({ handle })) toast.success(t("peoplePanel.search.connectionSent"))
    } catch (error) {
      toast.error(relationErrorText(error, "reseau:peoplePanel.search.actionFailed", t))
    } finally {
      setBusyHandle(null)
    }
  }

  const hide = async (handle: string) => {
    setBusyHandle(handle)
    try {
      await dismiss({ networkId, handle })
      // La ligne part de la page tenue : la query se recalcule, mais l'écran
      // ne doit pas garder une carte que le serveur vient d'écarter.
      update((row) => (row.handle !== handle ? row : includeDismissed ? { ...row, dismissed: true } : null))
    } catch (error) {
      toast.error(relationErrorText(error, "reseau:peoplePanel.catalogue.dismissFailed", t))
    } finally {
      setBusyHandle(null)
    }
  }

  const unhide = async (row: SuggestionCatalogRow) => {
    setBusyHandle(row.handle)
    try {
      await restore({ networkId, targetPersonId: row.personId })
      update((item) => (item.handle === row.handle ? { ...item, dismissed: false } : item))
    } catch (error) {
      toast.error(relationErrorText(error, "reseau:peoplePanel.catalogue.restoreFailed", t))
    } finally {
      setBusyHandle(null)
    }
  }

  return (
    <PanelCard title={t("peoplePanel.catalogue.title")} count={items.length} countIsFloor={catalogue.hasMore}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="rp-person-actions">
          <Button size="sm" variant="secondary" aria-pressed={includeDismissed} style={{ ...RESEAU_PILL_ACTION_STYLE, minHeight: 44 }} onClick={toggleDismissed}>
            {includeDismissed
              ? t("peoplePanel.catalogue.hideDismissed")
              : dismissedCount > 0
                ? t(dismissedIsFloor ? "peoplePanel.catalogue.showDismissedCountCapped" : "peoplePanel.catalogue.showDismissedCount", { count: dismissedCount })
                : t("peoplePanel.catalogue.showDismissed")}
          </Button>
        </div>
        {/* Une panne le DIT — jamais « plus personne à découvrir » (R-08). */}
        {catalogue.isError ? (
          <ReseauQueryError title={t("peoplePanel.catalogue.errorTitle")} message={t("peoplePanel.catalogue.errorMessage")} onRetry={catalogue.retry} />
        ) : null}
        {montreSquelette(catalogue.etat) ? (
          <EmptyLine>{t("peoplePanel.loading")}</EmptyLine>
        ) : montreEtatVide(catalogue.etat, items.length) ? (
          <ReseauEmptyCard id="suggestions" />
        ) : !montreElements(catalogue.etat, items.length) ? null : (
          <>
            <ul className="rp-person-tiles" style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label={t("peoplePanel.catalogue.listLabel")}>
              {items.map((person) => {
                const busy = busyHandle === person.handle
                return (
                  <li key={person.handle} className="rp-person-tile">
                    <PersonLine
                      kind="suggestion"
                      displayName={person.displayName}
                      handle={person.handle}
                      headline={person.headline}
                      avatarUrl={person.avatarUrl}
                      avatarSize={48}
                    />
                    {/* Deux formules (ADR-0037) : suivre sans être ami, ou demander à l'être. */}
                    <SuggestionFollowButton person={person} width="100%" />
                    <div className="rp-person-action-pair">
                      <Button
                        size="sm"
                        icon="userPlus"
                        // Se connecter : couleur des relations tant que la demande est possible (ADR-0027).
                        variant={person.relationState === "none" ? "social" : "secondary"}
                        disabled={relationActionDisabled(person.relationState, busy) || connectionRequest.disabled}
                        style={COMPACT_SOCIAL_ACTION_STYLE}
                        onClick={() => void connect(person.handle)}
                      >
                        {(person.relationState === "none" && connectionRequest.waitLabel) || (person.relationState === "none" && !busy ? t("peopleActions.add") : relationActionLabel(person.relationState, busy, t))}
                      </Button>
                      {person.dismissed ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          style={COMPACT_SOCIAL_ACTION_STYLE}
                          onClick={() => void unhide(person)}
                        >
                          {t("peoplePanel.catalogue.restore")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          style={COMPACT_SOCIAL_ACTION_STYLE}
                          aria-label={t("peoplePanel.catalogue.dismissLabel", { name: person.displayName })}
                          onClick={() => void hide(person.handle)}
                        >
                          {t("peoplePanel.catalogue.dismiss")}
                        </Button>
                      )}
                    </div>
                    <div className="rp-person-actions">
                      <Link href={personHref(person.handle, routes.profile)} className="rp-person-action" style={COMPACT_SOCIAL_ACTION_STYLE}>
                        {t("peoplePanel.profile")}
                      </Link>
                      {offersInvitationAnswer(person.relationState) ? (
                        <Link href={peopleViewHref("invitations", routes.home())} className="rp-person-action" style={COMPACT_SOCIAL_ACTION_STYLE}>
                          {t("peoplePanel.catalogue.answer")}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
            {catalogue.hasMore ? (
              <Button variant="secondary" size="sm" onClick={catalogue.loadMore}>
                {t("peoplePanel.catalogue.loadMore")}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </PanelCard>
  )
}

function ConnectionsCard() {
  const { t } = useTranslation("reseau")
  const connections = usePersonalConnections({ pageSize: CONNECTIONS_PAGE_SIZE })
  const items = connections.items
  // La présence de mes relations — même vocabulaire quatre états que la
  // brique iAppel (cf. `features/iappel/presence-dot.tsx`).
  const { presenceOf } = useConnectionsPresence()
  const call = useRingRelation()
  return (
    <PanelCard title={t("peoplePanel.connections.title")} count={items.length} countIsFloor={connections.hasMore}>
      {connections.isLoading ? (
        <EmptyLine>{t("peoplePanel.loading")}</EmptyLine>
      ) : connections.isError ? (
        <ReseauQueryError title={t("peoplePanel.connections.errorTitle")} message={t("peoplePanel.connections.errorMessage")} onRetry={connections.retry} />
      ) : items.length === 0 ? (
        <ReseauEmptyCard id="relations-connexions" />
      ) : (
        <>
          <ul
            className="rp-person-tiles"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {items.map((connection) => {
              const otherPersonId = String(connection.otherPersonId)
              return (
                <li key={connection.connectionId} className="rp-person-tile">
                  <PersonLine
                    kind="relation"
                    displayName={connection.displayName}
                    handle={connection.handle}
                    headline={connection.headline}
                    avatarUrl={connection.avatarUrl}
                    otherPersonId={otherPersonId}
                    presence={presenceOf(otherPersonId)}
                  />
                  <PersonActions
                    personId={connection.otherPersonId}
                    handle={connection.handle}
                    displayName={connection.displayName}
                    avatarUrl={connection.avatarUrl}
                    call={call}
                  />
                </li>
              )
            })}
          </ul>
          {connections.hasMore ? (
            <Button variant="secondary" size="sm" onClick={connections.loadMore}>
              {t("peoplePanel.connections.loadMore")}
            </Button>
          ) : null}
          {connections.isLoadingMore ? <EmptyLine>{t("peoplePanel.connections.loadingMore")}</EmptyLine> : null}
        </>
      )}
    </PanelCard>
  )
}

export interface FollowsSectionProps {
  /** Sortie vers la découverte propre au réseau, sans monter son annuaire. */
  discover?: { href: string; label: string }
}

/** La même carte, autonome : aucune recherche ni liste d'abonnés montée. */
export function FollowsSection(props: FollowsSectionProps) {
  return (
    <div className="rp-people-panel" data-collection="relations">
      <PeoplePanelStyles />
      <EspaceKitStyles />
      <FollowsCard {...props} />
    </div>
  )
}

function FollowsCard(props: FollowsSectionProps) {
  const { networkId, personId } = useNetwork()
  // PeoplePanel bénéficie du même reset que la section montée seule.
  return <FollowsPages key={JSON.stringify([networkId, personId])} {...props} />
}

type RetryFollowPage = () => Promise<unknown>

function FollowsQueryPage(props: {
  mount: FollowPageMount
  report: (mount: FollowPageMount, page: FollowPageSnapshot) => void
  registerRetry: (id: number, retry: RetryFollowPage) => () => void
}) {
  const { networkId } = useNetwork()
  const { mount, report, registerRetry } = props
  const query = useAuthenticatedConvexQuery(api.modules.graph.follows.paginateMyFollows, {
    networkId,
    paginationOpts: { numItems: FOLLOWS_PAGE_SIZE, cursor: mount.cursor },
  })
  useEffect(() => {
    report(mount, { data: query.data ?? undefined, isPending: query.isPending, isError: query.isError })
  }, [mount, query.data, query.isPending, query.isError, report])
  useEffect(() => registerRetry(mount.id, query.refetch), [mount.id, query.refetch, registerRetry])
  return null
}

function FollowsPages({ discover }: FollowsSectionProps) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const [state, setState] = useState(initialFollowsPages)
  const retries = useRef(new Map<number, RetryFollowPage>())
  const pendingTargets = useRef(new Set<string>())
  const [busyTargets, setBusyTargets] = useState<ReadonlySet<string>>(new Set())
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const report = useCallback((mount: FollowPageMount, page: FollowPageSnapshot) => {
    setState((previous) => recordFollowPage(previous, mount, page))
  }, [])
  const registerRetry = useCallback((id: number, retry: RetryFollowPage) => {
    retries.current.set(id, retry)
    return () => {
      if (retries.current.get(id) === retry) retries.current.delete(id)
    }
  }, [])
  const retry = () => {
    for (const refetch of retries.current.values()) {
      void (async () => { try { await refetch() } catch { /* Le hook porte la panne. */ } })()
    }
  }
  const followerCount = useAuthenticatedConvexQuery(api.modules.graph.follows.myFollowerCount, { networkId })
  const unfollow = useMutation(api.modules.graph.follows.unfollow)
  const items = mergedFollowRows(state)
  const last = state.mounts[state.mounts.length - 1]!
  const current = state.pages[last.id]
  const hasError = state.mounts.some((mount) => state.pages[mount.id]?.isError)
  const initialLoading = state.pages[0]?.data === undefined && !hasError
  const loadingMore = state.mounts.length > 1 && (!current?.data || current.isPending) && !current?.isError
  const hasMore = nextFollowsCursor(state) !== null
  const countIsFloor = hasMore || loadingMore || hasError
  const empty = !initialLoading && !hasError && items.length === 0 && !hasMore && !loadingMore

  const stopFollowing = async (targetPersonId: Id<"persons">) => {
    if (pendingTargets.current.has(targetPersonId)) return
    pendingTargets.current.add(targetPersonId)
    setBusyTargets(new Set(pendingTargets.current))
    try {
      await unfollow({ networkId, targetPersonId })
      if (!active.current) return
      setState((previous) => removeFollowRow(previous, targetPersonId))
      toast.success(t("peoplePanel.follows.unfollowed"))
    } catch (error) {
      if (!active.current) return
      toast.error(relationErrorText(error, "reseau:peoplePanel.follows.unfollowFailed", t))
    } finally {
      pendingTargets.current.delete(targetPersonId)
      if (active.current) setBusyTargets(new Set(pendingTargets.current))
    }
  }

  return (
    <PanelCard title={t("peoplePanel.follows.title")} count={items.length} countIsFloor={countIsFloor}>
      {state.mounts.map((mount) => <FollowsQueryPage key={mount.id} mount={mount} report={report} registerRetry={registerRetry} />)}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy={initialLoading || loadingMore}>
        <EmptyLine>{followerCount.data === undefined ? " " : t("peoplePanel.follows.followers", { count: followerCount.data })}</EmptyLine>
        {/* La panne se dit et ne vide pas la liste tenue (R-08). */}
        {hasError ? (
          <ReseauQueryError title={t("peoplePanel.follows.errorTitle")} message={t("peoplePanel.follows.errorMessage")} onRetry={retry} />
        ) : null}
        {initialLoading ? (
          <EmptyLine>{t("peoplePanel.loading")}</EmptyLine>
        ) : empty ? (
          discover ? (
            <EspaceEmptyState compact text={reseauEmptyState("relations-abonnements", routes.home(), t).text} action={<Link href={discover.href}>{discover.label}</Link>} />
          ) : <ReseauEmptyCard id="relations-abonnements" />
        ) : null}
        {items.length > 0 ? (
            <ul
              className="rp-person-tiles"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {items.map((person) => (
                <li key={person.targetPersonId} className="rp-person-tile">
                  <PersonLine
                    kind="suggestion"
                    displayName={person.displayName}
                    handle={person.handle}
                    headline={person.headline}
                    avatarUrl={person.avatarUrl}
                  />
                  <div className="rp-person-actions">
                    {person.handle ? (
                      <Link href={personHref(person.handle, routes.profile)} className="rp-person-action">
                        {t("peoplePanel.profile")}
                      </Link>
                    ) : null}
                    <Button
                      variant="link"
                      size="sm"
                      style={{ ...RESEAU_PILL_ACTION_STYLE, minHeight: 44 }}
                      disabled={busyTargets.has(person.targetPersonId)}
                      aria-busy={busyTargets.has(person.targetPersonId)}
                      onClick={() => void stopFollowing(person.targetPersonId)}
                    >
                      {t("peoplePanel.follows.unfollow")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
        ) : null}
        {hasMore || loadingMore ? (
          <Button variant="secondary" size="sm" disabled={loadingMore || hasError} onClick={() => setState(appendFollowPage)}>
            {t(loadingMore ? "peoplePanel.loading" : "peoplePanel.follows.loadMore")}
          </Button>
        ) : null}
      </div>
    </PanelCard>
  )
}

function PersonLine({
  kind,
  displayName,
  handle,
  headline,
  avatarUrl,
  otherPersonId = null,
  presence = null,
  avatarSize = 32,
  requestedAt,
}: {
  /** D'où vient la personne — décide notamment la pastille de présence. */
  kind: PeoplePersonKind
  /** `null` : rien à nommer — le libellé neutre traduit est affiché. */
  displayName: string | null
  handle: string | null
  headline: string | null
  avatarUrl?: string | null
  /** L'identifiant de la personne — sans lui, `presenceOf` ne répond pour
   *  personne, et la carte annoncerait un état qu'elle n'a pas. */
  otherPersonId?: string | null
  /** Pastille de présence — seules les sections qui la CONNAISSENT la passent. */
  presence?: PresenceState
  avatarSize?: number
  requestedAt?: number
}) {
  const { t, i18n } = useTranslation("reseau")
  const timeZone = useViewerTimeZone()
  const routes = useRoutes()
  const titleLine = personTitleLine({ headline })
  const presenceState = showPresence(kind, otherPersonId) ? presence : null
  const name = displayName ?? t("peoplePanel.unnamed")
  // Sans handle, aucun profil de réseau n'est publié : rien à lier, le texte
  // reste nu.
  const href = handle ? personHref(handle, routes.profile) : null
  // Pas d'initiales tirées d'un libellé neutre : la silhouette, plutôt.
  const hasIdentity = displayName !== null
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      {href ? (
        <Link href={href} aria-label={t("peoplePanel.profileOf", { name })} style={{ display: "inline-flex", flexShrink: 0 }}>
          <Avatar displayName={name} avatarUrl={avatarUrl} size={avatarSize} hasIdentity={hasIdentity} />
        </Link>
      ) : (
        <Avatar displayName={name} avatarUrl={avatarUrl} size={avatarSize} hasIdentity={hasIdentity} />
      )}
      {/* Le NOM tient sur DEUX lignes (R-04) : l'ellipse d'une seule ligne
          tronquait les patronymes composés au prénom dans une tuile de
          240 px. L'identifiant, lui, garde son ellipse — un `@identifiant`
          insécable déborde et se peint sous les boutons (patron
          ProfileMiniCard, 2026-08-20). */}
      <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
        {href ? (
          <Link
            href={href}
            className="rp-person-name"
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink-900)",
              textDecoration: "none",
            }}
          >
            {name}
            <PresenceDot state={presenceState} />
          </Link>
        ) : (
          <p
            className="rp-person-name"
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink-900)",
            }}
          >
            {name}
            <PresenceDot state={presenceState} />
          </p>
        )}
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--ink-600)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {handle ? `@${handle}` : t("peoplePanel.unpublished")}
        </p>
        {requestedAt !== undefined ? (
          <time dateTime={new Date(requestedAt).toISOString()} style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--ink-500)" }}>
            {t("peopleActions.requestedAt", { date: new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium", timeZone }).format(requestedAt) })}
          </time>
        ) : null}
        {/* La ligne de présentation : le titre publié par la personne. Rien
            n'est inventé quand il manque — la ligne disparaît. */}
        {titleLine ? (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "var(--ink-700)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {titleLine}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Les trois gestes d'une carte de personne : consulter, écrire, appeler.
 *
 * ⚠️ « Appeler » passe par `useRingRelation`, donc par le MAGASIN d'appel —
 * jamais par un nouveau canal. « Écrire » ouvre un BROUILLON : le fil naît au
 * premier envoi, `startThreadWithHandle` exigeant un message.
 *
 * Sans handle, aucune de ces prises n'existe — la carte n'affiche rien plutôt
 * que des boutons morts.
 */
function PersonActions({
  personId,
  handle,
  displayName,
  avatarUrl,
  call,
}: {
  personId: Id<"persons">
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  call: RingRelation
}) {
  const { t } = useTranslation("reseau")
  const routes = useRoutes()
  if (!handle) return null
  const brouillon = conversationHref(draftKey(handle), routes.messages())
  const name = displayName ?? t("peoplePanel.unnamed")
  return (
    <div className="rp-person-actions">
      <Link href={personHref(handle, routes.profile)} className="rp-person-action">
        {t("peoplePanel.profile")}
      </Link>
      {brouillon ? (
        // Écrire : couleur des messages (ADR-0027).
        <Link href={brouillon} className="rp-person-action rp-person-action--message">
          {t("peoplePanel.write")}
        </Link>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={call.busyHandle === handle}
        style={{ ...RESEAU_PILL_ACTION_STYLE, minHeight: 44 }}
        aria-label={t("peoplePanel.callLabel", { name })}
        onClick={() => void call.ring({ personId, handle, displayName, avatarUrl })}
      >
        {t("peoplePanel.call")}
      </Button>
    </div>
  )
}
