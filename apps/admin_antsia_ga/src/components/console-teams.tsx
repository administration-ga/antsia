"use client"

import { api, type Id } from "@antsia/api/engine"
import { MODERATION_SURFACES } from "@antsia/social-domain/moderationPolicy"
import { Button, Field, Select, TextArea, TextInput } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import { Search, UsersRound } from "lucide-react"
import { useId, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { ModerationPolicyPanel } from "./console-moderation-policy"
import { controlStyle, EmptyRows, inputStyle, LoadingRows, MotiveAction, OperationFailure, panelClass, reasonSchema, useOperation, useOperationDraft, useOperationDraftGuard } from "./console-operation-controls"

const surfaces = MODERATION_SURFACES
const teamScopes = ["all", ...surfaces] as const
type TeamScope = typeof teamScopes[number]
type TeamValues = { name: string; scope: TeamScope; reason: string }

function CreateTeam({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const create = useMutation(api.modules.platform.console.createTeam)
  const operation = useOperation()
  const form = useForm<TeamValues>({
    resolver: zodResolver(z.object({ name: z.string().trim().min(2, t("teams.nameInvalid")).max(100, t("teams.nameInvalid")), scope: z.enum(teamScopes), reason: reasonSchema(t("common.reasonInvalid", { min: 3 })) })),
    defaultValues: { name: "", scope: "all", reason: "" },
  })
  useOperationDraft(form.formState.isDirty || form.formState.isSubmitting || operation.pending)
  const submit = async (values: TeamValues) => {
    const saved = await operation.run(() => create({ networkId, name: values.name, ...(values.scope === "all" ? {} : { scope: values.scope }), reason: values.reason }))
    if (saved) form.reset()
  }
  return <form className={`${panelClass} flex flex-col gap-4`} noValidate aria-busy={operation.pending || undefined} onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
    <h3 className="font-semibold">{t("teams.create")}</h3>
    <fieldset disabled={operation.pending} className="flex min-w-0 flex-col gap-4">
      <Field htmlFor={`${id}-name`} label={t("teams.name")} required error={form.formState.errors.name?.message}><TextInput id={`${id}-name`} style={inputStyle} maxLength={100} {...form.register("name")} /></Field>
      <Field htmlFor={`${id}-scope`} label={t("teams.scope")}><Select id={`${id}-scope`} style={inputStyle} {...form.register("scope")}>{teamScopes.map((scope) => <option key={scope} value={scope}>{t(`surfaces.${scope}`)}</option>)}</Select></Field>
      <Field htmlFor={`${id}-reason`} label={t("common.reason")} required error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={500} {...form.register("reason")} /></Field>
    </fieldset>
    <OperationFailure message={operation.error} />
    <Button type="submit" style={controlStyle} disabled={operation.pending}>{t(operation.pending ? "common.saving" : "teams.create")}</Button>
  </form>
}

function AddMember({ networkId, teamId }: { networkId: Id<"networks">; teamId: Id<"moderationTeams"> }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const [searched, setSearched] = useState<string | null>(null)
  const form = useForm<{ handle: string }>({ resolver: zodResolver(z.object({ handle: z.string().trim().transform((value) => value.replace(/^@/, "")).pipe(z.string().min(1, t("teams.handleInvalid")).max(64, t("teams.handleInvalid"))) })), defaultValues: { handle: "" } })
  const current = useWatch({ control: form.control, name: "handle", defaultValue: "" }).trim().replace(/^@/, "")
  const member = useQuery(api.modules.platform.console.findMember, searched !== null && current === searched ? { networkId, handle: searched } : "skip")
  const setMember = useMutation(api.modules.platform.console.setTeamMember)
  const canChange = useOperationDraftGuard()
  const handleField = form.register("handle")
  return <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
    <form noValidate onSubmit={(event) => { void form.handleSubmit(({ handle }) => setSearched(handle.trim().replace(/^@/, "")))(event) }} className="flex flex-col gap-3">
      <Field htmlFor={`${id}-handle`} label={t("teams.handle")} hint={t("teams.handleHint")} error={form.formState.errors.handle?.message}><TextInput id={`${id}-handle`} style={inputStyle} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} {...handleField} onChange={(event) => {
        const next = event.currentTarget.value.trim().replace(/^@/, "")
        if (next !== current && searched === current && member != null && !canChange()) { event.currentTarget.value = form.getValues("handle"); return }
        void handleField.onChange(event)
      }} /></Field>
      <Button type="submit" variant="outline" style={controlStyle}><Search size={16} aria-hidden="true" />{t("teams.find")}</Button>
    </form>
    {searched !== null && current === searched ? member === undefined ? <LoadingRows /> : member === null ? <p role="status" className="text-sm text-muted-foreground">{t("teams.notFound")}</p> : <>
      <p className="text-sm">{member.displayName ?? t("teams.neutralMember")} {member.handle ? t("teams.memberHandle", { handle: member.handle }) : null}</p>
      <MotiveAction label={t("teams.add")} onDecision={(reason) => setMember({ networkId, teamId, personId: member.personId, active: true, reason })} />
    </> : null}
  </div>
}

export function TeamsPanel({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const teams = useQuery(api.modules.platform.console.listTeams, { networkId })
  const setMember = useMutation(api.modules.platform.console.setTeamMember)
  // MC-02 : les réglages de modération du réseau suivent ses équipes, dans la même section.
  return <div className="flex min-w-0 flex-col gap-5"><div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.6fr)]">
    <section className={`${panelClass} flex min-w-0 flex-col gap-4`} aria-label={t("teams.title")}>
      <h2 className="flex items-center gap-2 text-xl font-semibold"><UsersRound size={22} aria-hidden="true" />{t("teams.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("teams.lead")}</p>
      {teams === undefined ? <LoadingRows /> : teams.length === 0 ? <EmptyRows /> : <ul className="flex min-w-0 flex-col gap-5">{teams.map((team) => <li key={team.teamId} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-4">
        <div><h3 className="break-words font-semibold">{team.name}</h3><p className="text-sm text-muted-foreground">{t(`surfaces.${team.scope ?? "all"}`)} · {t(team.active ? "common.active" : "common.inactive")}</p></div>
        {team.members.length === 0 ? <p className="text-sm text-muted-foreground">{t("teams.noMembers")}</p> : <ul className="flex flex-col gap-3">{team.members.map((member) => <li key={member.personId} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="min-w-0 break-words"><p>{member.displayName ?? t("teams.neutralMember")}</p>{member.handle ? <p className="text-sm text-muted-foreground">{t("teams.memberHandle", { handle: member.handle })}</p> : null}<p className="text-xs text-muted-foreground">{t(member.active ? "common.active" : "common.inactive")}</p></div>
          <MotiveAction label={t("teams.remove")} danger onDecision={(reason) => setMember({ networkId, teamId: team.teamId, personId: member.personId, active: false, reason })} />
        </li>)}</ul>}
        {team.active ? <AddMember networkId={networkId} teamId={team.teamId} /> : null}
      </li>)}</ul>}
    </section>
    <CreateTeam networkId={networkId} />
  </div>
  <ModerationPolicyPanel networkId={networkId} /></div>
}
