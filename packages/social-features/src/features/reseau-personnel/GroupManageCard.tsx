"use client"

/**
 * « Gérer le groupe » (PG-02) — les gestes du PROPRIÉTAIRE d'un groupe
 * thématique, ouverts depuis la fiche du groupe (`GroupsPanel`) : poser ses
 * règles, transmettre sa propriété à un modérateur, fermer, archiver,
 * supprimer.
 *
 * Ce composant ne décide rien : quels gestes selon l'état du groupe, la
 * confirmation de la suppression, les textes de refus viennent de
 * `groupes-thematiques.ts` (module pur, testé). La garde reste au serveur :
 * chaque geste est re-jugé (propriétaire vivant d'un groupe qui n'est pas
 * celui d'une page). Un geste définitif se confirme toujours : deux temps pour
 * transmettre, fermer, archiver ; le nom du groupe à saisir pour supprimer.
 *
 * Un seul bouton plein par zone ; jetons de couleur seulement ; textes par
 * l'i18n (espace `reseau`, clés `groupsPanel.manage.*`).
 */

import { zodResolver } from "@hookform/resolvers/zod"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Button, Card, Radio, SkeletonCard, TextArea, TextInput } from "@antsia/ui"
import { EspaceEmptyState } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { type ReactNode, useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { RESEAU_CARD_STYLE, RESEAU_FIELD_STYLE, RESEAU_PRIMARY_ACTION_STYLE, RESEAU_SECONDARY_ACTION_STYLE } from "../../shell/design-styles"
import { etatDeQuery, montreSquelette } from "../../shell/query-state"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { themedActionStyle } from "../themed-action-style"
import {
  GROUP_RULES_MAX_LENGTH,
  GROUPS_ERROR_TEXT_KEYS,
  deleteConfirmationMatches,
  groupActionErrorText,
  groupManageActions,
  groupPersonName,
  type GroupState,
} from "./groupes-thematiques"

type GroupId = Id<"thematicGroups">

/** Les modérateurs proposés au transfert, au plus — la borne du serveur (`listTransferCandidates`). */
const TRANSFER_CANDIDATES_MAX = 50

const SECTION_STYLE = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  paddingTop: 14,
  borderTop: "1px solid var(--ink-100)",
} as const

const TITLE_STYLE = {
  margin: 0,
  color: "var(--ink-900)",
  fontSize: "var(--esp-subsection-title-size, 14.5px)",
  lineHeight: "var(--esp-subsection-title-leading, inherit)",
  fontWeight: 700,
} as const

const MUTED_STYLE = {
  margin: 0,
  color: "var(--ink-600)",
  fontSize: "var(--esp-content-font-size, 13px)",
  lineHeight: "var(--esp-content-line-height, 1.55)",
} as const

const ACTIONS_STYLE = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } as const

export type ManagedGroup = {
  groupId: GroupId
  name: string
  state: GroupState
  rules: string | null
  rulesVersion: number | null
  rulesUpdatedAt: number | null
}

export function GroupManageCard({ group, onDeleted }: { group: ManagedGroup; onDeleted: () => void }) {
  const { t } = useTranslation("reseau")
  const actions = groupManageActions(group.state)
  return (
    <Card style={RESEAU_CARD_STYLE}>
      <section aria-labelledby={`gerer-${group.groupId}`} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h3 id={`gerer-${group.groupId}`} style={{ ...TITLE_STYLE, fontSize: "var(--esp-section-title-size, 15.5px)" }}>
            {t("groupsPanel.manage.title")}
          </h3>
          <p style={MUTED_STYLE}>{t("groupsPanel.manage.lead")}</p>
          {!actions.rules ? <p style={MUTED_STYLE}>{t("groupsPanel.manage.frozen")}</p> : null}
        </div>
        {/* La version lue sert de clé : un changement d'ailleurs remonte le formulaire, jamais un texte périmé. */}
        {actions.rules ? <RulesSection key={group.rulesVersion ?? "aucune"} group={group} /> : null}
        {actions.transfer ? <TransferSection group={group} /> : null}
        {actions.close ? (
          <ConfirmedStep
            title={t("groupsPanel.manage.close.title")}
            hint={t("groupsPanel.manage.close.hint")}
            askLabel={t("groupsPanel.manage.close.ask")}
            confirmStatus={t("groupsPanel.manage.close.confirmStatus")}
            confirmLabel={t("groupsPanel.manage.close.confirm")}
            reference={api.modules.thematicGroups.thematicGroups.closeGroup}
            groupId={group.groupId}
            successKey="groupsPanel.toast.closed"
            failureKey="reseau:groupsPanel.toast.closeFailed"
          />
        ) : null}
        {actions.archive ? (
          <ConfirmedStep
            title={t("groupsPanel.manage.archive.title")}
            hint={t("groupsPanel.manage.archive.hint")}
            askLabel={t("groupsPanel.manage.archive.ask")}
            confirmStatus={t("groupsPanel.manage.archive.confirmStatus")}
            confirmLabel={t("groupsPanel.manage.archive.confirm")}
            reference={api.modules.thematicGroups.thematicGroups.archiveGroup}
            groupId={group.groupId}
            successKey="groupsPanel.toast.archived"
            failureKey="reseau:groupsPanel.toast.archiveFailed"
          />
        ) : null}
        {actions.delete ? <DeleteSection group={group} onDeleted={onDeleted} /> : null}
      </section>
    </Card>
  )
}

