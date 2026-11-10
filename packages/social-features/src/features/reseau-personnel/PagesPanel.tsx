// Réécrit d'après socle/packages/agent-features/src/features/reseau-personnel/PagesPanel.tsx @ ad2e7fdc2 — ce qui change : pages du moteur à identité propre, dans le réseau courant (`useNetwork`) : pages suivies par la première page de `pages.pages.paginateMyPageFollows` (catalogue chargé une fois, 50 au plus, troncature DITE), découverte PAGINÉE par `paginateDiscover` (recherche serveur ET filtre par pays, codes ISO nommés dans la langue courante) ; badge CALCULÉ par le serveur au lieu d'un « Page officielle » posé sur toute page, nature et pays sur chaque ligne ; kit d'espace lu à son point d'entrée (`@antsia/ui/espace-kit` : `EspaceEmptyState`, `EspacePagination` — phrases traduites par `useEspacePaginationLabels` —, `clampPage`, `pageSlice`, et sa feuille `EspaceKitStyles` montée par le volet lui-même, présent aussi sur téléphone) ; adresses par la table des routes injectée (`pageHref(handle, routes.page)`) ; textes traduits (clés `pagesPanel.…`) ; ajouts sur la vue par défaut : invitations à signer (`pages.signatories.myPageInvitations`, `respondToPageInvitation`), « Mes pages » (`myPages`, avec le rôle), et création d'une page (`createPage`, brouillon jugé par les règles du domaine, puis ouverture de la page créée) ; props inchangés (aucun). ; couleurs par fonction (ADR-0027) : l'acceptation d'une invitation en validation opt-in (relations en repli).
"use client"

/**
 * Le volet PAGES de la page réseau — les pages que je suis, celles au nom
 * desquelles je publie, mes invitations à signer, et celles à découvrir.
 *
 * Ce composant ne DÉCIDE rien : filtrage, sections, libellés, états vides et
 * jugement du brouillon viennent de `pages-panel.ts` (module pur, testé) ;
 * ici on monte des requêtes et on pose des gestes (`PageFollowButton`,
 * répondre à une invitation, créer). Le clic sur une page mène à SA fiche
 * (`pageHref`, `author-link.ts`) — jamais une vue interne : une page a une
 * adresse publique, contrairement à un groupe thématique.
 *
 * La recherche PART au serveur : `paginateDiscover({ query, country })` est
 * PAGINÉE (« Afficher plus de pages ») ; le terme saisi attend la pause de
 * frappe (`useDebouncedValue`) et le seuil du serveur
 * (`pagesServerSearchTerm`, deux caractères) avant de partir. Les pages
 * SUIVIES, elles, restent un catalogue chargé une fois (50 au plus) et filtré
 * sur place ; `sectionsFor` dédoublonne les deux.
 *
 * Une panne ne se présente jamais comme un annuaire vide : la pagination
 * LÈVE et se tient dans `ReseauPaginatedErrorBoundary`, la requête des pages
 * suivies (`followed.isError`) pose `ReseauQueryError` sans vider ce qu'elle
 * tient, et l'état vide n'est prononcé qu'après ÉPUISEMENT
 * (`etatDePagination`). Le champ de recherche vit HORS de la frontière : une
 * panne ne fait pas perdre la saisie.
 *
 * Charte : aucune couleur littérale — jetons `var(--…)` uniquement.
 */

