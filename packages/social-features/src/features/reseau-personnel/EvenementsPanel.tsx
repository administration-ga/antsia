// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/EvenementsPanel.tsx @ ad2e7fdc2 — adaptations : mon agenda dans le réseau courant (`events.events.myAgenda` → `{ items, truncated }`, `respond`, `cancel` avec `networkId` par `useNetwork()`), la lacune de l'agenda borné se dit ; jour civil et dates dans le fuseau du NAVIGATEUR et la langue courante (plus de fuseau ni de langue imposés) ; organisateur nommé par le contrat `counterpartLabel` (nom neutre quand le profil n'est pas publié) ; refus du moteur lus par code (`eventActionErrorText`) ; état vide par `reseauEmptyState("agenda", home, t)` ; toutes les chaînes par l'i18n (espace `reseau`, clés `evenementsPanel.*` et `evenementsList.*`) ; COMPOSITION AJOUTÉE (iAgenda, qui la portait au socle, n'existe pas dans le moteur) : carte de création sur place (`events.events.create`, fuseau du navigateur fixé à la création, clé d'idempotence tirée à l'ouverture), ouverte par le bouton « Créer un évènement » quand aucun hôte ne fournit `onCreateEvent`, ou par l'INTENTION portée par l'adresse (`?nouveau=evenement&retour=…`, `agenda-create-intent`, consommée une fois puis retirée de l'URL, retour rendu après la création) ; l'organisateur invite ses relations depuis la carte (`events.events.invite` par le sélecteur de relations, récapitulatif sans mensonge poli) ; la liste des invités et de leurs réponses se déplie (`events.events.paginateEventParticipants`, paginée) ; primitives de `@antsia/ui`, kit d'espace de `@antsia/ui/espace-kit` (phrases de la pagination par `useEspacePaginationLabels`). ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil) ; couleurs par fonction (ADR-0027) : « Je participe » en variante `commerce`.
"use client"

// DG-023 : le panneau remplace myAgenda par AgendaPagination (quatre flux natifs),
// sous une portée réseau/lecteur ; le rail et l'ancien lecteur restent compatibles.
/**
 * Volet « Évènements » — mon agenda personnel dans le réseau.
 *
 * Ce qui se DÉCIDE — le classement en quatre sections mutuellement exclusives,
 * les libellés de réponse, la plage de dates, le récapitulatif d'une annonce,
 * les calculs du formulaire — vit dans `evenements-list.ts`, testé. Le volet
 * lui-même est vérifié MONTÉ dans `EvenementsPanel.test.tsx`.
 *
 * ⚠️ COMPOSER un évènement se fait ICI. Au socle, le volet renvoyait à iAgenda
 * par une intention portée par l'adresse ; le moteur n'a pas d'iAgenda : la
 * même intention (`agenda-create-intent.ts`) vise désormais ce volet, qui
 * l'ouvre, la consomme UNE fois et rend la main à l'adresse de retour. Le
 * bouton « Créer un évènement » ouvre la carte sur place — sauf si l'hôte veut
 * mener ailleurs (`onCreateEvent`), auquel cas il ne fait que l'appeler.
 *
 * ⚠️ « Annoncer au réseau » N'ANNONCE PAS d'un clic (R-16) : le geste ouvre
 * `AnnounceEventDialog`, où l'audience se CHOISIT, un mot s'ajoute, et un
 * récapitulatif sépare les INVITÉS des LECTEURS de l'annonce. Le bouton
 * « Annoncer » de la boîte EST la confirmation — une seule, jamais deux.
 *
 * ⚠️ « Annuler » n'est jamais à un clic : l'annulation prévient tous les
 * invités et ne se reprend pas. Le bouton passe par un second état explicite.
 *
 * Une panne de l'agenda n'est pas un agenda vide (R-08) : `ReseauQueryError`
 * + Réessayer. Les quatre chaînes natives sont relues ensemble ; une erreur
 * ou une relecture ferme les lignes jusqu'à la prochaine réponse autorisée.
 */

