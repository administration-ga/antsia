/**
 * MB-04 et PF-04 — signaler, bloquer, débloquer depuis l'application.
 *
 * Une brique, montée par chaque surface (fiche, commentaire, conversation,
 * message, menu d'une publication) : le menu « … » de protection, le
 * formulaire de signalement, les confirmations natives et la liste des
 * personnes bloquées des réglages. La logique (ordre des étapes, verrou,
 * garde de session, refus indistinct) est celle de `lib/native-safety.ts`,
 * testée à part ; ici, seulement l'écran et l'appel au moteur.
 *
 * Ce qui vaut partout :
 *  · garde `useNativeGuard` : rien ne part hors de la session, de l'avant-plan
 *    et du réseau courants ; un double appui n'envoie qu'une fois ;
 *  · signaler AVANT de bloquer, et « Signaler, puis bloquer » offert dès la
 *    confirmation du blocage ;
 *  · la conséquence du blocage est dite avant le geste ; le résultat se dit
 *    dans l'avis de session (`components/notice.tsx`), qui survit à la
 *    surface que le blocage fait disparaître ;
 *  · un seul bouton plein par zone (Transmettre) ; Bloquer en couleur de
 *    suppression, sans aplat ; cibles d'au moins 44 points, libellés
 *    d'accessibilité ;
 *  · ces gestes de protection restent offerts à un membre en attente (le
 *    moteur les admet dès `en_attente`) : ils ne dépendent pas de `canWrite`.
 */
import { NativeText as Text } from "../components/native-text"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Alert, Pressable, ScrollView, View } from "react-native"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api, type Id } from "@antsia/api/engine"
import { CONTENT_REPORT_NOTE_MAX, CONTENT_REPORT_REASONS } from "@antsia/social-domain/moderation"
import { useNativeAppearance } from "../appearance"
import { NativeIcon } from "../components/icon"
import { useNativeNotice } from "../components/notice"
import { PostSheet } from "../components/sheet"
import { Action, Card, Field, Label, QueryBoundary, Status, nativeScope, useNativeGuard } from "../components/ui"
import { nativeFeedText } from "../lib/feed-presentation"
import { mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import {
  nativeNamedText as named,
  nativeReportAcknowledgementKey,
  nativeReportAllowsNote,
  nativeReportSchema,
  nativeSafetyOutcome,
  nativeSafetySteps,
  runNativeSafetySteps,
  type NativeReportForm,
  type NativeReportKind,
  type NativeSafetyResult,
  type NativeSafetyStep,
  type NativeSafetyTranslate,
} from "../lib/native-safety"

type Translate = NativeSafetyTranslate
export type NativeSafetyPerson = { personId: Id<"persons">; name: string | null }

/** Une case à cocher ou un bouton radio : un repère, jamais un aplat (un seul bouton plein par zone). */
export function SafetyChoice({ label, checked, onPress, disabled = false, role }: { label: string; checked: boolean; onPress: () => void; disabled?: boolean; role: "radio" | "checkbox" }) {
  const { tokens } = useNativeAppearance()
  return <Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: tokens.radiusField, borderWidth: 1, borderColor: checked ? tokens.primary : tokens.border, backgroundColor: pressed ? tokens.muted : tokens.card, opacity: disabled ? 0.5 : 1 })}>
    <View style={{ width: 24, height: 24, borderRadius: role === "radio" ? 12 : 6, borderWidth: 2, borderColor: checked ? tokens.primary : tokens.mutedForeground, alignItems: "center", justifyContent: "center" }}>{checked ? <NativeIcon name="check" size={16} color={tokens.primaryInk} /> : null}</View>
    <Text style={{ flex: 1, color: tokens.foreground, fontSize: 15, lineHeight: 21 }}>{label}</Text>
  </Pressable>
}

