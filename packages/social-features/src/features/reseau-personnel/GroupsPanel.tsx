// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/GroupsPanel.tsx @ ad2e7fdc2 — adaptations : groupes thématiques du réseau courant (`thematicGroups.thematicGroups.*`, `networkId` par `useNetwork()`) ; invitations reçues et membres PAGINÉS par le moteur (`paginateMyInvites`, `paginateMembers`, pannes dites par `ReseauPaginatedErrorBoundary`, « Voir plus ») ; `myGroups` borné qui dit sa lacune (`truncated`) ; vivier d'invitation `{ items, truncated }` du moteur passé tel quel au sélecteur ; mur à curseur COMPOSITE (`FeedCursor`, clé de page par `feedCursorKey`) et publications au DTO du fil (`_id`) rendues par `PostCard` ; membres et invitants nommés par la personne (`personId`, nom neutre quand le profil n'est pas publié) ; refus du moteur lus par code (`groupActionErrorText`), et le refus indistinct de la fiche (`notFound`) dit « plus accessible » ; états vides par `reseauEmptyState(id, home, t)` ; toutes les chaînes par l'i18n (espace `reseau`, clés `groupsPanel.*` et `groupesThematiques.*`) ; « agents » → le réseau ; primitives de `@antsia/ui`, kit d'espace de `@antsia/ui/espace-kit` (phrases de la pagination par `useEspacePaginationLabels`). ; couleurs par fonction (ADR-0027) : Rejoindre en variante `social`, Accepter en validation opt-in.
"use client"

/**
 * Le volet GROUPES de la page réseau — l'annuaire, puis la page d'un groupe.
 *
 * DEUX surfaces dans la même colonne, jamais empilées (la règle du volet
 * Relations, reprise) : l'ANNUAIRE — mes invitations, mes groupes, la
 * découverte, la création — et LA PAGE d'un groupe, qui le REMPLACE avec un
 * retour visible à tous les paliers (invariant de `reseau-layout`).
 *
 * Ce composant ne DÉCIDE rien : surfaces, autorité des boutons, libellés et
 * états vides viennent de `groupes-thematiques.ts` (module pur, testé) — ici
 * on ne fait que monter des queries et poser des gestes. La garde reste au
 * serveur : un bouton caché n'est pas une permission, un bouton montré non
 * plus.
 *
 * Charte : aucune classe Tailwind de couleur, aucun hexadécimal — jetons
 * `var(--…)` uniquement (cliquet `no-hardcoded-colors`).
 */

import { themedActionStyle } from "../themed-action-style"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery, useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { Alert, Badge, Button, Card, SkeletonCard, TextArea, TextInput } from "@antsia/ui"
import { clampPage, EspaceEmptyState, EspacePagination, pageSlice } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { RESEAU_CARD_STYLE, RESEAU_FIELD_STYLE, RESEAU_PRIMARY_ACTION_STYLE, RESEAU_SECONDARY_ACTION_STYLE } from "../../shell/design-styles"
import { etatDePagination, etatDeQuery, montreElements, montreEtatVide, montreSquelette } from "../../shell/query-state"
import { ReseauPaginatedErrorBoundary } from "../../shell/ReseauPaginatedErrorBoundary"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { useEspacePaginationLabels } from "../../shell/use-espace-pagination-labels"
import { reseauEmptyState } from "./empty-states"
import {
  GROUPS_ERROR_TEXT_KEYS,
  GROUPS_RETURN_LABEL_KEY,
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_INVITE_EMPTY_TEXT_KEY,
  GROUP_INVITE_OPEN_LABEL_KEY,
  GROUP_INVITE_PICKER_LABEL_KEY,
  GROUP_NAME_MAX_LENGTH,
  canInviteToGroup,
  canLeaveGroup,
  canManageGroupRoles,
  canModerateGroup,
  classifyInviteResult,
  emptyGroupWallText,
  groupActionErrorText,
  groupInviteReportLabel,
  groupInvitesBannerLabel,
  groupPersonName,
  groupRoleLabel,
  initialGroupsViewFor,
  joinCtaLabel,
  memberCountLabel,
  validateGroupName,
  type GroupInviteOutcome,
  type GroupsView,
  type ThematicGroupRole,
} from "./groupes-thematiques"
import { PostCard } from "./PostCard"
import { PostComposer } from "./PostComposer"
import { RelationPicker } from "./RelationPicker"
import { toRelationPickerCandidates } from "./relation-picker"
import { appendPage, feedCursorKey, initialFeedPages, loadMoreAnnouncement, shouldShowLoadMore, type FeedCursor } from "./reseau-feed-pages"

