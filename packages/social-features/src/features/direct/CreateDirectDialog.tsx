// Dupliqué de socle/packages/agent-features/src/features/direct/CreateDirectDialog.tsx @ ad2e7fdc2 — adaptations : première tranche personnelle réécrite sur le moteur (réseau, personnes, routes injectées, RHF/Zod, i18n) ; pages/followers et sélection nominative initiale F3c ; invités proposés par iCom conservés et rejugés par le serveur.
"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { useRouter } from "@antsia/api/routing"
import { DIRECT_TITLE_MAX_LENGTH, DIRECT_DEFAULT_MAX_VIEWERS, DIRECT_MAX_VIEWERS_CAP, DIRECT_MAX_INVITEES } from "@antsia/social-domain/live/domain"
import { Button } from "@antsia/ui"
import { EspaceDialog } from "@antsia/ui/espace-kit"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction, useMutation } from "convex/react"
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { DirectGuestPicker, type DraftGuest } from "./DirectGuestPicker"
import { directSessionStore, useDirectSessionStore } from "../../stores/direct-session-store"
import { useDirectDraftPreview } from "./use-direct-draft-preview"
import { postEngineErrorText } from "../reseau-personnel/post-overflow"

const schema = z.object({
  title: z.string().trim().min(1).max(DIRECT_TITLE_MAX_LENGTH),
  audience: z.enum(["public", "connections", "followers", "invitees"]),
  maxViewers: z.number().int().min(1).max(DIRECT_MAX_VIEWERS_CAP),
  replay: z.boolean(),
  announce: z.boolean(),
  stageFormat: z.enum(["computer", "television", "mobile"]),
  stageLayout: z.enum(["adaptive", "fixed"]),
})
type Draft = z.infer<typeof schema>
export type ConferencePrefill = {
  quickSetup?: boolean
  title?: string | null
  userIds: readonly string[]
  sourceThreadId?: string | null
}