import { themedActionStyle } from "../themed-action-style"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { usePathname, useRouter, useSearchParams } from "@antsia/api/routing"
import { Badge, Button, Card, Field, SkeletonCard, TextArea, TextInput } from "@antsia/ui"
import { clampPage, EspaceEmptyState, EspacePagination, pageSlice } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { RESEAU_SURFACE_STYLE } from "../../shell/design-styles"
import { etatDePagination, etatDeQuery, montreElements, montreEtatVide, montreSquelette } from "../../shell/query-state"
import { ReseauPaginatedErrorBoundary } from "../../shell/ReseauPaginatedErrorBoundary"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { useEspacePaginationLabels } from "../../shell/use-espace-pagination-labels"
import { agendaCreateConsumedHref, parseAgendaCreateIntent } from "./agenda-create-intent"
import { AgendaPagination, type AgendaPaginationValue } from "./AgendaPagination"
import { AnnounceEventDialog } from "./AnnounceEventDialog"
import { AssociationAgendaCard } from "./AssociationAgendaCard"
import { groupAgendaEvents } from "./association-agenda"
import { Avatar } from "./Avatar"
import { reseauEmptyState } from "./empty-states"
import {
  END_BEFORE_START_KEY,
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_LOCATION_MAX_LENGTH,
  EVENT_SECTIONS,
  EVENT_SECTION_TITLE_KEYS,
  EVENT_TITLE_MAX_LENGTH,
  canRespond,
  classifyEventInviteResult,
  eventActionErrorText,
  eventInviteReportLabel,
  eventPersonName,
  formatEventRange,
  isEndAfterStart,
  isPastEvent,
  localDateTimeMs,
  myResponseLabel,
  participantStatusLabel,
  tomorrowLocalDate,
  validateEventTitle,
  type EvenementListItem,
  type EventInviteOutcome,
  type EventSectionKey,
} from "./evenements-list"
import { RelationPicker } from "./RelationPicker"
import type { RelationPickerCandidate } from "./relation-picker"

/** Chaque section de l'agenda (à venir, aujourd'hui, invitations en attente,
 *  passés) est paginée SÉPARÉMENT, à la même taille. */
const EVENTS_PAGE_SIZE = 8
/** Les invités d'un évènement, page après page. */
const PARTICIPANTS_PAGE_SIZE = 20

/**
 * Le vivier du sélecteur d'invités : AUCUN connu d'avance — la recherche
 * serveur parmi mes relations est la voie d'accès (`truncated`). Une constante
 * de module : son identité ne change jamais d'un rendu à l'autre.
 */