/** Le déclencheur « … » d'un menu de protection, 44 points, nommé pour les lecteurs d'écran. */
function SafetyTrigger({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><NativeIcon name="more" size={22} /></Pressable>
}

/**
 * Le verrou, la garde et l'avis d'un geste. `pending` affiche l'attente ;
 * l'avis est émis même si la surface a disparu (le geste a eu lieu).
 */
export function useNativeSafetyRunner() {
  const guard = useNativeGuard(), { notify } = useNativeNotice(), { t } = useNativeAppearance()
  const lock = useRef(false), mounted = useRef(true)
  const [pending, setPending] = useState(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const { current, capture } = guard
  const run = useCallback(async (steps: readonly NativeSafetyStep[], perform: (step: NativeSafetyStep) => Promise<unknown>): Promise<NativeSafetyResult> => {
    const result = await runNativeSafetySteps({ steps, lock, guard: { current, capture }, perform, onStart: () => { if (mounted.current) setPending(true) } })
    if (mounted.current && result.status !== "busy") setPending(false)
    return result
  }, [current, capture])
  return { run, pending, guard, notify, t }
}

/** « Bloquer Awa » : le nom du geste, aussi nom accessible d'un bouton plus court. */
export function nativeSafetyBlockLabel(t: Translate, name: string | null): string {
  return named(t, "mobile.safety.block.action", name)
}

/** La confirmation native d'un blocage : conséquence, réversibilité, lieu du déblocage ; « Signaler, puis bloquer » quand c'est possible. */
export function confirmNativeBlock(t: Translate, name: string | null, onBlock: () => void, onReportFirst?: () => void) {
  Alert.alert(named(t, "mobile.safety.block.title", name), [t("mobile.safety.block.consequence"), t("mobile.safety.block.reversibility"), t("mobile.safety.block.listHint")].join("\n\n"), [
    { text: t("mobile.safety.cancel"), style: "cancel" },
    ...(onReportFirst ? [{ text: t("mobile.safety.block.reportFirst"), onPress: onReportFirst }] : []),
    { text: t("mobile.safety.block.confirm"), style: "destructive" as const, onPress: onBlock },
  ])
}

export function confirmNativeUnblock(t: Translate, name: string | null, onUnblock: () => void) {
  Alert.alert(named(t, "mobile.safety.unblock.title", name), t("mobile.safety.unblock.body"), [
    { text: t("mobile.safety.cancel"), style: "cancel" },
    { text: t("mobile.safety.unblock.action"), onPress: onUnblock },
  ])
}

/**
 * Le formulaire de signalement : motif du domaine, précision bornée quand le
 * chemin du moteur la transporte, et « Bloquer aussi » quand une personne est
 * en cause — la conséquence du blocage se lit avant l'envoi.
 */
export function NativeReportFormView({ kind, blockName, initialAlsoBlock = false, pending, onSubmit }: { kind: NativeReportKind; blockName?: string | null; initialAlsoBlock?: boolean; pending: boolean; onSubmit: (form: NativeReportForm) => void }) {
  const { t } = useNativeAppearance(), guard = useNativeGuard()
  const [schema] = useState(() => nativeReportSchema(t("mobile.safety.report.noteTooLong")))
  const form = useForm<NativeReportForm>({ resolver: zodResolver(schema), defaultValues: { reason: "other", note: "", alsoBlock: initialAlsoBlock && blockName !== undefined } })
  const canBlock = blockName !== undefined
  return <View style={{ gap: 12 }}>
    <Label muted>{t("mobile.safety.report.description")}</Label>
    <Label strong>{t("mobile.safety.report.reasonLabel")}</Label>
    <Controller control={form.control} name="reason" render={({ field }) => <View accessibilityRole="radiogroup" style={{ gap: 8 }}>{CONTENT_REPORT_REASONS.map(value => <SafetyChoice key={value} role="radio" label={nativeFeedText(t, `reason.${value}`)} checked={field.value === value} disabled={pending} onPress={() => field.onChange(value)} />)}</View>} />
    {nativeReportAllowsNote(kind) ? <Controller control={form.control} name="note" render={({ field }) => <Field label={t("mobile.safety.report.note")} value={field.value} onChangeText={field.onChange} maxLength={CONTENT_REPORT_NOTE_MAX} multiline disabled={pending} error={form.formState.errors.note?.message} />} /> : null}
    {canBlock ? <Controller control={form.control} name="alsoBlock" render={({ field }) => <View style={{ gap: 8 }}>
      <SafetyChoice role="checkbox" label={named(t, "mobile.safety.report.alsoBlock", blockName)} checked={field.value} disabled={pending} onPress={() => field.onChange(!field.value)} />
      {field.value ? <><Label muted>{t("mobile.safety.block.consequence")}</Label><Label muted>{t("mobile.safety.block.reversibility")}</Label></> : null}
    </View>} /> : null}
    <Label muted>{t("mobile.safety.report.followUp")}</Label>
    <Action label={t("mobile.safety.report.send")} tone="primary" pending={pending} disabled={!guard.canAct} onPress={() => { void form.handleSubmit(onSubmit)() }} />
  </View>
}

export type NativeSafetyMenuProps = {
  /** Le nom accessible du déclencheur « … ». */
  label: string
  /** La cible signalée et son chemin dans le moteur ; absente, le menu ne propose pas de signaler. */
  report?: { kind: NativeReportKind; actionLabel: string; send: (form: NativeReportForm) => Promise<unknown> }
  /** La personne en cause ; absente (une page, soi-même), le menu ne propose pas de bloquer. */
  person?: NativeSafetyPerson
  /** Après un blocage admis (la surface quitte souvent l'écran). */
  onBlocked?: (person: NativeSafetyPerson) => void
}

/** Le menu « … » de protection : Signaler, Bloquer, dans une feuille native. */
export function NativeSafetyMenu({ label, report, person, onBlocked }: NativeSafetyMenuProps) {
  const { tokens } = useNativeAppearance(), { run, pending, guard, notify, t } = useNativeSafetyRunner()
  const block = useMutation(api.modules.graph.connections.blockPerson)
  const [open, setOpen] = useState(false), [reporting, setReporting] = useState<{ alsoBlock: boolean } | null>(null), [sheetError, setSheetError] = useState("")
  const { registerCleanup } = guard.runtime
  useEffect(() => registerCleanup(() => { setOpen(false); setReporting(null); setSheetError("") }), [registerCleanup])
  const networkId = guard.runtime.networkId
  const execute = async (steps: readonly NativeSafetyStep[], form?: NativeReportForm) => {
    let reportAck: string | undefined
    const result = await run(steps, async step => {
      if (step === "report" && report && form) reportAck = nativeReportAcknowledgementKey(await report.send(form))
      else if (step === "block" && person) await block({ networkId, targetPersonId: person.personId })
      else throw new Error("nativeSafetyStepUnavailable")
    })
    const outcome = nativeSafetyOutcome(t, result, { name: person?.name ?? null, reportAck })
    if (outcome) notify(outcome.text, outcome.error)
    // Refusée sans rien d'acquis, la feuille reste ouverte pour réessayer, et dit pourquoi (l'avis est derrière elle).
    if (result.status === "failed" && result.completed.length === 0) setSheetError(outcome?.text ?? "")
    if (result.status === "done" || result.status === "failed" && result.completed.length > 0) { setOpen(false); setReporting(null); setSheetError("") }
    if (person && (result.status === "done" || result.status === "stale") && result.completed.includes("block")) onBlocked?.(person)
  }
  if (!guard.canRead || (!report && !person)) return null
  return <>
    <SafetyTrigger label={label} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setReporting(null); setSheetError(""); setOpen(true) } }} />
    <PostSheet title={reporting ? t(`mobile.safety.report.title.${report?.kind ?? "person"}`) : t("mobile.safety.sheetTitle")} open={open} onClose={() => { if (!pending) { setOpen(false); setReporting(null) } }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }}>
        {reporting && report ? <NativeReportFormView kind={report.kind} {...(person ? { blockName: person.name } : {})} initialAlsoBlock={reporting.alsoBlock} pending={pending} onSubmit={form => { void execute(nativeSafetySteps({ report: true, block: form.alsoBlock && person !== undefined }), form) }} /> : <>
          {report ? <Action label={report.actionLabel} disabled={pending || !guard.canAct} onPress={() => { setSheetError(""); setReporting({ alsoBlock: false }) }} /> : null}
          {person ? <Action label={nativeSafetyBlockLabel(t, person.name)} tone="danger" pending={pending} disabled={!guard.canAct} onPress={() => confirmNativeBlock(t, person.name, () => { void execute(["block"]) }, report ? () => { setSheetError(""); setReporting({ alsoBlock: true }) } : undefined)} /> : null}
          {person ? <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 19 }}>{t("mobile.safety.block.listHint")}</Text> : null}
        </>}
        <Status error label={sheetError} />
      </ScrollView>
    </PostSheet>
  </>
}