import { themedActionStyle } from "../themed-action-style"
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery, useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link, useRouter } from "@antsia/api/routing"
import type { Badge as TrustBadge } from "@antsia/social-domain/badges"
import {
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_HANDLE_MAX_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  PAGE_SHORT_NAME_MAX_LENGTH,
} from "@antsia/social-domain/pages"
import { Alert, Badge, Button, Card, Field, Select, SkeletonCard, TextArea, TextInput, useDebouncedValue } from "@antsia/ui"
import { clampPage, EspaceEmptyState, EspaceKitStyles, EspacePagination, pageSlice } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useId, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { RESEAU_CARD_STYLE, RESEAU_FIELD_STYLE, RESEAU_SECONDARY_ACTION_STYLE } from "../../shell/design-styles"
import { etatDePagination, etatDeQuery, montreEtatVide, montreSquelette, type EtatListe } from "../../shell/query-state"
import { ReseauPaginatedErrorBoundary } from "../../shell/ReseauPaginatedErrorBoundary"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { useEspacePaginationLabels } from "../../shell/use-espace-pagination-labels"
import { pageHref } from "./author-link"
import { Avatar } from "./Avatar"
import { PageFollowButton } from "./PageFollowButton"
import {
  checkPageDraft,
  countryName,
  countryOptions,
  emptyPageDraft,
  emptyPagesText,
  followedTruncatedText,
  MEMBER_OWNER_KINDS,
  normalizeQuery,
  ownerKindLabel,
  pageActionErrorMessage,
  pageBadgeView,
  pageHandlePreview,
  pageInvitationText,
  pageMetaLine,
  pageRoleLabel,
  PAGES_DISCOVER_PAGE_SIZE,
  PAGES_FOLLOWED_CATALOG_SIZE,
  PAGES_FOLLOWED_PAGE_SIZE,
  pagesErrorText,
  pagesSectionTitle,
  pagesServerSearchTerm,
  sectionsFor,
  type PageDraft,
  type PageDraftField,
} from "./pages-panel"

/** Une ligne d'annuaire telle que le moteur la rend (suivies et découverte partagent la forme). */
type EnginePageSummary = FunctionReturnType<typeof api.modules.pages.pages.paginateMyPageFollows>["page"][number]
type MyPage = FunctionReturnType<typeof api.modules.pages.pages.myPages>[number]
type PageInvitation = FunctionReturnType<typeof api.modules.pages.signatories.myPageInvitations>[number]

const SECTION_TITLE_STYLE = {
  margin: 0,
  color: "var(--ink-900)",
  fontSize: 14,
  fontWeight: 700,
} as const

const MUTED_TEXT_STYLE = {
  margin: 0,
  color: "var(--ink-600)",
  fontSize: 13,
  lineHeight: 1.55,
} as const

const SECTION_STYLE = { display: "flex", flexDirection: "column", gap: 10 } as const

const ROW_STYLE = { display: "flex", alignItems: "flex-start", gap: 12 } as const

const NAME_LINE_STYLE = { margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } as const

const NAME_LINK_STYLE = { color: "var(--ink-900)", textDecoration: "none", fontSize: 14.5, fontWeight: 700 } as const

