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
import { useMutation } from "convex/react"
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { DirectGuestPicker, type DraftGuest } from "./DirectGuestPicker"
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
  title?: string | null
  userIds: readonly string[]
  sourceThreadId?: string | null
}

function CreateDirectDraft({ onClose, prefill, asPage }: { onClose: () => void; prefill?: ConferencePrefill; asPage?: { pageId: Id<"pages">; name: string } }) {
  const { t } = useTranslation("direct")
  const { networkId, charte } = useNetwork()
  const routes = useRoutes()
  const router = useRouter()
  const create = useMutation(api.modules.live.sessions.create)
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
      stageFormat: "computer",
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
    if (!pageUsable || !guestsUsable || (draft.audience === "followers" && !pageId)) return
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
      onClose()
      router.push(routes.conference(result.sessionId))
    } catch (failure) {
      if (mounted.current) setError(postEngineErrorText(failure, "direct:failed", t))
    }
  })(event) }
  return (
    <EspaceDialog title={t("create.title")} description={t("create.description")} closeLabel={t("close")} onClose={isSubmitting ? () => undefined : onClose}>
      <form data-charte={charte} onSubmit={submit} className="flex flex-col gap-4" style={{ "--ui2-button-min-h": "44px", "--ui2-button-sm-min-h": "44px" } as CSSProperties}>
        <fieldset disabled={isSubmitting} className="contents">
        <label className="flex flex-col gap-2 text-sm">{t("create.identity")}<select value={pageId ?? ""} onChange={(event) => { const value = event.target.value; setPageId(value ? value as Id<"pages"> : undefined); if (!value && audience === "followers") setValue("audience", "connections") }} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3"><option value="">{t("create.personal")}</option>{pages.data?.map((page) => <option key={page.pageId} value={page.pageId}>{page.name}</option>)}{pageId && !pages.data?.some((page) => page.pageId === pageId) ? <option value={pageId}>{asPage?.name ?? t("create.pageUnavailable")}</option> : null}</select></label>
        {pages.isError ? <p role="alert">{t("create.pagesFailed")}</p> : null}
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
        <p className="text-sm text-muted-foreground">{t("create.networkOnly")}</p>
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
        <DirectGuestPicker key={`${networkId}:${followersPageId ?? "all"}`} guests={guests} onChange={setGuests} profiles={eligibility.data?.eligible ?? []} sourceThreadId={sourceThreadId} followersPageId={followersPageId} />
        {guests.length > 0 && !guestsUsable ? <p role={eligibility.isError ? "alert" : "status"}>{t(eligibility.data ? "create.guestsChanged" : eligibility.isError ? "guests.failed" : "create.checkingGuests")}</p> : null}
        </fieldset>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={isSubmitting || !pageUsable || !guestsUsable || (audience === "followers" && !pageId)}>{isSubmitting ? t("pending") : t("create.submit")}</Button>
      </form>
    </EspaceDialog>
  )
}

export function CreateDirectDialog(props: Parameters<typeof CreateDirectDraft>[0]) {
  const { networkId } = useNetwork()
  return <CreateDirectDraft key={`${networkId}:${props.asPage?.pageId ?? "personal"}`} {...props} />
}