/** « Débloquer », confirmé : sur une fiche refusée, dans une conversation fermée, dans la liste des réglages. */
export function NativeUnblockAction({ person, accessibilityLabel, onUnblocked }: { person: NativeSafetyPerson; accessibilityLabel?: string; onUnblocked?: () => void }) {
  const { run, pending, guard, notify, t } = useNativeSafetyRunner()
  const unblock = useMutation(api.modules.graph.connections.unblockPerson)
  const networkId = guard.runtime.networkId
  const execute = async () => {
    const result = await run(["unblock"], async () => { await unblock({ networkId, targetPersonId: person.personId }) })
    const outcome = nativeSafetyOutcome(t, result, { name: person.name })
    if (outcome) notify(outcome.text, outcome.error)
    if (result.status === "done") onUnblocked?.()
  }
  return <Action label={t("mobile.safety.unblock.action")} {...(accessibilityLabel ? { accessibilityLabel } : {})} pending={pending} disabled={!guard.canAct} onPress={() => confirmNativeUnblock(t, person.name, () => { void execute() })} />
}

// ── Liste des personnes bloquées (réglages) ─────────────────────────────

type BlockPage = FunctionReturnType<typeof api.modules.graph.blocks.paginateMine>
type BlockSource = "intents" | "legacy"
const BLOCK_SOURCES = ["intents", "legacy"] as const satisfies readonly BlockSource[]
const BLOCKS_PAGE_SIZE = 20, BLOCKS_MAX_PAGES = 10