const NO_KNOWN_CANDIDATES: readonly RelationPickerCandidate[] = Object.freeze([])

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `evenement-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const MUTED_TEXT_STYLE = {
  margin: 0,
  fontSize: 12,
  color: "var(--muted-foreground)",
} as const

interface EvenementsPanelProps {
  /** L'instant de référence — paramètre, jamais `Date.now()` dans le rendu :
   *  c'est ce qui garde le classement des sections testable et stable. */
  now: number
  /**
   * Mener la création AILLEURS que dans ce volet. Absent (cas de la page
   * réseau du moteur), le bouton ouvre la carte de composition sur place.
   */
  onCreateEvent?: () => void
  /** Les hôtes en lecture seule ne proposent aucun geste personnel d'écriture. */
  canWrite?: boolean
}

export function EvenementsPanel(props: EvenementsPanelProps) {
  const { networkId, personId } = useNetwork()
  if (!personId) return null
  // Le changement de lecteur réinitialise aussi les formulaires et les annonces.
  return <AgendaPagination key={`${networkId}:${personId}`} now={props.now}>{(agenda) => <EvenementsPanelContent {...props} agenda={agenda} />}</AgendaPagination>
}

function EvenementsPanelContent({ now, onCreateEvent, canWrite = true, agenda }: EvenementsPanelProps & { readonly agenda: AgendaPaginationValue }) {
  const { t, i18n } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const home = useRoutes().home()
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const timeZone = useViewerTimeZone()
  const locale = i18n.language
  const paginationLabels = useEspacePaginationLabels()

  const respond = useMutation(api.modules.events.events.respond)
  const cancel = useMutation(api.modules.events.events.cancel)
  const [busy, setBusy] = useState<string | null>(null)
  /** L'évènement dont l'annulation attend sa confirmation — jamais deux. */
  const [confirming, setConfirming] = useState<string | null>(null)
  /** L'évènement dont l'annonce se compose — jamais deux boîtes. */
  const [announcing, setAnnouncing] = useState<string | null>(null)
  /** La carte de composition est-elle ouverte ? */
  const [composing, setComposing] = useState(false)
  /** Une page par section — chacune se reclampe à chaque rendu (liste en
   *  temps réel), jamais partagée entre sections. */
  const [sectionPages, setSectionPages] = useState<Record<EventSectionKey, number>>({
    upcoming: 1,
    today: 1,
    pendingInvitations: 1,
    past: 1,
  })

  /**
   * L'adresse à laquelle RENDRE LA MAIN après une création (R-16). Une `ref`
   * et non un état : elle ne fait rien rendre, et elle doit survivre au
   * `replace` qui retire les paramètres de l'URL.
   */
  const returnToRef = useRef<string | null>(null)
  /** La query dont l'intention a déjà été consommée — le `replace` est en route. */
  const consumedSearchRef = useRef<string | null>(null)

  /**
   * L'INTENTION de composition venue de l'adresse (`?nouveau=evenement`).
   *
   * ⚠️ Consommée UNE fois par adresse : sans ce verrou, un rendu rejoué avant
   * que le `replace` n'aboutisse rouvrirait la carte qu'on vient de fermer. Le
   * verrou tombe dès que l'adresse ne porte plus l'intention — la suivante est
   * une demande neuve.
   */
  useEffect(() => {
    if (!canWrite) return
    const params = new URLSearchParams(search)
    const intent = parseAgendaCreateIntent(params, home)
    if (intent.create === null) {
      consumedSearchRef.current = null
      return
    }
    if (consumedSearchRef.current === search) return
    consumedSearchRef.current = search
    returnToRef.current = intent.returnTo
    setComposing(true)
    router.replace(agendaCreateConsumedHref(pathname, params), { scroll: false })
  }, [search, home, pathname, router, canWrite])

  const events = agenda.isError || agenda.isLoading ? [] : agenda.data?.items ?? []
  // Un cache de données collectives ne survit pas à une erreur ou une relecture.
  const associationEvents = agenda.isError || agenda.isLoading ? [] : agenda.data?.associationItems ?? []
  const total = events.length + associationEvents.length
  const agendaEtat = etatDeQuery(agenda, total)
  const grouped = groupAgendaEvents(events, associationEvents, now, timeZone)

  const handleRespond = async (participationId: Id<"eventParticipants">, response: "accepted" | "declined") => {
    if (!canWrite) return
    setBusy(participationId)
    try {
      await respond({ networkId, participationId, response })
      // Dire CE QUI a été enregistré : les deux branches rendaient la même
      // phrase, si bien qu'accepter et décliner produisaient un accusé
      // identique — on ne savait pas lequel des deux boutons avait pris.
      toast.success(response === "accepted" ? t("evenementsPanel.toast.accepted") : t("evenementsPanel.toast.declined"))
    } catch (error) {
      toast.error(eventActionErrorText(error, "reseau:evenementsPanel.toast.respondFailed", t))
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = async (eventId: Id<"events">) => {
    if (!canWrite) return
    setBusy(eventId)
    try {
      await cancel({ networkId, eventId })
      toast.success(t("evenementsPanel.toast.cancelled"))
      setConfirming(null)
    } catch (error) {
      toast.error(eventActionErrorText(error, "reseau:evenementsPanel.toast.cancelFailed", t))
    } finally {
      setBusy(null)
    }
  }

  /** Après une création : fermer, puis rendre la main à qui l'a demandée — sauf si c'est déjà ici. */
  const handleCreated = () => {
    setComposing(false)
    const retour = returnToRef.current
    returnToRef.current = null
    if (retour !== null && retour !== agendaCreateConsumedHref(pathname, new URLSearchParams(search))) router.push(retour)
  }

  /** L'évènement dont la boîte d'annonce est ouverte — relu dans la liste
   *  VIVANTE : s'il disparaît (annulé ailleurs), la boîte se ferme d'elle-même
   *  plutôt que d'annoncer un évènement qui n'est plus là. */
  const announceTarget = canWrite ? events.find((event) => event.eventId === announcing) : undefined

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {canWrite && composing ? (
        <CreateEventCard
          timeZone={timeZone}
          onCreated={handleCreated}
          onCancel={() => {
            setComposing(false)
            returnToRef.current = null
          }}
        />
      ) : canWrite ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="secondary" icon="plus" onClick={onCreateEvent ?? (() => setComposing(true))}>
            {t("evenementsPanel.create")}
          </Button>
        </div>
      ) : null}

      {/* Un refus ferme les anciennes lignes jusqu'à Réessayer. */}
      {agenda.isError ? <ReseauQueryError title={t("evenementsPanel.errorTitle")} message={t("evenementsPanel.errorMessage")} onRetry={() => void agenda.refetch()} /> : null}

      {montreSquelette(agendaEtat) ? (
        <div style={{ display: "grid", gap: 12 }}><SkeletonCard /><SkeletonCard /></div>
      ) : montreEtatVide(agendaEtat, total) && !agenda.canLoadMore ? (
        <EspaceEmptyState compact text={reseauEmptyState("agenda", home, t).text} />
      ) : !montreElements(agendaEtat, total) ? null : (
        EVENT_SECTIONS.map((section) => {
          const items = grouped[section]
          if (items.length === 0) return null
          const safePage = clampPage(sectionPages[section], items.length, EVENTS_PAGE_SIZE)
          const visible = pageSlice(items, safePage, EVENTS_PAGE_SIZE)
          const title = t(EVENT_SECTION_TITLE_KEYS[section])
          return (
            <section key={section}>
              <h2
                style={{
                  margin: "0 0 10px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--muted-foreground)",
                }}
              >
                {title}
              </h2>
              <div style={{ display: "grid", gap: 10 }}>
                {visible.map((row) => {
                  if (row.kind === "association") return <AssociationAgendaCard key={`association:${row.event.eventId}`} event={row.event} locale={locale} timeZone={timeZone} />
                  const event = row.event
                  return (
                  <EventCard
                    key={event.eventId}
                    event={event}
                    now={now}
                    timeZone={timeZone}
                    locale={locale}
                    canWrite={canWrite}
                    busy={busy === event.eventId || busy === event.myParticipation?.participationId}
                    confirming={confirming === event.eventId}
                    onAskCancel={() => setConfirming(event.eventId)}
                    onAbortCancel={() => setConfirming(null)}
                    onCancel={() => void handleCancel(event.eventId)}
                    onAnnounce={() => setAnnouncing(event.eventId)}
                    onRespond={(response) => {
                      const participationId = event.myParticipation?.participationId
                      if (participationId !== undefined) void handleRespond(participationId, response)
                    }}
                  />
                  )
                })}
              </div>
              <EspacePagination
                page={safePage}
                pageSize={EVENTS_PAGE_SIZE}
                totalItems={items.length}
                onPageChange={(page) => setSectionPages((state) => ({ ...state, [section]: page }))}
                listLabel={title.toLocaleLowerCase(locale)}
                labels={paginationLabels}
              />
            </section>
          )
        })
      )}

      {agenda.controls}

      {/* La composition de l'annonce — une boîte à la fois, montée seulement
          quand un évènement l'attend : elle porte un portail et un piège de
          focus, la garder montée inerte en poserait un de plus dans l'arbre. */}
      {announceTarget !== undefined ? <AnnounceEventDialog event={announceTarget} onClose={() => setAnnouncing(null)} /> : null}
    </div>
  )
}

function EventCard({
  event,
  now,
  timeZone,
  locale,
  canWrite,
  busy,
  confirming,
  onAskCancel,
  onAbortCancel,
  onCancel,
  onAnnounce,
  onRespond,
}: {
  event: EvenementListItem
  now: number
  timeZone: string
  locale: string
  canWrite: boolean
  busy: boolean
  confirming: boolean
  onAskCancel: () => void
  onAbortCancel: () => void
  onCancel: () => void
  onAnnounce: () => void
  onRespond: (response: "accepted" | "declined") => void
}) {
  const { t } = useTranslation("reseau")
  const [showParticipants, setShowParticipants] = useState(false)
  const cancelled = event.status === "cancelled"
  const organizerName = eventPersonName(event.organizer.displayName, t)
  return (
    <Card padded style={RESEAU_SURFACE_STYLE}>
      <article style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{event.title}</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--muted-foreground)" }}>{formatEventRange(event.startAt, event.endAt, locale, timeZone)}</p>
          </span>
          {cancelled ? (
            <Badge tone="danger" size="sm">
              {t("evenementsPanel.card.cancelledBadge")}
            </Badge>
          ) : null}
        </div>

        {event.location !== null ? <p style={{ margin: 0, fontSize: 12.5 }}>{event.location}</p> : null}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar displayName={organizerName} avatarUrl={event.organizer.avatarUrl} hasIdentity={event.organizer.displayName !== null} size={22} />
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {event.isOrganizer ? t("evenementsPanel.card.youOrganize") : t("evenementsPanel.card.organizedBy", { name: organizerName })}
          </span>
          {event.myParticipation !== null ? (
            <Badge tone="neutral" size="sm">
              {myResponseLabel(event.myParticipation.status, t)}
            </Badge>
          ) : null}
        </div>

        {/* ⚠️ Les INVITÉS ne sont pas l'audience de l'annonce (R-16) : les
            premiers reçoivent l'invitation et répondent, la seconde voit
            passer une publication. Nommer la ligne « Invités » est ce qui
            empêche de lire ce compte comme une portée de diffusion. */}
        {event.participantCount > 0 ? (
          <p style={MUTED_TEXT_STYLE}>{t("evenementsPanel.card.guests", { count: event.acceptedCount, total: event.participantCount })}</p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {canWrite && canRespond(event, now, timeZone) && event.myParticipation !== null ? (
            <>
              {/* Participer : couleur de la participation (ADR-0027). */}
              <Button size="sm" variant="commerce" disabled={busy} onClick={() => onRespond("accepted")}>
                {t("evenementsPanel.card.accept")}
              </Button>
              <Button style={themedActionStyle("danger", "ghost")} size="sm" variant="danger" disabled={busy} onClick={() => onRespond("declined")}>
                {t("evenementsPanel.card.decline")}
              </Button>
            </>
          ) : null}

          {canWrite && event.isOrganizer && !cancelled ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onAnnounce}>
                {t("evenementsPanel.card.announce")}
              </Button>
              {/* Deux temps : l'annulation prévient tous les invités et ne se
                  reprend pas. Un seul clic serait une porte sans poignée. */}
              {confirming ? (
                <>
                  {/* ⚠️ Le passage en confirmation ne changeait RIEN pour qui
                      n'a pas l'écran : le bouton « Annuler l'évènement »
                      était remplacé en silence par deux autres. La région
                      l'annonce, et le bouton dangereux prend le focus. */}
                  <span role="status" aria-live="polite" className="sr-only">
                    {t("evenementsPanel.card.confirmCancelStatus")}
                  </span>
                  <Button size="sm" variant="danger" disabled={busy} autoFocus onClick={onCancel}>
                    {t("evenementsPanel.card.confirmCancel")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={onAbortCancel}>
                    {t("evenementsPanel.card.back")}
                  </Button>
                </>
              ) : (
                <Button style={themedActionStyle("danger", "ghost")} size="sm" variant="danger" disabled={busy} onClick={onAskCancel}>
                  {t("evenementsPanel.card.askCancel")}
                </Button>
              )}
            </>
          ) : null}

          {event.participantCount > 0 ? (
            <Button size="sm" variant="ghost" aria-expanded={showParticipants} onClick={() => setShowParticipants((current) => !current)}>
              {showParticipants ? t("evenementsPanel.participants.hide") : t("evenementsPanel.participants.show")}
            </Button>
          ) : null}
        </div>

        {/* Inviter — l'acte de l'organisateur, tant que l'évènement tient et n'est pas révolu. */}
        {canWrite && event.isOrganizer && !cancelled && !isPastEvent(event, now, timeZone) ? <EventInviteCard eventId={event.eventId} title={event.title} /> : null}

        {showParticipants && event.participantCount > 0 ? (
          <ReseauPaginatedErrorBoundary
            resetKey={`participants-${event.eventId}`}
            title={t("evenementsPanel.participants.errorTitle")}
            message={t("evenementsPanel.participants.errorMessage")}
          >
            <EventParticipants eventId={event.eventId} />
          </ReseauPaginatedErrorBoundary>
        ) : null}
      </article>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// Composer — la carte de création (le geste qu'iAgenda portait au socle)
// ═══════════════════════════════════════════════════════════════

/**
 * Créer un évènement — sur place, dans le volet.
 *
 * Trois règles héritées de la tranche serveur, visibles ici :
 *  · le FUSEAU est fixé à la création — celui choisi par l'organisateur,
 *    affiché pour que la fixation ne soit pas silencieuse ;
 *  · la clé d'idempotence est tirée à l'OUVERTURE de la carte, jamais à
 *    l'envoi — un double clic ou un renvoi réseau ne crée qu'un évènement ;
 *  · les invitations SUIVENT la création, depuis la carte de l'évènement
 *    (« Inviter des relations ») : une invitation en échec ne défait jamais
 *    un évènement déjà créé.
 */
function CreateEventCard({ timeZone, onCreated, onCancel }: { timeZone: string; onCreated: () => void; onCancel: () => void }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const create = useMutation(api.modules.events.events.create)
  const [title, setTitle] = useState("")
  const [date, setDate] = useState(() => tomorrowLocalDate(Date.now(), timeZone))
  const [startTime, setStartTime] = useState("10:00")
  const [endTime, setEndTime] = useState("11:00")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [timeError, setTimeError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [idempotencyKey] = useState(newIdempotencyKey)

  const titleError = title.trim().length === 0 ? null : validateEventTitle(title, t)

  const submit = async () => {
    if (submitting || validateEventTitle(title, t) !== null) return
    const startAt = localDateTimeMs(date, startTime, timeZone)
    const endAt = localDateTimeMs(date, endTime, timeZone)
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
      const message = t(date && startTime && endTime ? "evenementsPanel.composer.invalidCivilTime" : "evenementsPanel.composer.missingTiming")
      setTimeError(message)
      toast.error(message)
      const inputs = formRef.current?.querySelectorAll<HTMLInputElement>('[type="time"]')
      if (!date) formRef.current?.querySelector<HTMLInputElement>('[type="date"]')?.focus()
      else inputs?.[!Number.isFinite(startAt) ? 0 : 1]?.focus()
      return
    }
    // Contrôle CLIENT, avant l'envoi : le serveur refuse aussi une fin qui
    // précède le début — dire la règle ici évite un aller-retour perdu.
    if (!isEndAfterStart(startAt, endAt)) {
      setTimeError(t(END_BEFORE_START_KEY))
      toast.error(t(END_BEFORE_START_KEY))
      formRef.current?.querySelectorAll<HTMLInputElement>('[type="time"]')[1]?.focus()
      return
    }
    setTimeError(null)
    setSubmitting(true)
    try {
      await create({
        networkId,
        title: title.trim(),
        ...(description.trim().length > 0 ? { description: description.trim() } : {}),
        ...(location.trim().length > 0 ? { location: location.trim() } : {}),
        startAt,
        endAt,
        timeZone,
        idempotencyKey,
      })
      toast.success(t("evenementsPanel.toast.created"))
      onCreated()
    } catch (error) {
      toast.error(eventActionErrorText(error, "reseau:evenementsPanel.toast.createFailed", t))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card padded style={RESEAU_SURFACE_STYLE}>
      <form
        ref={formRef}
        aria-label={t("evenementsPanel.composer.form")}
        style={{ display: "grid", gap: 12 }}
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault()
          void submit()
        }}
      >
        {timeError ? <p role="alert" className="sr-only">{timeError}</p> : null}
        <div style={{ display: "grid", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t("evenementsPanel.composer.title")}</h2>
          <p style={MUTED_TEXT_STYLE}>{t("evenementsPanel.composer.zone", { timeZone })}</p>
        </div>
        <Field label={t("evenementsPanel.composer.titleLabel")} error={titleError ?? undefined}>
          <TextInput
            value={title}
            maxLength={EVENT_TITLE_MAX_LENGTH}
            onChange={(change) => setTitle(change.target.value)}
            placeholder={t("evenementsPanel.composer.titlePlaceholder")}
          />
        </Field>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <Field label={t("evenementsPanel.composer.date")}>
            <TextInput type="date" value={date} onChange={(change) => setDate(change.target.value)} />
          </Field>
          <Field label={t("evenementsPanel.composer.start")}>
            <TextInput
              type="time"
              value={startTime}
              onChange={(change) => {
                setStartTime(change.target.value)
                setTimeError(null)
              }}
            />
          </Field>
          <Field label={t("evenementsPanel.composer.end")} error={timeError ?? undefined}>
            <TextInput
              type="time"
              value={endTime}
              onChange={(change) => {
                setEndTime(change.target.value)
                setTimeError(null)
              }}
            />
          </Field>
        </div>
        <Field label={t("evenementsPanel.composer.location")}>
          <TextInput
            value={location}
            maxLength={EVENT_LOCATION_MAX_LENGTH}
            onChange={(change) => setLocation(change.target.value)}
            placeholder={t("evenementsPanel.composer.locationPlaceholder")}
          />
        </Field>
        <Field label={t("evenementsPanel.composer.description")}>
          <TextArea rows={3} value={description} maxLength={EVENT_DESCRIPTION_MAX_LENGTH} onChange={(change) => setDescription(change.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button style={themedActionStyle("cancel", "ghost")} type="button" variant="outline" disabled={submitting} onClick={onCancel}>
            {t("evenementsPanel.composer.cancel")}
          </Button>
          <Button type="submit" disabled={submitting || validateEventTitle(title, t) !== null}>
            {submitting ? t("evenementsPanel.composer.submitting") : t("evenementsPanel.composer.submit")}
          </Button>
        </div>
      </form>
    </Card>
  )
}

/**
 * Inviter des relations — un acte de l'organisateur, par le SÉLECTEUR de
 * relations : on cherche par le nom ou l'`@identifiant` parmi SES relations
 * (les seules que le serveur accepte), on coche, on envoie. Chaque personne est
 * re-jugée par le serveur ; le récapitulatif dit ce qui est fait.
 */
function EventInviteCard({ eventId, title }: { eventId: Id<"events">; title: string }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const invite = useMutation(api.modules.events.events.invite)

  const fermer = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div>
        <Button ref={triggerRef} size="sm" variant="ghost" icon="userPlus" aria-expanded={open} onClick={() => (open ? fermer() : setOpen(true))}>
          {t("evenementsPanel.invite.open")}
        </Button>
      </div>
      {open ? (
        <RelationPicker
          label={t("evenementsPanel.invite.picker", { title })}
          candidates={NO_KNOWN_CANDIDATES}
          truncated
          emptyText={t("evenementsPanel.invite.empty")}
          onClose={fermer}
          onSubmit={async (selected) => {
            const outcome: EventInviteOutcome = { invited: 0, alreadyResponded: 0, failed: 0 }
            for (const person of selected) {
              const handle = person.handle
              if (!handle) {
                outcome.failed += 1
                continue
              }
              try {
                const result = await invite({ networkId, eventId, handle })
                outcome[classifyEventInviteResult(result)] += 1
              } catch {
                outcome.failed += 1
              }
            }
            const phrase = eventInviteReportLabel(outcome, t)
            if (outcome.failed > 0 && outcome.invited === 0) toast.error(phrase)
            else toast.success(phrase)
          }}
        />
      ) : null}
    </div>
  )
}

/** Les invités d'un évènement et leurs réponses — à un évènement, les invités se voient. Paginés. */
function EventParticipants({ eventId }: { eventId: Id<"events"> }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const participants = useAuthenticatedPaginatedQuery(api.modules.events.events.paginateEventParticipants, { networkId, eventId }, { initialNumItems: PARTICIPANTS_PAGE_SIZE })
  const etat = etatDePagination(participants.status, participants.results.length)

  if (montreSquelette(etat)) return <SkeletonCard />
  if (participants.results.length === 0) return <p style={MUTED_TEXT_STYLE}>{t("evenementsPanel.participants.empty")}</p>
  return (
    <section aria-label={t("evenementsPanel.participants.title")} style={{ display: "grid", gap: 6 }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
        {participants.results.map((row) => {
          const name = eventPersonName(row.person.displayName, t)
          return (
            <li key={row.participationId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <Avatar displayName={name} avatarUrl={row.person.avatarUrl} hasIdentity={row.person.displayName !== null} size={22} />
              <span style={{ flex: 1, minWidth: 0 }}>{name}</span>
              <Badge tone="neutral" size="sm">
                {participantStatusLabel(row.status, t)}
              </Badge>
            </li>
          )
        })}
      </ul>
      {participants.status === "CanLoadMore" ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => participants.loadMore(PARTICIPANTS_PAGE_SIZE)}>
            {t("evenementsPanel.participants.more")}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