type GroupId = Id<"thematicGroups">
/** Le mur d'un groupe garde son curseur COMPOSITE (instant + publication), distinct du fil global. */
type GroupWallCursor = FeedCursor<Id<"posts">>

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `groupe-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const SECTION_TITLE_STYLE = {
  margin: 0,
  color: "var(--ink-900)",
  fontFamily: "var(--esp-heading-font-family, inherit)",
  fontSize: "var(--esp-section-title-size, 14px)",
  lineHeight: "var(--esp-section-title-leading, inherit)",
  letterSpacing: "var(--esp-section-title-tracking, normal)",
  fontWeight: 700,
} as const

const MUTED_TEXT_STYLE = {
  margin: 0,
  color: "var(--ink-600)",
  fontSize: "var(--esp-content-font-size, 13px)",
  lineHeight: "var(--esp-content-line-height, 1.55)",
} as const

function EmptyNote({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: 0,
        padding: 18,
        border: "1px dashed var(--ink-200)",
        borderRadius: "var(--esp-primitive-card-radius, 8px)",
        color: "var(--ink-600)",
        fontSize: 13.5,
      }}
    >
      {text}
    </p>
  )
}

/** Les deux listes de l'annuaire — le MUR d'un groupe garde sa propre chaîne
 *  de pages (`GroupWallPage`, plus bas) : on n'y touche pas. */
const MY_GROUPS_PAGE_SIZE = 12
const DISCOVER_GROUPS_PAGE_SIZE = 12
/** Invitations reçues et membres : des pages du serveur, « Voir plus » au-delà. */
const INVITES_PAGE_SIZE = 20
const MEMBERS_PAGE_SIZE = 25
/** Ce qu'une page du mur rend, au plus (la borne par défaut du fil du moteur). */
const WALL_PAGE_SIZE = 20

// ═══════════════════════════════════════════════════════════════
// Le volet — annuaire OU page d'un groupe
// ═══════════════════════════════════════════════════════════════

export function GroupsPanel({
  groupId,
  now,
  onTag,
  onMention,
  onOpenGroup,
  onBack,
}: {
  /**
   * LE groupe ouvert, lu dans l'URL (`?groupe=<id>`) à chaque rendu — plus une
   * graine (R-13). Le volet n'a AUCUN état de vue : l'adresse décide, donc la
   * page se partage, se recharge, et « Retour » du navigateur la referme.
   */
  groupId: string | null
  now: number
  onTag?: (tag: string) => void
  onMention?: (handle: string) => void
  /** Ouvrir la page d'un groupe — ÉCRIT l'adresse (entrée d'historique). */
  onOpenGroup: (groupId: string) => void
  /** Revenir à l'annuaire — REMPLACE l'adresse (pas d'aller-retour piégeux). */
  onBack: () => void
}) {
  const view: GroupsView = initialGroupsViewFor(groupId)

  if (view.kind === "group") {
    // L'identifiant vient de l'URL : il n'est pas DEVINÉ, le serveur refuse une référence inventée.
    return <GroupPage groupId={view.groupId as GroupId} now={now} onTag={onTag} onMention={onMention} onBack={onBack} />
  }
  return <GroupsDirectory onOpen={(id) => onOpenGroup(String(id))} />
}

// ═══════════════════════════════════════════════════════════════
// L'annuaire — invitations, mes groupes, création, découverte
// ═══════════════════════════════════════════════════════════════

function GroupsDirectory({ onOpen }: { onOpen: (groupId: GroupId) => void }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const home = useRoutes().home()
  const paginationLabels = useEspacePaginationLabels()
  const [query, setQuery] = useState("")
  const [submitted, setSubmitted] = useState("")
  const [myGroupsPage, setMyGroupsPage] = useState(1)
  const [discoverPage, setDiscoverPage] = useState(1)

  const mine = useAuthenticatedConvexQuery(api.modules.thematicGroups.thematicGroups.myGroups, { networkId })
  const discovered = useAuthenticatedConvexQuery(
    api.modules.thematicGroups.thematicGroups.discover,
    submitted.length > 0 ? { networkId, query: submitted } : { networkId },
  )
  const join = useMutation(api.modules.thematicGroups.thematicGroups.join)

  const myGroupsItems = mine.data?.items ?? []
  // Panne ≠ vide (R-08) : l'état de chaque liste se décide par `query-state`,
  // et l'état vide « créez le vôtre » n'est JAMAIS la réponse à une lecture
  // qui a échoué.
  const mineEtat = etatDeQuery(mine, myGroupsItems.length)
  const safeMyGroupsPage = clampPage(myGroupsPage, myGroupsItems.length, MY_GROUPS_PAGE_SIZE)
  const visibleMyGroups = pageSlice(myGroupsItems, safeMyGroupsPage, MY_GROUPS_PAGE_SIZE)

  const discoveredItems = discovered.data ?? []
  const discoveredEtat = etatDeQuery(discovered, discoveredItems.length)
  const safeDiscoverPage = clampPage(discoverPage, discoveredItems.length, DISCOVER_GROUPS_PAGE_SIZE)
  const visibleDiscovered = pageSlice(discoveredItems, safeDiscoverPage, DISCOVER_GROUPS_PAGE_SIZE)

  return (
    /* `data-collection` (R-15) : le volet est une COLLECTION, pas un article —
       la colonne de lecture de la tablette se relâche pour lui. */
    <div data-collection="groupes" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Invitations reçues : une action attendue DE MOI, en tête. ──
          Paginées par le moteur : une lecture en panne LÈVE, la frontière la dit. */}
      <ReseauPaginatedErrorBoundary resetKey="group-invites" title={t(GROUPS_ERROR_TEXT_KEYS.invites.title)} message={t(GROUPS_ERROR_TEXT_KEYS.invites.message)}>
        <GroupInvites onOpen={onOpen} />
      </ReseauPaginatedErrorBoundary>

      <CreateGroupCard onCreated={onOpen} />

      {/* ── Mes groupes ── */}
      <section aria-label={t("groupsPanel.directory.mine")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={SECTION_TITLE_STYLE}>{t("groupsPanel.directory.mine")}</h2>
        {mine.isError ? (
          <ReseauQueryError title={t(GROUPS_ERROR_TEXT_KEYS.mine.title)} message={t(GROUPS_ERROR_TEXT_KEYS.mine.message)} onRetry={() => void mine.refetch()} />
        ) : null}
        {montreSquelette(mineEtat) ? (
          <SkeletonCard />
        ) : montreEtatVide(mineEtat, myGroupsItems.length) ? (
          <EspaceEmptyState compact text={reseauEmptyState("groupes-mes-groupes", home, t).text} />
        ) : !montreElements(mineEtat, myGroupsItems.length) ? null : (
          <>
            {visibleMyGroups.map((group) => (
              <GroupCardRow
                key={group.groupId}
                name={group.name}
                description={group.description}
                memberCount={group.memberCount}
                myRole={group.myRole}
                invited={group.invited}
                onOpen={() => onOpen(group.groupId)}
              />
            ))}
            <EspacePagination
              page={safeMyGroupsPage}
              pageSize={MY_GROUPS_PAGE_SIZE}
              totalItems={myGroupsItems.length}
              onPageChange={setMyGroupsPage}
              listLabel={t("groupsPanel.directory.mineList")}
              labels={paginationLabels}
            />
            {/* La lecture est BORNÉE par le serveur : la lacune se dit, elle ne se devine pas. */}
            {mine.data?.truncated ? <p style={{ ...MUTED_TEXT_STYLE, fontSize: 12.5 }}>{t("groupsPanel.directory.mineTruncated")}</p> : null}
          </>
        )}
      </section>

      {/* ── Découvrir ── */}
      <section aria-label={t("groupsPanel.directory.discoverSection")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={SECTION_TITLE_STYLE}>{t("groupsPanel.directory.discover")}</h2>
        <form
          role="search"
          aria-label={t("groupsPanel.directory.searchForm")}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(query.trim())
            setDiscoverPage(1)
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("groupsPanel.directory.searchPlaceholder")}
              aria-label={t("groupsPanel.directory.searchLabel")}
              style={{ ...RESEAU_FIELD_STYLE }}
            />
          </div>
          <Button type="submit" variant="secondary" style={RESEAU_SECONDARY_ACTION_STYLE}>
            {t("groupsPanel.directory.search")}
          </Button>
        </form>
        {discovered.isError ? (
          <ReseauQueryError
            title={t(GROUPS_ERROR_TEXT_KEYS.discover.title)}
            message={t(GROUPS_ERROR_TEXT_KEYS.discover.message)}
            onRetry={() => void discovered.refetch()}
          />
        ) : null}
        {montreSquelette(discoveredEtat) ? (
          <SkeletonCard />
        ) : montreEtatVide(discoveredEtat, discoveredItems.length) ? (
          <EspaceEmptyState compact text={reseauEmptyState("groupes-decouverte", home, t).text} />
        ) : !montreElements(discoveredEtat, discoveredItems.length) ? null : (
          <>
            {visibleDiscovered.map((group) => (
              <GroupCardRow
                key={group.groupId}
                name={group.name}
                description={group.description}
                memberCount={group.memberCount}
                myRole={group.myRole}
                invited={group.invited}
                onOpen={() => onOpen(group.groupId)}
                onJoin={() => {
                  void join({ networkId, groupId: group.groupId })
                    .then(() => {
                      toast.success(t("groupsPanel.toast.joined"))
                      onOpen(group.groupId)
                    })
                    .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.joinFailed", t)))
                }}
              />
            ))}
            <EspacePagination
              page={safeDiscoverPage}
              pageSize={DISCOVER_GROUPS_PAGE_SIZE}
              totalItems={discoveredItems.length}
              onPageChange={setDiscoverPage}
              listLabel={t("groupsPanel.directory.discoverList")}
              labels={paginationLabels}
            />
          </>
        )}
      </section>
    </div>
  )
}

/** Mes invitations en attente, paginées — le bandeau se tait quand il n'y en a pas. */
function GroupInvites({ onOpen }: { onOpen: (groupId: GroupId) => void }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const invites = useAuthenticatedPaginatedQuery(api.modules.thematicGroups.thematicGroups.paginateMyInvites, { networkId }, { initialNumItems: INVITES_PAGE_SIZE })
  const respondInvite = useMutation(api.modules.thematicGroups.thematicGroups.respondInvite)

  const banner = groupInvitesBannerLabel(invites.results.length, t)
  if (banner === null) return null

  return (
    <Alert tone="info" title={banner}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {invites.results.map((invite) => (
          <li key={invite.inviteId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5 }}>
              <Trans
                t={t}
                i18nKey="groupsPanel.invites.sentence"
                values={{
                  name: groupPersonName(invite.invitedBy.displayName, t),
                  group: invite.groupName,
                  members: memberCountLabel(invite.memberCount, t),
                }}
                components={{ strong: <strong /> }}
              />
            </span>
            <span style={{ display: "inline-flex", gap: 8 }}>
              <Button style={themedActionStyle("success", "social")}
                size="sm"
                // Accepter : couleur de validation, relations en repli hors ANTSIA (ADR-0027).
                variant="success"
                onClick={() => {
                  void respondInvite({ networkId, inviteId: invite.inviteId, accept: true })
                    .then(() => {
                      toast.success(t("groupsPanel.toast.joined"))
                      onOpen(invite.groupId)
                    })
                    .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.inviteExpired", t)))
                }}
              >
                {t("groupsPanel.invites.accept")}
              </Button>
              <Button style={themedActionStyle("danger", "ghost")}
                size="sm"
                variant="danger"
                onClick={() => {
                  void respondInvite({ networkId, inviteId: invite.inviteId, accept: false }).catch((error: unknown) =>
                    toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.inviteExpired", t)),
                  )
                }}
              >
                {t("groupsPanel.invites.decline")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {invites.status === "CanLoadMore" ? (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="ghost" onClick={() => invites.loadMore(INVITES_PAGE_SIZE)}>
            {t("groupsPanel.invites.more")}
          </Button>
        </div>
      ) : null}
    </Alert>
  )
}

/** Une carte d'annuaire — fiche publique : nom, thème, effectif, mon état. */
function GroupCardRow({
  name,
  description,
  memberCount,
  myRole,
  invited,
  onOpen,
  onJoin,
}: {
  name: string
  description: string | null
  memberCount: number
  myRole: ThematicGroupRole | null
  invited: boolean
  onOpen: () => void
  onJoin?: () => void
}) {
  const { t } = useTranslation("reseau")
  const cta = joinCtaLabel({ myRole, invited }, t)
  const roleLabel = groupRoleLabel(myRole, t)
  return (
    <Card style={RESEAU_CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onOpen}
              style={{
                border: "none",
                background: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--ink-900)",
                font: "inherit",
                fontSize: "var(--esp-subsection-title-size, 14.5px)",
                lineHeight: "var(--esp-subsection-title-leading, inherit)",
                fontWeight: 700,
                textAlign: "left",
              }}
            >
              {name}
            </button>
            {roleLabel ? (
              <Badge tone="primary" size="sm">
                {roleLabel}
              </Badge>
            ) : null}
          </p>
          {description ? <p style={{ ...MUTED_TEXT_STYLE, marginTop: 4 }}>{description}</p> : null}
          <p style={{ ...MUTED_TEXT_STYLE, marginTop: 4, fontSize: 12.5 }}>{memberCountLabel(memberCount, t)}</p>
        </div>
        <div style={{ display: "inline-flex", gap: 8 }}>
          {cta && onJoin ? (
            <Button size="sm" variant="social" onClick={onJoin} style={RESEAU_PRIMARY_ACTION_STYLE}>
              {cta}
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={onOpen} style={RESEAU_SECONDARY_ACTION_STYLE}>
            {t("groupsPanel.card.open")}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Créer un groupe — replié derrière son bouton, clé tirée AU MONTAGE. */
function CreateGroupCard({ onCreated }: { onCreated: (groupId: GroupId) => void }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
  const create = useMutation(api.modules.thematicGroups.thematicGroups.create)

  const nameError = name.trim().length === 0 ? null : validateGroupName(name, t)

  if (!open) {
    return (
      <div>
        <Button variant="secondary" icon="plus" onClick={() => setOpen(true)} style={RESEAU_SECONDARY_ACTION_STYLE}>
          {t("groupsPanel.create.open")}
        </Button>
      </div>
    )
  }

  return (
    <Card style={RESEAU_CARD_STYLE}>
      <form
        aria-label={t("groupsPanel.create.form")}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
        onSubmit={(event) => {
          event.preventDefault()
          if (submitting || validateGroupName(name, t) !== null) return
          setSubmitting(true)
          void create({
            networkId,
            name: name.trim(),
            ...(description.trim().length > 0 ? { description: description.trim() } : {}),
            idempotencyKey,
          })
            .then((result) => {
              setIdempotencyKey(newIdempotencyKey())
              setName("")
              setDescription("")
              setOpen(false)
              toast.success(t("groupsPanel.toast.created"))
              onCreated(result.groupId)
            })
            .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.createFailed", t)))
            .finally(() => setSubmitting(false))
        }}
      >
        <h2 style={SECTION_TITLE_STYLE}>{t("groupsPanel.create.form")}</h2>
        <TextInput
          value={name}
          maxLength={GROUP_NAME_MAX_LENGTH + 20}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("groupsPanel.create.namePlaceholder")}
          aria-label={t("groupsPanel.create.nameLabel")}
          style={{ ...RESEAU_FIELD_STYLE }}
        />
        {nameError ? <p style={{ ...MUTED_TEXT_STYLE, color: "var(--danger-600)" }}>{nameError}</p> : null}
        <TextArea
          rows={2}
          value={description}
          maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("groupsPanel.create.descriptionPlaceholder")}
          aria-label={t("groupsPanel.create.descriptionLabel")}
          style={{ ...RESEAU_FIELD_STYLE, minHeight: 64 }}
        />
        <p style={MUTED_TEXT_STYLE}>{t("groupsPanel.create.visibility")}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button style={themedActionStyle("cancel", "ghost")} type="button" variant="outline" onClick={() => setOpen(false)}>
            {t("groupsPanel.create.cancel")}
          </Button>
          <Button type="submit" disabled={submitting || validateGroupName(name, t) !== null} style={RESEAU_PRIMARY_ACTION_STYLE}>
            {submitting ? t("groupsPanel.create.submitting") : t("groupsPanel.create.submit")}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// La page d'un groupe
// ═══════════════════════════════════════════════════════════════

function BackToGroups({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation("reseau")
  return (
    <div>
      <Button variant="ghost" size="sm" icon="arrowLeft" onClick={onBack}>
        {t(GROUPS_RETURN_LABEL_KEY)}
      </Button>
    </div>
  )
}

function GroupPage({
  groupId,
  now,
  onTag,
  onMention,
  onBack,
}: {
  groupId: GroupId
  now: number
  onTag?: (tag: string) => void
  onMention?: (handle: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const fiche = useAuthenticatedConvexQuery(api.modules.thematicGroups.thematicGroups.getGroup, { networkId, groupId })
  const join = useMutation(api.modules.thematicGroups.thematicGroups.join)
  const leave = useMutation(api.modules.thematicGroups.thematicGroups.leave)
  const respondInvite = useMutation(api.modules.thematicGroups.thematicGroups.respondInvite)
  const unpin = useMutation(api.modules.thematicGroups.thematicGroups.unpinGroupPost)

  const [pages, setPages] = useState(() => initialFeedPages<GroupWallCursor>())
  const [tailCursor, setTailCursor] = useState<GroupWallCursor | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [showMembers, setShowMembers] = useState(false)

  const myRole = fiche.data?.myRole ?? null
  const isMember = myRole !== null
  const moderator = canModerateGroup(myRole)
  const ficheEtat = etatDeQuery(fiche, fiche.data ? 1 : 0)

  if (montreSquelette(ficheEtat)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }
  if (fiche.isError && fiche.data === undefined) {
    // Le REFUS indistinct du moteur (`notFound`) — et lui seul — porte la
    // phrase « plus accessible ».
    if (engineErrorCode(fiche.error) === "notFound") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <EspaceEmptyState text={t("groupsPanel.page.notAccessible")} />
          <BackToGroups onBack={onBack} />
        </div>
      )
    }
    // Une fiche qu'on n'a pas PU lire n'est pas « plus accessible » (R-08) :
    // la panne se dit, avec Réessayer, et le retour reste à portée.
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ReseauQueryError title={t(GROUPS_ERROR_TEXT_KEYS.group.title)} message={t(GROUPS_ERROR_TEXT_KEYS.group.message)} onRetry={() => void fiche.refetch()} />
        <BackToGroups onBack={onBack} />
      </div>
    )
  }
  // Rien de connu (query pas encore armée) : rien à affirmer.
  if (fiche.data === undefined) return null

  const group = fiche.data
  const roleLabel = groupRoleLabel(myRole, t)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Retour : l'invariant de reseau-layout, appliqué à ce volet. ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={onBack}>
          {t(GROUPS_RETURN_LABEL_KEY)}
        </Button>
      </div>

      {/* ── La dernière relecture a échoué : la fiche tenue reste, le bandeau le dit. ── */}
      {fiche.isError ? (
        <ReseauQueryError title={t(GROUPS_ERROR_TEXT_KEYS.group.title)} message={t(GROUPS_ERROR_TEXT_KEYS.group.message)} onRetry={() => void fiche.refetch()} />
      ) : null}

      {/* ── L'en-tête du groupe — la fiche, mes gestes. ── */}
      <Card style={RESEAU_CARD_STYLE}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ ...SECTION_TITLE_STYLE, fontSize: "var(--esp-section-title-size, 17px)" }}>{group.name}</h2>
            {roleLabel ? (
              <Badge tone="primary" size="sm">
                {roleLabel}
              </Badge>
            ) : null}
          </div>
          {group.description ? <p style={MUTED_TEXT_STYLE}>{group.description}</p> : null}
          <p style={{ ...MUTED_TEXT_STYLE, fontSize: 12.5 }}>{memberCountLabel(group.memberCount, t)}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {group.pendingInviteId !== null && !isMember ? (
              <Button
                size="sm"
                // Accepter l'invitation : couleur des relations (ADR-0027).
                variant="success"
                style={themedActionStyle("success", "social", RESEAU_PRIMARY_ACTION_STYLE)}
                onClick={() => {
                  if (group.pendingInviteId === null) return
                  void respondInvite({ networkId, inviteId: group.pendingInviteId, accept: true })
                    .then(() => toast.success(t("groupsPanel.toast.joined")))
                    .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.inviteExpired", t)))
                }}
              >
                {t("groupesThematiques.join.acceptInvite")}
              </Button>
            ) : null}
            {!isMember ? (
              <Button
                size="sm"
                // Rejoindre : couleur des relations, sauf quand l'invitation tient déjà ce rôle (ADR-0027).
                variant={group.pendingInviteId !== null ? "secondary" : "social"}
                style={group.pendingInviteId !== null ? RESEAU_SECONDARY_ACTION_STYLE : RESEAU_PRIMARY_ACTION_STYLE}
                onClick={() => {
                  void join({ networkId, groupId })
                    .then(() => toast.success(t("groupsPanel.toast.joined")))
                    .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.joinFailed", t)))
                }}
              >
                {t("groupesThematiques.join.join")}
              </Button>
            ) : null}
            {canLeaveGroup(myRole) ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void leave({ networkId, groupId })
                    .then(() => toast.success(t("groupsPanel.toast.left")))
                    .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.leaveFailed", t)))
                }}
              >
                {t("groupsPanel.page.leave")}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" aria-expanded={showMembers} onClick={() => setShowMembers((current) => !current)}>
              {showMembers ? t("groupsPanel.page.hideMembers") : t("groupsPanel.page.showMembers")}
            </Button>
          </div>
          {isMember && canInviteToGroup(myRole) ? <GroupInviteCard groupId={groupId} /> : null}
        </div>
      </Card>

      {showMembers && isMember ? (
        <ReseauPaginatedErrorBoundary resetKey={`members-${groupId}`} title={t(GROUPS_ERROR_TEXT_KEYS.members.title)} message={t(GROUPS_ERROR_TEXT_KEYS.members.message)}>
          <MembersCard groupId={groupId} myRole={myRole} />
        </ReseauPaginatedErrorBoundary>
      ) : showMembers ? (
        <EspaceEmptyState text={t("groupsPanel.page.membersReserved")} />
      ) : null}

      {/* ── L'épinglée — re-gardée par le serveur, jamais devinée. ── */}
      {group.pinned ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge tone="primary" size="sm">
              {t("groupsPanel.page.pinnedBadge")}
            </Badge>
            {moderator ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void unpin({ networkId, groupId })
                    .then(() => toast.success(t("groupsPanel.toast.unpinned")))
                    .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.unpinFailed", t)))
                }}
              >
                {t("groupsPanel.page.unpin")}
              </Button>
            ) : null}
          </div>
          <PostCard post={group.pinned} now={now} onTag={onTag} onMention={onMention} />
        </div>
      ) : null}

      {/* ── Publier — membres seulement : l'audience vient du lieu. ── */}
      {isMember ? <PostComposer group={{ groupId, name: group.name }} /> : <EspaceEmptyState text={t("groupsPanel.page.joinToRead")} />}

      {/* ── Le mur — même chaîne de pages montées que le fil. ── */}
      {isMember ? (
        <>
          {pages.cursors.map((cursor, index) => (
            <GroupWallPage
              key={feedCursorKey(cursor)}
              groupId={groupId}
              cursor={cursor}
              now={now}
              isFirst={index === 0}
              isLast={index === pages.cursors.length - 1}
              moderator={moderator}
              pinnedPostId={group.pinned ? String(group.pinned._id) : null}
              onTag={onTag}
              onMention={onMention}
              onTail={setTailCursor}
              emptyFallback={<EmptyNote text={emptyGroupWallText(true, t)} />}
            />
          ))}
          {shouldShowLoadMore(pages, tailCursor) ? (
            <div>
              <Button
                variant="secondary"
                icon="arrowDown"
                style={RESEAU_SECONDARY_ACTION_STYLE}
                onClick={() => {
                  setPages((state) => appendPage(state, tailCursor))
                  setAnnouncement(loadMoreAnnouncement(WALL_PAGE_SIZE, t))
                }}
              >
                {t("groupsPanel.page.morePosts")}
              </Button>
            </div>
          ) : null}
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </>
      ) : null}
    </div>
  )
}

/**
 * Inviter — un acte de membre, par le SÉLECTEUR de relations (R-13).
 *
 * Ce qui a disparu : le champ « @identifiant », qui exigeait de connaître
 * l'adresse exacte et rendait le même refus pour une faute de frappe et pour
 * une personne hors réseau. Ce qui reste inchangé : `invite({groupId, handle})`
 * — le sélecteur envoie N appels de la mutation, et le serveur re-juge chaque
 * personne.
 *
 * Repli explicite : le sélecteur s'ouvre depuis un bouton, et le focus y entre
 * (le composant s'en charge) puis revient au déclencheur à la fermeture.
 */
function GroupInviteCard({ groupId }: { groupId: GroupId }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const invite = useMutation(api.modules.thematicGroups.thematicGroups.invite)
  const candidats = useAuthenticatedConvexQuery(api.modules.thematicGroups.thematicGroups.listInviteCandidates, open ? { networkId, groupId } : "skip")

  const rows = candidats.data?.items ?? []
  const candidatsEtat = etatDeQuery(candidats, rows.length)

  const fermer = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <Button
          ref={triggerRef}
          size="sm"
          variant="secondary"
          icon="userPlus"
          aria-expanded={open}
          style={RESEAU_SECONDARY_ACTION_STYLE}
          onClick={() => (open ? fermer() : setOpen(true))}
        >
          {t(GROUP_INVITE_OPEN_LABEL_KEY)}
        </Button>
      </div>
      {open ? (
        <>
          {/* Une panne du vivier n'est pas « aucune relation » (R-08). */}
          {candidats.isError ? (
            <ReseauQueryError
              title={t(GROUPS_ERROR_TEXT_KEYS.candidates.title)}
              message={t(GROUPS_ERROR_TEXT_KEYS.candidates.message)}
              onRetry={() => void candidats.refetch()}
            />
          ) : null}
          {montreSquelette(candidatsEtat) ? (
            <SkeletonCard />
          ) : (
            <RelationPicker
              label={t(GROUP_INVITE_PICKER_LABEL_KEY)}
              candidates={toRelationPickerCandidates(rows)}
              truncated={candidats.data?.truncated ?? false}
              emptyText={t(GROUP_INVITE_EMPTY_TEXT_KEY)}
              onClose={fermer}
              onSubmit={async (selected) => {
                const outcome: GroupInviteOutcome = { invited: 0, alreadyInvited: 0, alreadyMember: 0, failed: 0 }
                for (const person of selected) {
                  const handle = person.handle
                  if (!handle) {
                    outcome.failed += 1
                    continue
                  }
                  try {
                    const result = await invite({ networkId, groupId, handle })
                    outcome[classifyInviteResult(result)] += 1
                  } catch {
                    outcome.failed += 1
                  }
                }
                const phrase = groupInviteReportLabel(outcome, t)
                if (outcome.failed > 0 && outcome.invited === 0) toast.error(phrase)
                else toast.success(phrase)
                void candidats.refetch()
              }}
            />
          )}
        </>
      ) : null}
    </div>
  )
}

/** Les membres, paginés, avec les gestes que MON rôle autorise (le serveur re-juge). */
function MembersCard({ groupId, myRole }: { groupId: GroupId; myRole: ThematicGroupRole | null }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const members = useAuthenticatedPaginatedQuery(api.modules.thematicGroups.thematicGroups.paginateMembers, { networkId, groupId }, { initialNumItems: MEMBERS_PAGE_SIZE })
  const setRole = useMutation(api.modules.thematicGroups.thematicGroups.setMemberRole)
  const removeMember = useMutation(api.modules.thematicGroups.thematicGroups.removeMember)
  const manageRoles = canManageGroupRoles(myRole)
  const moderate = canModerateGroup(myRole)
  const membersEtat = etatDePagination(members.status, members.results.length)

  if (montreSquelette(membersEtat)) return <SkeletonCard />
  return (
    <Card style={RESEAU_CARD_STYLE}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ ...SECTION_TITLE_STYLE, fontFamily: "inherit", fontSize: "var(--esp-subsection-title-size, 14px)", lineHeight: "var(--esp-subsection-title-leading, inherit)" }}>{t("groupsPanel.members.title")}</h3>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {members.results.map((member) => (
            <li key={member.personId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13.5, color: "var(--ink-900)" }}>
                <strong>{groupPersonName(member.displayName, t)}</strong>
                {member.handle ? <span style={{ color: "var(--ink-500)" }}> @{member.handle}</span> : null}
                <span style={{ color: "var(--ink-500)" }}>
                  {" · "}
                  {groupRoleLabel(member.role, t)}
                </span>
              </span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                {manageRoles && member.role === "member" ? (
                  <MemberAction
                    label={t("groupsPanel.members.promote")}
                    onClick={() =>
                      void setRole({ networkId, groupId, memberPersonId: member.personId, role: "moderator" })
                        .then(() => toast.success(t("groupsPanel.toast.promoted")))
                        .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.roleFailed", t)))
                    }
                  />
                ) : null}
                {manageRoles && member.role === "moderator" ? (
                  <MemberAction
                    label={t("groupsPanel.members.demote")}
                    onClick={() =>
                      void setRole({ networkId, groupId, memberPersonId: member.personId, role: "member" })
                        .then(() => toast.success(t("groupsPanel.toast.demoted")))
                        .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.roleFailed", t)))
                    }
                  />
                ) : null}
                {moderate && member.role === "member" ? (
                  <MemberAction
                    label={t("groupsPanel.members.remove")}
                    onClick={() =>
                      void removeMember({ networkId, groupId, memberPersonId: member.personId })
                        .then(() => toast.success(t("groupsPanel.toast.memberRemoved")))
                        .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.removeFailed", t)))
                    }
                  />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {members.status === "CanLoadMore" ? (
          <div>
            <Button size="sm" variant="ghost" onClick={() => members.loadMore(MEMBERS_PAGE_SIZE)}>
              {t("groupsPanel.members.more")}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function MemberAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      {label}
    </Button>
  )
}

/**
 * UNE page du mur — son curseur, son abonnement (le patron de `FeedPage`).
 * Les gestes de MODÉRATION vivent SOUS la carte, jamais dedans : `PostCard`
 * sert tout le fil, l'autorité de groupe n'est pas son affaire.
 */
function GroupWallPage({
  groupId,
  cursor,
  now,
  isFirst,
  isLast,
  moderator,
  pinnedPostId,
  onTag,
  onMention,
  onTail,
  emptyFallback,
}: {
  groupId: GroupId
  cursor: GroupWallCursor | null
  now: number
  isFirst: boolean
  isLast: boolean
  moderator: boolean
  pinnedPostId: string | null
  onTag?: (tag: string) => void
  onMention?: (handle: string) => void
  onTail: (cursor: GroupWallCursor | null) => void
  emptyFallback: ReactNode
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const page = useAuthenticatedConvexQuery(api.modules.thematicGroups.thematicGroups.groupWall, {
    networkId,
    groupId,
    limit: WALL_PAGE_SIZE,
    ...(cursor === null ? {} : { cursor }),
  })
  const pin = useMutation(api.modules.thematicGroups.thematicGroups.pinGroupPost)
  const removePost = useMutation(api.modules.thematicGroups.thematicGroups.removeGroupPost)

  const items = page.data?.items ?? []
  const nextCursor = page.data?.nextCursor ?? null
  const pageEtat = etatDeQuery(page, items.length)

  useEffect(() => {
    if (!isLast || page.data === undefined) return
    onTail(nextCursor)
  }, [isLast, page.data, nextCursor, onTail])

  if (montreSquelette(pageEtat)) {
    return (
      <>
        <SkeletonCard />
        {isFirst ? <SkeletonCard /> : null}
      </>
    )
  }
  // Une page qu'on n'a pas pu lire ne dit pas « aucune publication » (R-08).
  if (page.isError && page.data === undefined) {
    return <ReseauQueryError title={t(GROUPS_ERROR_TEXT_KEYS.wall.title)} message={t(GROUPS_ERROR_TEXT_KEYS.wall.message)} onRetry={() => void page.refetch()} />
  }
  if (page.data === undefined) return null
  if (items.length === 0) return isFirst ? <>{emptyFallback}</> : null

  return (
    <>
      {page.isError ? (
        <ReseauQueryError title={t(GROUPS_ERROR_TEXT_KEYS.wall.title)} message={t(GROUPS_ERROR_TEXT_KEYS.wall.message)} onRetry={() => void page.refetch()} />
      ) : null}
      {items.map((post) => (
        <div key={post._id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <PostCard post={post} now={now} onTag={onTag} onMention={onMention} />
          {moderator ? (
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {String(post._id) !== pinnedPostId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void pin({ networkId, groupId, postId: post._id })
                      .then(() => toast.success(t("groupsPanel.toast.pinned")))
                      .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.pinFailed", t)))
                  }}
                >
                  {t("groupsPanel.wall.pin")}
                </Button>
              ) : null}
              <Button style={themedActionStyle("danger", "ghost")}
                size="sm"
                variant="danger"
                onClick={() => {
                  void removePost({ networkId, postId: post._id })
                    .then(() => toast.success(t("groupsPanel.toast.postRemoved")))
                    .catch((error: unknown) => toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.removeFailed", t)))
                }}
              >
                {t("groupsPanel.wall.removeFromGroup")}
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </>
  )
}
