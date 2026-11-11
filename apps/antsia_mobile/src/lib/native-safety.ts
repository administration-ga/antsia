/**
 * MB-04 et PF-04 — les gestes de protection de l'application : signaler,
 * bloquer, débloquer, supprimer son compte. Module PUR, testé en `node` :
 * aucune phrase (des clés `mobile.safety.*`), aucun accès au moteur (les
 * écrans passent la mutation à exécuter).
 *
 * Les gestes sont ceux du moteur, et eux seuls :
 *  · signaler une publication ou un commentaire : `moderation.moderation.reportPost`
 *    / `reportComment` (motif, précision facultative) ;
 *  · signaler une personne ou un message iCom : `moderation.cases.report`
 *    (cible `person` ou `personalMessage`, motif seul) ;
 *  · bloquer, débloquer : `graph.connections.blockPerson` / `unblockPerson` ;
 *  · supprimer son compte : `people.erasure.requestErasure`, puis la porte de
 *    sortie existante (`controller.exit()`, purge du coffre).
 * Le moteur rejuge tout (audience réelle, auto-signalement, doublon, blocage)
 * et rend un refus indistinct ; l'écran le dit sans le distinguer.
 *
 * ⚠️ SIGNALER AVANT DE BLOQUER : un blocage rend la cible non signalable
 * (`moderation/targets.ts`, cible `person` : refus si un blocage existe ; et
 * un contenu de la personne bloquée quitte la vue). Quand la personne veut
 * les deux, le signalement part d'abord — `nativeSafetySteps` l'impose.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { CONTENT_REPORT_NOTE_MAX, CONTENT_REPORT_REASONS, type ContentReportReason } from "@antsia/social-domain/moderation"
import { z } from "zod"

/** `unblock` ne se compose jamais avec les autres : il part seul, depuis sa propre confirmation. */
export type NativeSafetyStep = "report" | "block" | "unblock"

/** Les étapes d'un geste, dans l'ordre que le moteur exige : le signalement d'abord, le blocage ensuite. */
export function nativeSafetySteps(choice: { report: boolean; block: boolean }): NativeSafetyStep[] {
  return [...(choice.report ? ["report" as const] : []), ...(choice.block ? ["block" as const] : [])]
}

export type NativeSafetyGuard = {
  /** La session, l'avant-plan et le réseau sont-ils toujours ceux de l'écran ? */
  current: () => boolean
  /** Capture l'état courant ; la fonction rendue dit s'il tient toujours. */
  capture: () => () => boolean
}

export type NativeSafetyResult =
  /** Toutes les étapes ont été admises par le moteur. */
  | { status: "done"; completed: NativeSafetyStep[] }
  /** Une étape a été refusée : `completed` dit ce qui est déjà acquis (le signalement, souvent). */
  | { status: "failed"; step: NativeSafetyStep; completed: NativeSafetyStep[]; errorKey: string }
  /** La session, l'avant-plan ou le réseau ont changé : rien de plus n'est envoyé ni annoncé. */
  | { status: "stale"; completed: NativeSafetyStep[] }
  /** Un geste est déjà en cours (double appui) : rien n'est envoyé. */
  | { status: "busy" }

/**
 * Exécute les étapes d'un geste, une seule fois à la fois (`lock`), sous la
 * garde de la session : rien ne part si l'écran n'est plus courant, et la
 * suite s'arrête si la garde change entre deux étapes. `onStart` est appelé
 * une fois le verrou pris (pour afficher l'attente).
 */
export async function runNativeSafetySteps(input: {
  steps: readonly NativeSafetyStep[]
  lock: { current: boolean }
  guard: NativeSafetyGuard
  perform: (step: NativeSafetyStep) => Promise<unknown>
  onStart?: () => void
}): Promise<NativeSafetyResult> {
  if (input.lock.current) return { status: "busy" }
  if (input.steps.length === 0 || !input.guard.current()) return { status: "stale", completed: [] }
  input.lock.current = true
  const live = input.guard.capture()
  const completed: NativeSafetyStep[] = []
  try {
    input.onStart?.()
    for (const step of input.steps) {
      if (!live()) return { status: "stale", completed }
      try { await input.perform(step) }
      catch (error) { return live() ? { status: "failed", step, completed, errorKey: nativeSafetyErrorKey(error) } : { status: "stale", completed } }
      completed.push(step)
    }
    return live() ? { status: "done", completed } : { status: "stale", completed }
  } finally {
    input.lock.current = false
  }
}

/**
 * La phrase d'un refus, sans oracle : un débit dépassé se dit (il ne révèle
 * rien), une panne de transport aussi ; tout refus du moteur — absent, privé,
 * bloqué, déjà retiré, soi-même — rend la MÊME phrase.
 */
export function nativeSafetyErrorKey(error: unknown): string {
  const code = engineErrorCode(error)
  if (code === "rateLimited") return "mobile.safety.errors.rateLimited"
  if (code === null) return "mobile.safety.errors.unavailable"
  return "mobile.safety.errors.refused"
}

/** L'accusé d'un signalement admis : un dossier neuf, ou le rejeu d'un dossier existant. */
export function nativeReportAcknowledgementKey(result: unknown): string {
  return typeof result === "object" && result !== null && "created" in result && result.created === false ? "mobile.safety.report.already" : "mobile.safety.report.sent"
}