function SectionShell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div style={SECTION_STYLE}>
      <h4 style={TITLE_STYLE}>{title}</h4>
      <p style={MUTED_STYLE}>{hint}</p>
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Règles — le texte du propriétaire, versionné
// ═══════════════════════════════════════════════════════════════

function RulesSection({ group }: { group: ManagedGroup }) {
  const { t, i18n } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const setRules = useMutation(api.modules.thematicGroups.thematicGroups.setGroupRules)
  const [busy, setBusy] = useState(false)
  const schema = useMemo(
    () => z.object({ rules: z.string().max(GROUP_RULES_MAX_LENGTH, t("rules:GROUP_RULES_TOO_LONG", { max: GROUP_RULES_MAX_LENGTH })) }).strict(),
    [t],
  )
  const form = useForm<{ rules: string }>({ resolver: zodResolver(schema), defaultValues: { rules: group.rules ?? "" }, mode: "onChange" })
  const typed = useWatch({ control: form.control, name: "rules" }) ?? ""
  const fieldId = `regles-${group.groupId}`
  const countId = `${fieldId}-compte`

  const save = async (next: string | undefined) => {
    if (busy) return
    setBusy(true)
    try {
      const result = await setRules({ networkId, groupId: group.groupId, ...(next === undefined ? {} : { rules: next }) })
      if (!result.changed) toast.success(t("groupsPanel.toast.rulesUnchanged"))
      else if (result.rulesVersion === null) toast.success(t("groupsPanel.toast.rulesRemoved"))
      else toast.success(t("groupsPanel.toast.rulesSaved", { version: result.rulesVersion }))
    } catch (error) {
      toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.rulesFailed", t))
    } finally {
      setBusy(false)
    }
  }

  const current =
    group.rulesVersion !== null && group.rulesUpdatedAt !== null
      ? t("groupsPanel.manage.rules.current", {
          version: group.rulesVersion,
          date: new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }).format(group.rulesUpdatedAt),
        })
      : t("groupsPanel.manage.rules.none")

  return (
    <SectionShell title={t("groupsPanel.manage.rules.title")} hint={t("groupsPanel.manage.rules.hint")}>
      <p style={{ ...MUTED_STYLE, color: "var(--ink-800)" }}>{current}</p>
      <form
        aria-label={t("groupsPanel.manage.rules.title")}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
        onSubmit={form.handleSubmit(async (values) => {
          const trimmed = values.rules.trim()
          await save(trimmed.length > 0 ? trimmed : undefined)
        })}
      >
        <label htmlFor={fieldId} style={{ ...MUTED_STYLE, color: "var(--ink-800)", fontWeight: 600 }}>
          {t("groupsPanel.manage.rules.label")}
        </label>
        <TextArea
          {...form.register("rules")}
          id={fieldId}
          rows={6}
          value={typed}
          onChange={(event) => form.setValue("rules", event.target.value, { shouldValidate: true })}
          maxLength={GROUP_RULES_MAX_LENGTH}
          placeholder={t("groupsPanel.manage.rules.placeholder")}
          aria-describedby={countId}
          aria-invalid={form.formState.errors.rules ? true : undefined}
          style={{ ...RESEAU_FIELD_STYLE, minHeight: 140 }}
        />
        <p id={countId} style={{ ...MUTED_STYLE, fontSize: 12.5 }}>
          {t("groupsPanel.manage.rules.count", { count: typed.length, max: GROUP_RULES_MAX_LENGTH })}
        </p>
        {form.formState.errors.rules ? (
          <p role="alert" style={{ ...MUTED_STYLE, color: "var(--danger-600)" }}>
            {form.formState.errors.rules.message}
          </p>
        ) : null}
        <div style={ACTIONS_STYLE}>
          <Button type="submit" disabled={busy} style={RESEAU_PRIMARY_ACTION_STYLE}>
            {busy ? t("groupsPanel.manage.rules.saving") : t("groupsPanel.manage.rules.save")}
          </Button>
          {group.rulesVersion !== null ? (
            <Button type="button" size="sm" variant="danger" disabled={busy} style={themedActionStyle("danger", "ghost")} onClick={() => void save(undefined)}>
              {t("groupsPanel.manage.rules.remove")}
            </Button>
          ) : null}
        </div>
      </form>
    </SectionShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Transmettre la propriété — vers un modérateur éligible, confirmé
// ═══════════════════════════════════════════════════════════════

function TransferSection({ group }: { group: ManagedGroup }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const candidates = useAuthenticatedConvexQuery(api.modules.thematicGroups.thematicGroups.listTransferCandidates, { networkId, groupId: group.groupId })
  const transfer = useMutation(api.modules.thematicGroups.thematicGroups.transferGroupOwnership)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const schema = useMemo(() => z.object({ newOwnerPersonId: z.string().min(1) }).strict(), [])
  const form = useForm<{ newOwnerPersonId: string }>({ resolver: zodResolver(schema), defaultValues: { newOwnerPersonId: "" } })
  const selected = useWatch({ control: form.control, name: "newOwnerPersonId" }) ?? ""

  const items = candidates.data?.items ?? []
  const etat = etatDeQuery(candidates, items.length)
  const target = items.find((item) => item.personId === confirming) ?? null

  const confirm = async () => {
    if (busy || target === null) return
    setBusy(true)
    try {
      await transfer({ networkId, groupId: group.groupId, newOwnerPersonId: target.personId })
      toast.success(t("groupsPanel.toast.transferred"))
      setConfirming(null)
    } catch (error) {
      toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.transferFailed", t))
    } finally {
      setBusy(false)
    }
  }

  let body: ReactNode
  if (candidates.isError && candidates.data === undefined) {
    // Une panne n'est pas « aucun modérateur » (R-08).
    body = <ReseauQueryError title={t(GROUPS_ERROR_TEXT_KEYS.transfer.title)} message={t(GROUPS_ERROR_TEXT_KEYS.transfer.message)} onRetry={() => void candidates.refetch()} />
  } else if (montreSquelette(etat)) {
    body = <SkeletonCard />
  } else if (candidates.data === undefined) {
    body = null
  } else if (items.length === 0) {
    body = <EspaceEmptyState compact text={t("groupsPanel.manage.transfer.empty")} />
  } else if (target !== null) {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span role="status" aria-live="polite" className="sr-only">
          {t("groupsPanel.manage.transfer.confirmStatus")}
        </span>
        <p style={{ ...MUTED_STYLE, color: "var(--ink-800)" }}>
          {t("groupsPanel.manage.transfer.confirmText", { group: group.name, name: groupPersonName(target.displayName, t) })}
        </p>
        <div style={ACTIONS_STYLE}>
          <Button size="sm" disabled={busy} autoFocus style={RESEAU_PRIMARY_ACTION_STYLE} onClick={() => void confirm()}>
            {t("groupsPanel.manage.transfer.confirm")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
            {t("groupsPanel.manage.back")}
          </Button>
        </div>
      </div>
    )
  } else {
    body = (
      <form
        aria-label={t("groupsPanel.manage.transfer.title")}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
        onSubmit={form.handleSubmit((values) => setConfirming(values.newOwnerPersonId))}
      >
        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <legend style={{ ...MUTED_STYLE, color: "var(--ink-800)", fontWeight: 600, marginBottom: 6 }}>{t("groupsPanel.manage.transfer.legend")}</legend>
          {items.map((item) => (
            <Radio
              key={item.personId}
              name={`proprietaire-${group.groupId}`}
              value={item.personId}
              checked={selected === item.personId}
              onChange={(next) => {
                if (next) form.setValue("newOwnerPersonId", item.personId, { shouldValidate: true })
              }}
              label={groupPersonName(item.displayName, t)}
              hint={item.handle ? `@${item.handle}` : undefined}
            />
          ))}
        </fieldset>
        {candidates.data.truncated ? <p style={{ ...MUTED_STYLE, fontSize: 12.5 }}>{t("groupsPanel.manage.transfer.truncated", { max: TRANSFER_CANDIDATES_MAX })}</p> : null}
        <div style={ACTIONS_STYLE}>
          <Button type="submit" size="sm" variant="secondary" disabled={selected.length === 0} style={RESEAU_SECONDARY_ACTION_STYLE}>
            {t("groupsPanel.manage.transfer.submit")}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <SectionShell title={t("groupsPanel.manage.transfer.title")} hint={t("groupsPanel.manage.transfer.hint")}>
      {candidates.isError && candidates.data !== undefined ? (
        <ReseauQueryError title={t(GROUPS_ERROR_TEXT_KEYS.transfer.title)} message={t(GROUPS_ERROR_TEXT_KEYS.transfer.message)} onRetry={() => void candidates.refetch()} />
      ) : null}
      {body}
    </SectionShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Fermer, archiver — définitifs, en deux temps
// ═══════════════════════════════════════════════════════════════

type LifecycleReference =
  | typeof api.modules.thematicGroups.thematicGroups.closeGroup
  | typeof api.modules.thematicGroups.thematicGroups.archiveGroup

function ConfirmedStep({
  title,
  hint,
  askLabel,
  confirmStatus,
  confirmLabel,
  reference,
  groupId,
  successKey,
  failureKey,
}: {
  title: string
  hint: string
  askLabel: string
  confirmStatus: string
  confirmLabel: string
  reference: LifecycleReference
  groupId: GroupId
  successKey: string
  failureKey: string
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const run = useMutation(reference)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await run({ networkId, groupId })
      toast.success(t(successKey))
      setConfirming(false)
    } catch (error) {
      toast.error(groupActionErrorText(error, failureKey, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionShell title={title} hint={hint}>
      <div style={ACTIONS_STYLE}>
        {confirming ? (
          <>
            {/* La confirmation est annoncée, et le bouton définitif prend le focus. */}
            <span role="status" aria-live="polite" className="sr-only">
              {confirmStatus}
            </span>
            <Button size="sm" variant="danger" disabled={busy} autoFocus onClick={() => void confirm()}>
              {confirmLabel}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              {t("groupsPanel.manage.back")}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" style={RESEAU_SECONDARY_ACTION_STYLE} onClick={() => setConfirming(true)}>
            {askLabel}
          </Button>
        )}
      </div>
    </SectionShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Supprimer — le nom du groupe à saisir
// ═══════════════════════════════════════════════════════════════

function DeleteSection({ group, onDeleted }: { group: ManagedGroup; onDeleted: () => void }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const remove = useMutation(api.modules.thematicGroups.thematicGroups.deleteGroup)
  const [busy, setBusy] = useState(false)
  const schema = useMemo(
    () => z.object({ confirmation: z.string().refine((value) => deleteConfirmationMatches(value, group.name), t("groupsPanel.manage.delete.mismatch")) }).strict(),
    [group.name, t],
  )
  const form = useForm<{ confirmation: string }>({ resolver: zodResolver(schema), defaultValues: { confirmation: "" }, mode: "onChange" })
  const typed = useWatch({ control: form.control, name: "confirmation" }) ?? ""
  const matches = deleteConfirmationMatches(typed, group.name)
  const fieldId = `supprimer-${group.groupId}`

  return (
    <SectionShell title={t("groupsPanel.manage.delete.title")} hint={t("groupsPanel.manage.delete.hint")}>
      <form
        aria-label={t("groupsPanel.manage.delete.title")}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
        onSubmit={form.handleSubmit(async () => {
          if (busy) return
          setBusy(true)
          try {
            const result = await remove({ networkId, groupId: group.groupId })
            toast.success(t(result.pending ? "groupsPanel.toast.deletePending" : "groupsPanel.toast.deleted"))
            onDeleted()
          } catch (error) {
            toast.error(groupActionErrorText(error, "reseau:groupsPanel.toast.deleteFailed", t))
          } finally {
            setBusy(false)
          }
        })}
      >
        <label htmlFor={fieldId} style={{ ...MUTED_STYLE, color: "var(--ink-800)", fontWeight: 600 }}>
          {t("groupsPanel.manage.delete.label", { name: group.name })}
        </label>
        <TextInput
          {...form.register("confirmation")}
          id={fieldId}
          value={typed}
          onChange={(event) => form.setValue("confirmation", event.target.value, { shouldValidate: true })}
          autoComplete="off"
          spellCheck={false}
          style={{ ...RESEAU_FIELD_STYLE }}
        />
        {typed.trim().length > 0 && !matches ? (
          <p role="alert" style={{ ...MUTED_STYLE, color: "var(--danger-600)" }}>
            {t("groupsPanel.manage.delete.mismatch")}
          </p>
        ) : null}
        <div style={ACTIONS_STYLE}>
          <Button type="submit" size="sm" variant="danger" disabled={busy || !matches}>
            {busy ? t("groupsPanel.manage.delete.submitting") : t("groupsPanel.manage.delete.submit")}
          </Button>
        </div>
      </form>
    </SectionShell>
  )
}