export function PagesPanel() {
  const { t, i18n } = useTranslation("reseau")
  const locale = i18n.language
  const { networkId } = useNetwork()
  const [query, setQuery] = useState("")
  const [country, setCountry] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [followedPage, setFollowedPage] = useState(1)
  // Le terme n'atteint le serveur qu'après la pause de frappe ET le seuil de
  // deux caractères — en deçà, le catalogue chargé se filtre sur place.
  const debouncedQuery = useDebouncedValue(query)
  const serverTerm = pagesServerSearchTerm(debouncedQuery)
  const isFiltering = normalizeQuery(query).length > 0 || country !== null

  const followed = useAuthenticatedConvexQuery(api.modules.pages.pages.paginateMyPageFollows, {
    networkId,
    paginationOpts: { numItems: PAGES_FOLLOWED_CATALOG_SIZE, cursor: null },
  })
  const followedPages: readonly EnginePageSummary[] = followed.data?.page ?? []
  const followedEtat = etatDeQuery(followed, followedPages.length)
  // Plus de 50 abonnements : le catalogue est tronqué, et l'écran le dit.
  const followedTruncated = followed.data !== undefined && !followed.data.isDone
  const followedError = pagesErrorText("followed", t)
  const discoverError = pagesErrorText("discover", t)

  return (
    /* `data-collection` : le catalogue des pages est une COLLECTION — la
       colonne de lecture de la tablette se relâche pour lui. */
    <div data-collection="pages" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* La feuille du kit (état vide, pagination) : montée ici aussi, car sur
          téléphone l'arbre du bureau qui la monte n'est pas rendu ; une seule
          feuille au document (`<style href>` dédoublonné). */}
      <EspaceKitStyles />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("pagesPanel.searchPlaceholder")}
            aria-label={t("pagesPanel.searchLabel")}
            icon="search"
            style={{ ...RESEAU_FIELD_STYLE }}
          />
        </div>
        <div style={{ flex: "0 1 220px", minWidth: 0 }}>
          <Select
            aria-label={t("pagesPanel.countryLabel")}
            value={country ?? ""}
            onChange={(event) => setCountry(event.target.value === "" ? null : event.target.value)}
            style={{ ...RESEAU_FIELD_STYLE }}
          >
            <option value="">{t("pagesPanel.countryAll")}</option>
            {countryOptions(locale).map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          icon={creating ? "x" : "plus"}
          aria-expanded={creating}
          onClick={() => setCreating((open) => !open)}
          style={RESEAU_SECONDARY_ACTION_STYLE}
        >
          {t("pagesPanel.createToggle")}
        </Button>
      </div>

      {creating ? <CreatePageCard onClose={() => setCreating(false)} /> : null}

      {/* La panne des pages suivies se DIT, et ne vide pas ce qu'on tient :
          les sections ci-dessous continuent de rendre `followed.data`. */}
      {followed.isError ? (
        <ReseauQueryError title={followedError.title} message={followedError.message} onRetry={() => void followed.refetch()} />
      ) : null}

      {/* La vue par défaut seulement : une recherche ou un pays filtré ne
          montrent que des résultats. */}
      {isFiltering ? null : <MyPagesSections />}

      {/* Un nouveau terme ou un autre pays réarme la frontière : après une
          panne, chercher autre chose relance de soi-même. */}
      <ReseauPaginatedErrorBoundary
        resetKey={`pages-discover:${serverTerm ?? ""}:${country ?? ""}`}
        title={discoverError.title}
        message={discoverError.message}
      >
        <PagesDiscovery
          followed={followedPages}
          followedEtat={followedEtat}
          followedTruncated={followedTruncated}
          query={query}
          serverTerm={serverTerm}
          country={country}
          countryLabel={country === null ? null : countryName(country, locale)}
          followedPage={followedPage}
          onFollowedPageChange={setFollowedPage}
        />
      </ReseauPaginatedErrorBoundary>
    </div>
  )
}

/**
 * La découverte PAGINÉE et les sections qui en découlent (`sectionsFor`).
 *
 * Sous la frontière : une panne de `paginateDiscover` lève au rendu et se
 * tient là-haut, avec Réessayer — jamais ici en « aucune page ». L'état vide
 * n'est prononcé qu'à l'ÉPUISEMENT (`etatDePagination`) : tant qu'une page
 * peut suivre, « rien » serait un mensonge.
 */