/** Les cibles que l'application signale, et leur chemin dans le moteur. */
export type NativeReportKind = "post" | "comment" | "person" | "personalMessage"

/** Le chemin polymorphe (`cases.report`) ne transporte que le motif : aucune précision saisie puis ignorée. */
export function nativeReportAllowsNote(kind: NativeReportKind): boolean {
  return kind === "post" || kind === "comment"
}

export type NativeReportForm = { reason: ContentReportReason; note: string; alsoBlock: boolean }

/** Le formulaire de signalement : un motif du domaine, une précision bornée (si la cible la transporte), le blocage en option. */
export function nativeReportSchema(noteError: string) {
  return z.object({
    reason: z.enum(CONTENT_REPORT_REASONS),
    note: z.string().max(CONTENT_REPORT_NOTE_MAX, noteError),
    alsoBlock: z.boolean(),
  })
}

/** La précision transmise : vide, ou retirée pour une cible qui ne la transporte pas, elle n'est pas envoyée. */
export function nativeReportNote(kind: NativeReportKind, note: string): { note: string } | Record<string, never> {
  const trimmed = note.trim()
  return nativeReportAllowsNote(kind) && trimmed.length > 0 ? { note: trimmed } : {}
}

/** Un nom affiché vide vaut absence : jamais « Bloquer  ? ». */
export function nativeSafetyName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}

/** Les clés d'un geste nommé : la variante « sans nom » quand la personne n'en a pas. */
export function nativeNamedKey(base: string, name: string | null | undefined): { key: string; values: Record<string, string> } {
  const named = nativeSafetyName(name)
  return named === null ? { key: `${base}Unnamed`, values: {} } : { key: base, values: { name: named } }
}

export type NativeSafetyTranslate = (key: string, params?: Record<string, string | number>) => string

/** La phrase d'un geste nommé, ou sa variante « sans nom ». */
export function nativeNamedText(t: NativeSafetyTranslate, base: string, name: string | null | undefined): string {
  const { key, values } = nativeNamedKey(base, name)
  return t(key, values)
}

/**
 * Ce que l'écran dit d'un résultat : l'accusé du signalement, le blocage ou le
 * déblocage ; l'étape refusée avec ce qui était déjà acquis (« Signalement
 * transmis, mais le blocage… »). Rien pour un double appui ni pour une garde
 * changée (l'écran n'est plus celui de la personne).
 */
export function nativeSafetyOutcome(t: NativeSafetyTranslate, result: NativeSafetyResult, input: { name: string | null; reportAck?: string | undefined }): { text: string; error: boolean } | null {
  if (result.status === "busy" || result.status === "stale") return null
  if (result.status === "failed") {
    const reason = t(result.errorKey)
    if (result.step === "block") return { text: `${t(result.completed.includes("report") ? "mobile.safety.block.reportedNotBlocked" : "mobile.safety.block.failed")} ${reason}`, error: true }
    if (result.step === "unblock") return { text: `${t("mobile.safety.unblock.failed")} ${reason}`, error: true }
    return { text: `${t("mobile.safety.report.failed")} ${reason}`, error: true }
  }
  const parts: string[] = []
  if (result.completed.includes("report")) parts.push(t(input.reportAck ?? "mobile.safety.report.sent"))
  if (result.completed.includes("block")) parts.push(nativeNamedText(t, "mobile.safety.block.done", input.name))
  if (result.completed.includes("unblock")) parts.push(t("mobile.safety.unblock.done"))
  return { text: parts.join(" "), error: false }
}

// ── Suppression du compte ────────────────────────────────────────────────

/** La phrase littérale que le moteur exige (`requestErasure`) ; jamais saisie par la personne. */
export const NATIVE_ERASURE_CONFIRMATION = "DELETE_MY_ANTSIA_ACCOUNT" as const

/**
 * Double confirmation, même règle que « Mes données » du site
 * (`apps/antsia_ga/src/components/personal-controls.tsx`) : les conséquences
 * d'abord, lues et acceptées (étape 1), puis le mot de confirmation saisi
 * (étape 2) avant l'envoi. Seule adaptation : les espaces autour du mot sont
 * ignorés, car les claviers des téléphones en ajoutent d'eux-mêmes.
 */
export type NativeErasureStage = "consequences" | "confirm"

export function nativeErasureSchema(word: string, mismatch: string) {
  return z.object({ confirmation: z.string().refine(value => value.trim() === word, mismatch) })
}

/** La demande ne part que depuis l'étape 2, mot saisi, hors démonstration partagée et sans demande existante. */
export function nativeErasureAllowed(input: { stage: NativeErasureStage; typed: string; word: string; sharedDemo: boolean; existing: boolean }): boolean {
  return input.stage === "confirm" && !input.sharedDemo && !input.existing && input.typed.trim() === input.word
}

/** L'avertissement sur les rendez-vous à venir, comme le site : une lecture absente ne vaut jamais « aucun ». */
export function nativeErasureBookingsKey(bookings: { count: number; truncated: boolean } | null | undefined): string {
  if (!bookings) return "mobile.safety.erasure.bookingsUnknown"
  if (bookings.count > 0) return bookings.truncated ? "mobile.safety.erasure.bookingsMany" : "mobile.safety.erasure.bookings"
  return bookings.truncated ? "mobile.safety.erasure.bookingsEmptyWindow" : "mobile.safety.erasure.bookingsNone"
}