function BlockWindow({ source, cursor, onPage }: { source: BlockSource; cursor: string | null; onPage: (source: BlockSource, key: string, page: BlockPage | undefined) => void }) {
  const guard = useNativeGuard()
  const page = useQuery(api.modules.graph.blocks.paginateMine, guard.canRead ? { networkId: guard.runtime.networkId, source, paginationOpts: { numItems: BLOCKS_PAGE_SIZE, cursor } } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (guard.canRead) onPage(source, key, page) }, [guard.canRead, source, key, page, onPage])
  return null
}

function BlockedPeopleBody() {
  const guard = useNativeGuard(), { t, locale, tokens } = useNativeAppearance()
  const [cursors, setCursors] = useState<Record<BlockSource, (string | null)[]>>({ intents: [null], legacy: [null] })
  const [pages, setPages] = useState<Record<BlockSource, Record<string, BlockPage | undefined>>>({ intents: {}, legacy: {} })
  const onPage = useCallback((source: BlockSource, key: string, page: BlockPage | undefined) => setPages(previous => previous[source][key] === page ? previous : { ...previous, [source]: { ...previous[source], [key]: page } }), [])
  // Deux sources (intentions et marqueurs hérités), fusionnées par personne, sans identité projetée.
  const rows = mergeNativePages(BLOCK_SOURCES.flatMap(source => cursors[source].map(cursor => pages[source][nativeCursorKey(cursor)]?.page ?? [])), row => String(row.targetPersonId), BLOCK_SOURCES.length * BLOCKS_MAX_PAGES * BLOCKS_PAGE_SIZE)
  const tails = BLOCK_SOURCES.map(source => ({ source, tail: pages[source][nativeCursorKey(cursors[source][cursors[source].length - 1] ?? null)] }))
  const loading = tails.some(({ tail }) => tail === undefined)
  const canMore = tails.some(({ source, tail }) => tail && !tail.isDone && cursors[source].length < BLOCKS_MAX_PAGES)
  const truncated = tails.some(({ source, tail }) => tail && !tail.isDone && cursors[source].length >= BLOCKS_MAX_PAGES)
  const format = (at: number) => new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium" }).format(at)
  return <View style={{ gap: 12 }}>
    {BLOCK_SOURCES.flatMap(source => cursors[source].map(cursor => <BlockWindow key={`${source}:${nativeCursorKey(cursor)}`} source={source} cursor={cursor} onPage={onPage} />))}
    <Status busy={loading} label={loading && rows.length === 0 ? t("mobile.common.loading") : !loading && rows.length === 0 && !canMore ? t("mobile.safety.blocked.empty") : ""} />
    {rows.map(row => {
      const date = format(row.at)
      return <View key={String(row.targetPersonId)} style={{ gap: 8, padding: 12, borderRadius: tokens.radiusField, borderWidth: 1, borderColor: tokens.border }}>
        <Label>{t("mobile.safety.blocked.neutral")}</Label>
        <Label muted>{t("mobile.safety.blocked.at", { date })}</Label>
        <NativeUnblockAction person={{ personId: row.targetPersonId, name: null }} accessibilityLabel={t("mobile.safety.blocked.unblockLabel", { date })} />
      </View>
    })}
    {canMore ? <Action label={t("mobile.safety.blocked.more")} pending={loading} disabled={!guard.canAct} onPress={() => {
      if (!guard.current()) return
      setCursors(previous => {
        const next = { ...previous }
        for (const { source, tail } of tails) if (tail && !tail.isDone && previous[source].length < BLOCKS_MAX_PAGES) next[source] = [...previous[source], tail.continueCursor]
        return next
      })
    }} /> : null}
    {truncated ? <Label muted>{t("mobile.safety.blocked.atLeast", { count: rows.length })}</Label> : null}
  </View>
}

/** La carte des réglages : portée du blocage, lignes neutres, Débloquer confirmé. */
export function BlockedPeopleCard() {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = `${nativeScope(guard.runtime)}:blocked:${version}`
  if (!guard.canRead) return null
  return <Card>
    <Label strong accessibilityRole="header">{t("mobile.safety.blocked.title")}</Label>
    <Label muted>{t("mobile.safety.blocked.scope")}</Label>
    <QueryBoundary key={key} resetKey={key} fallback={<View style={{ gap: 8 }}><Status error label={t("mobile.safety.blocked.unavailable")} /><Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setVersion(value => value + 1) }} /></View>}><BlockedPeopleBody /></QueryBoundary>
  </Card>
}

/** Un bloc de réglage nommé : titre, phrase, actions. */
export function SafetySettingsCard({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return <Card><Label strong accessibilityRole="header">{title}</Label><Label muted>{lead}</Label><View style={{ gap: 8 }}>{children}</View></Card>
}