function PagesDiscovery({
  followed,
  followedEtat,
  followedTruncated,
  query,
  serverTerm,
  country,
  countryLabel,
  followedPage,
  onFollowedPageChange,
}: {
  followed: readonly EnginePageSummary[]
  followedEtat: EtatListe
  followedTruncated: boolean
  query: string
  serverTerm: string | null
  country: string | null
  countryLabel: string | null
  followedPage: number
  onFollowedPageChange: (page: number) => void
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const paginationLabels = useEspacePaginationLabels()
  const discovered = useAuthenticatedPaginatedQuery(
    api.modules.pages.pages.paginateDiscover,
    {
      networkId,
      ...(serverTerm === null ? {} : { query: serverTerm }),
      ...(country === null ? {} : { country }),
    },
    { initialNumItems: PAGES_DISCOVER_PAGE_SIZE },
  )
  const sections = sectionsFor(followed, discovered.results, query, { serverSearched: serverTerm !== null, country })
  const shown = sections.reduce((total, section) => total + section.pages.length, 0)
  const discoverEtat = etatDePagination(discovered.status, shown)

  if (montreSquelette(followedEtat) || montreSquelette(discoverEtat)) {
    return (
      <>
        <SkeletonCard />
        <SkeletonCard />
      </>
    )
  }

  // Rien nulle part, et le serveur a FINI de répondre. Si les pages suivies
  // sont en panne, le bandeau du dessus parle déjà : on n'affirme rien.
  if (montreEtatVide(discoverEtat, shown) && followedEtat !== "erreur") {
    return <EspaceEmptyState text={emptyPagesText(query, followed.length > 0, countryLabel, t)} />
  }

  return (
    <>
      {sections.map((section) => {
        const title = pagesSectionTitle(section.kind, t)
        const isFollowedSection = section.kind === "followed"
        const safePage = clampPage(followedPage, section.pages.length, PAGES_FOLLOWED_PAGE_SIZE)
        // Les pages suivies se paginent sur place ; la découverte et les
        // résultats rendent tout ce que le serveur a servi jusqu'ici.
        const visible = isFollowedSection ? pageSlice(section.pages, safePage, PAGES_FOLLOWED_PAGE_SIZE) : section.pages
        return (
          <section key={section.kind} aria-label={title} style={SECTION_STYLE}>
            <h2 style={SECTION_TITLE_STYLE}>{title}</h2>
            {visible.map((page) => (
              <PageRow key={page.pageId} page={page} />
            ))}
            {isFollowedSection ? (
              <EspacePagination
                page={safePage}
                pageSize={PAGES_FOLLOWED_PAGE_SIZE}
                totalItems={section.pages.length}
                onPageChange={onFollowedPageChange}
                listLabel={title.toLowerCase()}
                labels={paginationLabels}
              />
            ) : null}
            {isFollowedSection && followedTruncated ? <p style={MUTED_TEXT_STYLE}>{followedTruncatedText(t)}</p> : null}
          </section>
        )
      })}
      {discovered.status === "CanLoadMore" ? (
        <div>
          <Button variant="secondary" style={RESEAU_SECONDARY_ACTION_STYLE} onClick={() => discovered.loadMore(PAGES_DISCOVER_PAGE_SIZE)}>
            {t("pagesPanel.loadMore")}
          </Button>
        </div>
      ) : null}
      {discovered.status === "LoadingMore" ? (
        <p role="status" aria-live="polite" style={MUTED_TEXT_STYLE}>
          {t("pagesPanel.loadingMore")}
        </p>
      ) : null}
    </>
  )
}

/** Le badge de confiance d'une page, tel que le serveur l'a calculé. */
function PageTrustBadge({ badge }: { badge: TrustBadge }) {
  const { t } = useTranslation("reseau")
  const view = pageBadgeView(badge)
  return (
    <Badge tone={view.tone} size="sm" icon={view.icon}>
      {t(view.labelKey)}
    </Badge>
  )
}

/** Une carte de page : logo carré, nom, badge, description, nature · pays · abonnés, suivi. */
function PageRow({ page }: { page: EnginePageSummary }) {
  const { t, i18n } = useTranslation("reseau")
  const routes = useRoutes()
  const href = pageHref(page.handle, routes.page)
  return (
    <Card style={RESEAU_CARD_STYLE}>
      <div style={ROW_STYLE}>
        <Link href={href} aria-label={t("pagesPanel.pageLink", { name: page.name })} style={{ display: "inline-flex", flexShrink: 0 }}>
          <Avatar displayName={page.name} avatarUrl={page.logoUrl} shape="square" size={48} />
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={NAME_LINE_STYLE}>
            <Link href={href} style={NAME_LINK_STYLE}>
              {page.name}
            </Link>
            <PageTrustBadge badge={page.badge} />
          </p>
          {page.description ? <p style={{ ...MUTED_TEXT_STYLE, marginTop: 4 }}>{page.description}</p> : null}
          <p style={{ ...MUTED_TEXT_STYLE, marginTop: 4, fontSize: 12.5 }}>{pageMetaLine(page, i18n.language, t)}</p>
        </div>
        <PageFollowButton pageId={page.pageId} handle={page.handle} following={page.following} />
      </div>
    </Card>
  )
}

/**
 * La vue par défaut, au-dessus de l'annuaire : mes invitations à signer (une
 * habilitation ne vaut qu'acceptée), puis les pages au nom desquelles je
 * publie. Rien n'est rendu pendant le chargement — ce ne sont pas les
 * sections principales du volet —, mais une panne se dit, avec Réessayer.
 */
function MyPagesSections() {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const mine = useAuthenticatedConvexQuery(api.modules.pages.pages.myPages, { networkId })
  const invitations = useAuthenticatedConvexQuery(api.modules.pages.signatories.myPageInvitations, { networkId })
  const myPages = mine.data ?? []
  const pending = invitations.data ?? []
  const mineError = pagesErrorText("mine", t)
  const invitationsError = pagesErrorText("invitations", t)
  const invitationsTitle = pagesSectionTitle("invitations", t)
  const mineTitle = pagesSectionTitle("mine", t)

  return (
    <>
      {invitations.isError ? (
        <ReseauQueryError title={invitationsError.title} message={invitationsError.message} onRetry={() => void invitations.refetch()} />
      ) : null}
      {pending.length > 0 ? (
        <section aria-label={invitationsTitle} style={SECTION_STYLE}>
          <h2 style={SECTION_TITLE_STYLE}>{invitationsTitle}</h2>
          {pending.map((invitation) => (
            <InvitationRow key={invitation.page.pageId} invitation={invitation} />
          ))}
        </section>
      ) : null}
      {mine.isError ? <ReseauQueryError title={mineError.title} message={mineError.message} onRetry={() => void mine.refetch()} /> : null}
      {myPages.length > 0 ? (
        <section aria-label={mineTitle} style={SECTION_STYLE}>
          <h2 style={SECTION_TITLE_STYLE}>{mineTitle}</h2>
          {myPages.map((page) => (
            <MyPageRow key={page.pageId} page={page} />
          ))}
        </section>
      ) : null}
    </>
  )
}

/** Une page au nom de laquelle je publie, et mon rôle sur elle. */
function MyPageRow({ page }: { page: MyPage }) {
  const { t, i18n } = useTranslation("reseau")
  const routes = useRoutes()
  const href = pageHref(page.handle, routes.page)
  const meta = [ownerKindLabel(page.ownerKind, t), ...(page.country === null ? [] : [countryName(page.country, i18n.language)])].join(" · ")
  return (
    <Card style={RESEAU_CARD_STYLE}>
      <div style={ROW_STYLE}>
        <Link href={href} aria-label={t("pagesPanel.pageLink", { name: page.name })} style={{ display: "inline-flex", flexShrink: 0 }}>
          <Avatar displayName={page.name} avatarUrl={page.logoUrl} shape="square" size={40} />
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={NAME_LINE_STYLE}>
            <Link href={href} style={NAME_LINK_STYLE}>
              {page.name}
            </Link>
            <PageTrustBadge badge={page.badge} />
            <Badge tone="info" size="sm" icon="key">
              {pageRoleLabel(page.role, t)}
            </Badge>
          </p>
          <p style={{ ...MUTED_TEXT_STYLE, marginTop: 4, fontSize: 12.5 }}>{meta}</p>
        </div>
      </div>
    </Card>
  )
}

/** Une invitation à signer pour une page : l'accepter ou la décliner (décliner l'efface). */
function InvitationRow({ invitation }: { invitation: PageInvitation }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const respond = useMutation(api.modules.pages.signatories.respondToPageInvitation)
  const [busy, setBusy] = useState(false)
  const page = invitation.page
  const href = pageHref(page.handle, routes.page)

  const answer = async (accept: boolean) => {
    setBusy(true)
    try {
      await respond({ networkId, pageId: page.pageId, accept })
      toast.success(t(accept ? "pagesPanel.invitation.accepted" : "pagesPanel.invitation.declined"))
    } catch (err) {
      toast.error(pageActionErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={RESEAU_CARD_STYLE}>
      <div style={{ ...ROW_STYLE, flexWrap: "wrap" }}>
        <Link href={href} aria-label={t("pagesPanel.pageLink", { name: page.name })} style={{ display: "inline-flex", flexShrink: 0 }}>
          <Avatar displayName={page.name} avatarUrl={page.logoUrl} shape="square" size={40} />
        </Link>
        <div style={{ minWidth: 0, flex: "1 1 200px" }}>
          <p style={NAME_LINE_STYLE}>
            <Link href={href} style={NAME_LINK_STYLE}>
              {page.name}
            </Link>
            <PageTrustBadge badge={page.badge} />
          </p>
          <p style={{ ...MUTED_TEXT_STYLE, marginTop: 4 }}>{pageInvitationText(invitation.role, t)}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button style={themedActionStyle("success", "social")} size="sm" variant="success" disabled={busy} onClick={() => void answer(true)}>
            {t("pagesPanel.invitation.accept")}
          </Button>
          <Button style={themedActionStyle("danger", "secondary")} size="sm" variant="danger" disabled={busy} onClick={() => void answer(false)}>
            {t("pagesPanel.invitation.decline")}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/**
 * Créer une page — un membre VÉRIFIÉ du réseau, pour une association, une
 * entreprise, un média ou un collectif. Le brouillon se juge avant l'envoi
 * avec les règles du domaine (sous chaque champ) ; un refus du serveur
 * (adresse prise, adhésion insuffisante, débit) se dit au-dessus du
 * formulaire, par son code. Créée, la page s'ouvre.
 */
function CreatePageCard({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const router = useRouter()
  const createPage = useMutation(api.modules.pages.pages.createPage)
  const [draft, setDraft] = useState<PageDraft>(emptyPageDraft)
  const [errors, setErrors] = useState<Partial<Record<PageDraftField, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()
  const preview = pageHandlePreview(draft)

  const update = <K extends keyof PageDraft>(key: K, value: PageDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const check = checkPageDraft(draft, t)
    if (!check.ok) {
      setErrors(check.errors)
      return
    }
    setErrors({})
    setServerError(null)
    setPending(true)
    try {
      const created = await createPage({ networkId, ...check.args })
      toast.success(t("pagesPanel.create.created"))
      onClose()
      router.push(pageHref(created.handle, routes.page))
    } catch (err) {
      setServerError(pageActionErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card style={RESEAU_CARD_STYLE}>
      <form aria-labelledby={titleId} noValidate onSubmit={(event) => void submit(event)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 id={titleId} style={SECTION_TITLE_STYLE}>
          {t("pagesPanel.create.title")}
        </h2>
        <p style={MUTED_TEXT_STYLE}>{t("pagesPanel.create.intro")}</p>
        {serverError === null ? null : <Alert tone="danger">{serverError}</Alert>}
        <Field label={t("pagesPanel.create.name")} required error={errors.name}>
          <TextInput value={draft.name} maxLength={PAGE_NAME_MAX_LENGTH} onChange={(event) => update("name", event.target.value)} />
        </Field>
        <Field label={t("pagesPanel.create.ownerKind")}>
          <Select
            value={draft.ownerKind}
            onChange={(event) => {
              const kind = MEMBER_OWNER_KINDS.find((candidate) => candidate === event.target.value)
              if (kind !== undefined) update("ownerKind", kind)
            }}
          >
            {MEMBER_OWNER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ownerKindLabel(kind, t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t("pagesPanel.create.handle")}
          error={errors.handle}
          hint={preview === null ? t("pagesPanel.create.handleHintEmpty") : t("pagesPanel.create.handleHint", { handle: preview })}
        >
          <TextInput
            value={draft.handle}
            maxLength={PAGE_HANDLE_MAX_LENGTH}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => update("handle", event.target.value)}
          />
        </Field>
        <Field label={t("pagesPanel.create.shortName")} error={errors.shortName}>
          <TextInput value={draft.shortName} maxLength={PAGE_SHORT_NAME_MAX_LENGTH} onChange={(event) => update("shortName", event.target.value)} />
        </Field>
        <Field label={t("pagesPanel.create.description")} error={errors.description}>
          <TextArea value={draft.description} maxLength={PAGE_DESCRIPTION_MAX_LENGTH} rows={3} onChange={(event) => update("description", event.target.value)} />
        </Field>
        <Field label={t("pagesPanel.create.country")}>
          <Select value={draft.country ?? ""} onChange={(event) => update("country", event.target.value === "" ? null : event.target.value)}>
            <option value="">{t("pagesPanel.create.countryNone")}</option>
            {countryOptions(i18n.language).map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? t("pagesPanel.create.pending") : t("pagesPanel.create.submit")}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose} style={themedActionStyle("cancel", "secondary", RESEAU_SECONDARY_ACTION_STYLE)}>
            {t("pagesPanel.create.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  )
}