function CreateDirectDraft({ onClose, prefill, asPage }: { onClose: () => void; prefill?: ConferencePrefill; asPage?: { pageId: Id<"pages">; name: string } }) {
  const { t } = useTranslation("direct")
  const { networkId, charte, liveStudioPreview } = useNetwork()
  const routes = useRoutes()
  const router = useRouter()
  const create = useMutation(api.modules.live.sessions.create)
  const checkConfiguration = useAction(api.modules.live.livekitActions.checkBroadcastConfiguration)
  const goLive = useMutation(api.modules.live.sessions.goLive)
  const requestToken = useAction(api.modules.live.livekitActions.requestDirectToken)
  const leaveViewer = useMutation(api.modules.live.presence.leave)
  const room = useDirectSessionStore()
  const roomBusy = room.credentials !== null || room.phase === "connecting" || room.phase === "reconnecting"
  const {
    audioOnly, setAudioOnly, attachVideo, status: previewStatus,
    error: previewError, isReady: previewReady, release: releasePreview, retry: retryPreview,
  } = useDirectDraftPreview(Boolean(liveStudioPreview) && !roomBusy)
  const compact = liveStudioPreview || prefill?.quickSetup
  const submitting = useRef(false)
  const id = useId()
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const pages = useAuthenticatedConvexQuery(api.modules.pages.pages.myPages, { networkId })
  const [pageId, setPageId] = useState<Id<"pages"> | undefined>(asPage?.pageId)
  const [guests, setGuests] = useState<DraftGuest[]>(() => {
    const people = [...new Set(prefill?.userIds ?? [])].slice(0, DIRECT_MAX_INVITEES)
    return people.map((personId) => ({ personId: personId as Id<"persons">, stageRole: people.length === 1 ? "speaker" : "viewer" }))
  })
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting } } = useForm<Draft>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: prefill?.title ?? "",
      audience: prefill && prefill.userIds.length > 0 ? "invitees" : asPage ? "followers" : "connections",
      maxViewers: DIRECT_DEFAULT_MAX_VIEWERS,
      replay: false,
      announce: false,
      stageFormat: compact && typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px) and (pointer: coarse)").matches ? "mobile" : "computer",
      stageLayout: "adaptive",
    },
  })
  const audience = useWatch({ control, name: "audience" })
  const sourceThreadId = prefill?.sourceThreadId ? prefill.sourceThreadId as Id<"groupThreads"> : undefined
  const followersPageId = audience === "followers" ? pageId : undefined
  const eligibility = useAuthenticatedConvexQuery(api.modules.live.invitees.checkEligibility, guests.length && (audience !== "followers" || pageId) ? { networkId, personIds: guests.map((guest) => guest.personId), sourceThreadId, followersPageId } : "skip")
  const pageUsable = pageId === undefined || (!pages.isError && pages.data?.some((page) => page.pageId === pageId))
  const guestsUsable = guests.length === 0 || (!eligibility.isError && eligibility.data?.eligible.length === guests.length)
  const announcementAllowed = audience !== "invitees" && (!pageId || audience === "public" || audience === "followers")
  const submit = (event: FormEvent<HTMLFormElement>) => { void handleSubmit(async (draft) => {
    setError(null)
    if (submitting.current || !pageUsable || !guestsUsable || (draft.audience === "followers" && !pageId)) return
    if (liveStudioPreview && (roomBusy || !previewReady())) return
    submitting.current = true
    let createdSession: Id<"liveSessions"> | undefined
    let localFailure: string | undefined
    try {
      const result = await create({
        networkId,
        title: draft.title,
        audience: draft.audience,
        chatMode: "open",
        stageFormat: draft.stageFormat,
        stageLayout: draft.stageLayout,
        maxViewers: draft.maxViewers,
        replay: draft.replay,
        announce: announcementAllowed && draft.announce,
        ...(pageId ? { pageId } : {}),
        idempotencyKey,
        ...(guests.length ? { invitees: guests } : {}),
        ...(prefill?.sourceThreadId ? { sourceThreadId: prefill.sourceThreadId as Id<"groupThreads"> } : {}),
      })
      if (!mounted.current) return
      createdSession = result.sessionId
      // After an uncertain network response the idempotency key can return an older
      // draft. Show its saved audience and title before the host confirms it again.
      if (liveStudioPreview && result.created) {
        const args = { networkId, sessionId: result.sessionId }
        await checkConfiguration(args)
        if (!mounted.current) return
        const held = directSessionStore.getState()
        if (!previewReady()) localFailure = t("preflight.failed")
        if (held.credentials || held.phase === "connecting" || held.phase === "reconnecting") localFailure = t("anotherRoom")
        if (localFailure) throw new Error(localFailure)
        releasePreview()
        directSessionStore.prepare(result.sessionId, { audioOnly, micEnabled: true, cameraEnabled: !audioOnly })
        await goLive(args)
        if (!mounted.current || directSessionStore.getState().sessionId !== result.sessionId) return
        directSessionStore.setPhase("connecting")
        const credentials = await requestToken(args)
        if (credentials.role === "viewer") {
          await leaveViewer(args).catch(() => undefined)
          localFailure = t("antenna.roleChanged")
          throw new Error(localFailure)
        }
        if (!mounted.current || directSessionStore.getState().sessionId !== result.sessionId) return
        directSessionStore.setCredentials({ ...credentials, sessionId: result.sessionId })
      }
      onClose()
      router.push(routes.conference(result.sessionId))
    } catch (failure) {
      if (!mounted.current) return
      const message = localFailure ?? postEngineErrorText(failure, "direct:failed", t)
      if (liveStudioPreview && createdSession) {
        // The session already exists. Resume it with its original settings, even if a
        // response was lost between starting the broadcast and obtaining a room token.
        const held = directSessionStore.getState()
        if (!held.sessionId || held.sessionId === createdSession) {
          directSessionStore.prepare(createdSession, { audioOnly })
          directSessionStore.setPhase("error", message)
        }
        onClose()
        router.push(routes.conference(createdSession))
      } else {
        setError(message)
      }
    } finally {
      submitting.current = false
    }
  })(event) }
  const guestPicker = <DirectGuestPicker key={`${networkId}:${followersPageId ?? "all"}`} guests={guests} onChange={setGuests} profiles={eligibility.data?.eligible ?? []} sourceThreadId={sourceThreadId} followersPageId={followersPageId} />
  const changeIdentity = (value: string) => {
    setPageId(value ? value as Id<"pages"> : undefined)
    if (!value && audience === "followers") setValue("audience", "connections")
  }
  const identity = (
    <label className="flex flex-col gap-2 text-sm">
      {t(liveStudioPreview ? "create.pageIdentity" : "create.identity")}
      <select value={pageId ?? ""} onChange={(event) => changeIdentity(event.target.value)} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3">
        <option value="">{t("create.personal")}</option>
        {pages.data?.map((page) => <option key={page.pageId} value={page.pageId}>{page.name}</option>)}
        {pageId && !pages.data?.some((page) => page.pageId === pageId)
          ? <option value={pageId}>{asPage?.name ?? t("create.pageUnavailable")}</option>
          : null}
      </select>
    </label>
  )
  const studioSettings = (
    <>
        <label className="flex flex-col gap-2 text-sm">{t("studio.emission")}<select {...register("stageFormat")} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3">{(["computer", "television", "mobile"] as const).map((format) => <option key={format} value={format}>{t(`studio.formats.${format}`)}</option>)}</select></label>
        <label className="flex flex-col gap-2 text-sm">{t("studio.layout")}<select {...register("stageLayout")} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3"><option value="adaptive">{t("studio.adaptive")}</option><option value="fixed">{t("studio.fixed")}</option></select></label>
        <label htmlFor={`${id}-capacity`} className="flex flex-col gap-2 text-sm">
          {t("create.capacity")}
          <input id={`${id}-capacity`} type="number" min={1} max={DIRECT_MAX_VIEWERS_CAP} {...register("maxViewers", { valueAsNumber: true })} aria-invalid={!!errors.maxViewers} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3" />
          {errors.maxViewers ? <span role="alert">{t("create.invalidCapacity", { max: DIRECT_MAX_VIEWERS_CAP, DIRECT_MAX_INVITEES })}</span> : null}
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" {...register("replay")} />{t("create.record")}</label>
        <p className="text-sm text-muted-foreground">{t("create.recordDescription")}</p>
        {announcementAllowed ? <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" {...register("announce")} />{t("create.announce")}</label> : null}
        {!announcementAllowed && audience !== "invitees" ? <p className="text-sm">{t("create.noPageAnnouncement")}</p> : null}
    </>
  )
  const startDisabled = isSubmitting || !pageUsable || !guestsUsable || (audience === "followers" && !pageId) ||
    (liveStudioPreview && (roomBusy || previewStatus !== "ready"))
  const startButton = (
    <Button type="submit" form={id} className={liveStudioPreview ? "w-full" : undefined} disabled={startDisabled}>
      {isSubmitting ? t("pending") : t(liveStudioPreview ? "start" : "create.submit")}
    </Button>
  )
  return (
    <EspaceDialog footer={liveStudioPreview ? startButton : undefined} title={t("create.title")} description={liveStudioPreview ? undefined : t("create.description")} closeLabel={t("close")} onClose={isSubmitting ? () => undefined : onClose}>
      <form id={id} data-direct-setup="" data-charte={charte} onSubmit={submit} onKeyDown={(event) => {
        // Enter in a title or search field must not put the host on air.
        if (liveStudioPreview && event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault()
      }} className="flex flex-col gap-4" style={{ "--ui2-button-min-h": "44px", "--ui2-button-sm-min-h": "44px" } as CSSProperties}>
        <fieldset disabled={isSubmitting} className="contents">
        {!liveStudioPreview ? identity : null}
        {pages.isError && (!liveStudioPreview || pageId) ? <p role="alert">{t("create.pagesFailed")}</p> : null}
        {!pageUsable ? <p role="alert">{t("create.pageUnavailable")}</p> : null}
        <label htmlFor={`${id}-title`} className="flex flex-col gap-2 text-sm">
          {t("create.name")}
          <input id={`${id}-title`} {...register("title")} maxLength={DIRECT_TITLE_MAX_LENGTH} aria-invalid={!!errors.title} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3" />
          {errors.title ? <span role="alert">{t("create.invalidTitle", { max: DIRECT_TITLE_MAX_LENGTH })}</span> : null}
        </label>
        <label htmlFor={`${id}-audience`} className="flex flex-col gap-2 text-sm">
          {t("create.audience")}
          <select id={`${id}-audience`} {...register("audience")} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3">
            <option value="connections">{t("audience.connections")}</option>
            <option value="public">{t("audience.public")}</option>
            <option value="invitees">{t("audience.invitees")}</option>
            {pageId ? <option value="followers">{t("audience.followers")}</option> : null}
          </select>
        </label>
        {liveStudioPreview ? <>
          {roomBusy ? <p role="status">{t("anotherRoom")}</p> : <div className="grid gap-2 rounded-lg bg-muted p-3">
            {!audioOnly ? <video ref={attachVideo} autoPlay muted playsInline aria-label={t("preflight.preview")} className="aspect-video max-h-52 w-full rounded-lg bg-background object-contain" /> : null}
            <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={audioOnly} onChange={(event) => setAudioOnly(event.target.checked)} />{t("preflight.audioOnly")}</label>
            {previewStatus === "failed" ? <><p role="alert">{previewError}</p><Button type="button" variant="ghost" onClick={retryPreview}>{t("retry")}</Button></> : <p role="status" className="text-sm">{t(previewStatus === "ready" ? "preflight.ready" : "preflight.acquiring")}</p>}
          </div>}
          {pages.data?.length || pageId ? <details open={pageId ? true : undefined} className="rounded-lg bg-muted px-3">
            <summary className="cursor-pointer py-3 text-sm font-medium">{t("create.pageIdentity")}</summary>
            <div className="pb-3">{identity}</div>
          </details> : null}
        </> : <p className="text-sm text-muted-foreground">{t("create.networkOnly")}</p>}
        {compact ? (
          <details open={errors.maxViewers ? true : undefined} className="rounded-lg border border-input px-3">
            <summary className="cursor-pointer py-3 text-sm font-medium">{t("create.options")}</summary>
            <div className="grid gap-3 pb-3">{studioSettings}</div>
          </details>
        ) : studioSettings}
        {compact && audience !== "invitees" && !prefill?.userIds.length ? (
          <details className="rounded-lg border border-input px-3">
            <summary className="cursor-pointer py-3 text-sm font-medium">{t("create.invitePeople")}</summary>
            {guestPicker}
          </details>
        ) : guestPicker}
        {guests.length > 0 && !guestsUsable ? <p role={eligibility.isError ? "alert" : "status"}>{t(eligibility.data ? "create.guestsChanged" : eligibility.isError ? "guests.failed" : "create.checkingGuests")}</p> : null}
        </fieldset>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {!liveStudioPreview ? startButton : null}
      </form>
    </EspaceDialog>
  )
}

export function CreateDirectDialog(props: Parameters<typeof CreateDirectDraft>[0]) {
  const { networkId } = useNetwork()
  return <CreateDirectDraft key={`${networkId}:${props.asPage?.pageId ?? "personal"}`} {...props} />
}
