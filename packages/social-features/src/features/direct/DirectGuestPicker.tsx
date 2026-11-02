// Dupliqué de socle/packages/agent-features/src/features/direct/DirectInviteesPanel.tsx @ ad2e7fdc2 — adaptations : sélection du brouillon en personnes, vérification réactive du cercle followers, bornes du domaine, i18n ; aucun invité écrit avant la création.
"use client"
import { themedActionStyle } from "../themed-action-style"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { DIRECT_MAX_INVITEES, DIRECT_MAX_SPEAKER_INVITEES } from "@antsia/social-domain/live/domain"
import { Button } from "@antsia/ui"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

export type DraftGuest = { personId: Id<"persons">; stageRole: "viewer" | "speaker" }
export function DirectGuestPicker({ guests, onChange, profiles, sourceThreadId, followersPageId }: {
  guests: DraftGuest[]; onChange: (guests: DraftGuest[]) => void
  profiles: FunctionReturnType<typeof api.modules.live.invitees.checkEligibility>["eligible"]
  sourceThreadId?: Id<"groupThreads">; followersPageId?: Id<"pages">
}) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const [search, setSearch] = useState("")
  const [needle, setNeedle] = useState("")
  useEffect(() => { const timer = setTimeout(() => setNeedle(search.trim()), 250); return () => clearTimeout(timer) }, [search])
  const query = useAuthenticatedConvexQuery(api.modules.live.invitees.searchCandidates, { networkId, search: needle, sourceThreadId, followersPageId })
  const speakersFull = guests.filter((guest) => guest.stageRole === "speaker").length >= DIRECT_MAX_SPEAKER_INVITEES
  const candidates = query.data?.candidates.filter((person) => !guests.some((guest) => guest.personId === person.personId)) ?? []
  return <fieldset className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
    <legend className="font-semibold">{t("guests.list")}</legend>
    <p className="text-sm text-muted-foreground">{t("create.guestsDescription")}</p>
    <p className="text-sm" aria-live="polite">{t("guests.capacity", { count: guests.length, max: DIRECT_MAX_INVITEES })}</p>
    <label className="flex flex-col gap-2 text-sm">{t("guests.search")}<input value={search} maxLength={80} onChange={(event) => setSearch(event.target.value)} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3" /></label>
    <p className="text-xs text-muted-foreground">{t("create.searchBound")}</p>
    {query.isError ? <p role="alert">{t("guests.failed")}</p> : query.data === undefined ? <p role="status">{t("loading")}</p> : candidates.length === 0 ? <p className="text-sm">{t("guests.noCandidates")}</p> : <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">{candidates.map((person) => <li key={person.personId} className="flex flex-wrap items-center justify-between gap-2"><span>{person.displayName ?? person.handle ?? t("person")}{person.handle ? <span className="block text-xs text-muted-foreground">{t("create.handle", { handle: person.handle })}</span> : null}</span><Button type="button" size="sm" disabled={guests.length >= DIRECT_MAX_INVITEES} onClick={() => onChange([...guests, { personId: person.personId, stageRole: "viewer" }])}>{t("guests.add")}</Button></li>)}</ul>}
    <ul className="flex flex-col gap-3">{guests.map((guest, index) => {
      const person = profiles.find((profile) => profile.personId === guest.personId)
      const name = person?.displayName && person.handle ? t("create.guestName", { name: person.displayName, handle: person.handle }) : person?.displayName ?? person?.handle ?? t("create.unnamedGuest", { number: index + 1 })
      return <li key={guest.personId} className="flex flex-col gap-2 border-t border-border pt-3"><span>{name}</span>{!person ? <p className="text-sm text-destructive">{t("create.guestUnavailable")}</p> : null}<label className="flex flex-col gap-2 text-sm">{t("create.guestRole", { name })}<select value={guest.stageRole} onChange={(event) => onChange(guests.map((entry) => entry.personId === guest.personId ? { ...entry, stageRole: event.target.value === "speaker" ? "speaker" : "viewer" } : entry))} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3"><option value="viewer">{t("guests.viewer")}</option><option value="speaker" disabled={guest.stageRole !== "speaker" && speakersFull}>{t("guests.speaker")}</option></select></label><Button style={themedActionStyle("danger", "ghost")} type="button" variant="danger" size="sm" aria-label={t("create.removeGuest", { name })} onClick={() => onChange(guests.filter((entry) => entry.personId !== guest.personId))}>{t("create.remove")}</Button></li>
    })}</ul>
  </fieldset>
}
