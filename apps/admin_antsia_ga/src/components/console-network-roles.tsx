"use client"

/**
 * EX-08 (plan 13) et issue 98 — « Responsables du réseau », dans la section « Équipes » : les
 * administrateurs et les modérateurs d'un réseau, nommés et retirés par un administrateur de la
 * plateforme, motif à l'appui (`modules/platform/networkRoles`). Tout opérateur lit la liste.
 */
import { api, type Id } from "@antsia/api/engine"
import { Button, Field, Select, TextInput } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import { Search, ShieldCheck } from "lucide-react"
import { useId, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { controlStyle, EmptyRows, inputStyle, LoadingRows, MotiveAction, panelClass, useOperationDraftGuard, useWindowCursor, WindowPagination } from "./console-operation-controls"

const RESPONSIBLE_ROLES = ["network_admin", "network_moderator"] as const
type ResponsibleRole = typeof RESPONSIBLE_ROLES[number]
/** Même borne que le moteur (`NETWORK_ROLE_REASON_MIN`) : une décision sur une adhésion. */
const ROLE_REASON_MIN = 10
const ROLE_PAGE_SIZE = 20

type RolesPage = { page: { personId: Id<"persons">; handle: string | null; displayName: string | null; active: boolean }[]; isDone: boolean; continueCursor: string }

function RoleHolders({ networkId, responsibleRole, result, window, canAdmin }: { networkId: Id<"networks">; responsibleRole: ResponsibleRole; result: RolesPage | undefined; window: ReturnType<typeof useWindowCursor>; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const headingId = useId()
  const setRole = useMutation(api.modules.platform.networkRoles.setNetworkRole)
  return <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
    <h3 id={headingId} className="font-semibold">{t(`networkRoles.roles.${responsibleRole}`)}</h3>
    {result === undefined ? <LoadingRows /> : result.page.length === 0 ? <EmptyRows done={result.isDone} /> : <ul className="flex min-w-0 flex-col gap-3">{result.page.map((holder) => <li key={holder.personId} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <div className="min-w-0 break-words">
        <p>{holder.displayName ?? t("teams.neutralMember")}</p>
        {holder.handle ? <p className="text-sm text-muted-foreground">{t("teams.memberHandle", { handle: holder.handle })}</p> : null}
        <p className="text-xs text-muted-foreground">{t(holder.active ? "common.active" : "networkRoles.inactive")}</p>
      </div>
      {canAdmin ? <MotiveAction label={t("networkRoles.remove")} danger minLength={ROLE_REASON_MIN} successKey="networkRoles.removed" onDecision={(reason) => setRole({ networkId, personId: holder.personId, role: "member", reason })} /> : null}
    </li>)}</ul>}
    <WindowPagination window={window} result={result} />
  </section>
}

type AppointValues = { handle: string; role: ResponsibleRole }

function AppointResponsible({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const [searched, setSearched] = useState<string | null>(null)
  const form = useForm<AppointValues>({
    resolver: zodResolver(z.object({ handle: z.string().trim().transform((value) => value.replace(/^@/, "")).pipe(z.string().min(1, t("teams.handleInvalid")).max(64, t("teams.handleInvalid"))), role: z.enum(RESPONSIBLE_ROLES) })),
    defaultValues: { handle: "", role: "network_moderator" },
  })
  const current = useWatch({ control: form.control, name: "handle", defaultValue: "" }).trim().replace(/^@/, "")
  const role = useWatch({ control: form.control, name: "role", defaultValue: "network_moderator" })
  const member = useQuery(api.modules.platform.console.findMember, searched !== null && current === searched ? { networkId, handle: searched } : "skip")
  const setRole = useMutation(api.modules.platform.networkRoles.setNetworkRole)
  const canChange = useOperationDraftGuard()
  const handleField = form.register("handle")
  return <div className={`${panelClass} flex flex-col gap-4`}>
    <h3 className="font-semibold">{t("networkRoles.appoint")}</h3>
    <form noValidate onSubmit={(event) => { void form.handleSubmit(({ handle }) => setSearched(handle.trim().replace(/^@/, "")))(event) }} className="flex min-w-0 flex-col gap-3">
      <Field htmlFor={`${id}-handle`} label={t("teams.handle")} hint={t("networkRoles.handleHint")} error={form.formState.errors.handle?.message}><TextInput id={`${id}-handle`} style={inputStyle} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} {...handleField} onChange={(event) => {
        const next = event.currentTarget.value.trim().replace(/^@/, "")
        if (next !== current && searched === current && member != null && !canChange()) { event.currentTarget.value = form.getValues("handle"); return }
        void handleField.onChange(event)
      }} /></Field>
      <Field htmlFor={`${id}-role`} label={t("networkRoles.role")}><Select id={`${id}-role`} style={inputStyle} {...form.register("role")}>{RESPONSIBLE_ROLES.map((option) => <option key={option} value={option}>{t(`networkRoles.roleOption.${option}`)}</option>)}</Select></Field>
      <Button type="submit" variant="outline" style={controlStyle}><Search size={16} aria-hidden="true" />{t("teams.find")}</Button>
    </form>
    {searched !== null && current === searched ? member === undefined ? <LoadingRows /> : member === null ? <p role="status" className="text-sm text-muted-foreground">{t("teams.notFound")}</p> : <>
      <p className="break-words text-sm">{member.displayName ?? t("teams.neutralMember")} {member.handle ? t("teams.memberHandle", { handle: member.handle }) : null}</p>
      <MotiveAction
        label={t("networkRoles.appointAs", { role: t(`networkRoles.roleOption.${role}`) })}
        minLength={ROLE_REASON_MIN}
        successKey={null}
        onDecision={(reason) => setRole({ networkId, personId: member.personId, role, reason })}
        onSuccess={(result) => {
          if (result.changed) toast.success(t("networkRoles.appointed"))
          else toast.info(t("networkRoles.unchanged"))
          form.reset()
          setSearched(null)
        }}
      />
    </> : null}
  </div>
}

export function NetworkRolesPanel({ networkId, canAdmin }: { networkId: Id<"networks">; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const adminsWindow = useWindowCursor()
  const moderatorsWindow = useWindowCursor()
  const admins = useQuery(api.modules.platform.networkRoles.paginateNetworkRoles, { networkId, role: "network_admin", paginationOpts: { cursor: adminsWindow.cursor, numItems: ROLE_PAGE_SIZE } })
  const moderators = useQuery(api.modules.platform.networkRoles.paginateNetworkRoles, { networkId, role: "network_moderator", paginationOpts: { cursor: moderatorsWindow.cursor, numItems: ROLE_PAGE_SIZE } })
  const managed = (admins?.managedBy ?? moderators?.managedBy ?? null) !== null
  return <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.6fr)]">
    <section className={`${panelClass} flex min-w-0 flex-col gap-4`} aria-label={t("networkRoles.title")}>
      <h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck size={22} aria-hidden="true" />{t("networkRoles.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("networkRoles.lead")}</p>
      {managed ? <p className="rounded-lg border border-border p-3 text-sm">{t("networkRoles.managed")}</p> : null}
      <RoleHolders networkId={networkId} responsibleRole="network_admin" result={admins} window={adminsWindow} canAdmin={canAdmin} />
      <RoleHolders networkId={networkId} responsibleRole="network_moderator" result={moderators} window={moderatorsWindow} canAdmin={canAdmin} />
    </section>
    {canAdmin ? <AppointResponsible networkId={networkId} /> : <p className={`${panelClass} text-sm text-muted-foreground`}>{t("networkRoles.adminRequired")}</p>}
  </div>
}
