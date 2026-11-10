import { DECISION_REASON_MAX } from "@antsia/social-domain/audit"
import { validSanctionDuration } from "@antsia/social-domain/moderationPolicy"
import { civilDateTimeMs } from "@antsia/api/civil-date"
import { z } from "zod"

export const MODERATION_ACTIONS = ["dismissed", "removal", "warning", "suspension"] as const
export type ModerationAction = typeof MODERATION_ACTIONS[number]
export type ModerationView = "reports" | "pending" | "appeals"

export function moderationReasonSchema(message: string) {
  return z.string().trim().min(3, message).max(DECISION_REASON_MAX, message)
}

export function moderationUntil(value: string, timeZone?: string): number {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? civilDateTimeMs(value.slice(0, 10), value.slice(11), timeZone) : Number.NaN
}

export function moderationDecisionSchema(message: string, durationMessage: string, timeZone?: string) {
  return z.object({ action: z.enum(MODERATION_ACTIONS), reason: moderationReasonSchema(message), until: z.string() }).superRefine((value, ctx) => {
    if (value.action === "suspension" && !validSanctionDuration("suspension", moderationUntil(value.until, timeZone), Date.now())) ctx.addIssue({ code: "custom", path: ["until"], message: durationMessage })
  })
}

export function moderationDecisionInput(value: { action: ModerationAction; reason: string; until: string }, timeZone?: string) {
  return {
    decision: value.action === "dismissed" ? "dismissed" as const : "actioned" as const,
    reason: value.reason.trim(),
    sanctions: value.action === "dismissed" ? [] : value.action === "suspension" ? [{ kind: "suspension" as const, until: moderationUntil(value.until, timeZone) }] : [{ kind: value.action }],
  }
}

/** Aucun identifiant d'équipe de l'adresse n'est admis sans projection de capacité. */
export function moderationWindow(params: { view?: string | string[]; team?: string | string[]; cursor?: string | string[] }, capacity: { networkWide: boolean; canReviewAppeals?: boolean; teams: readonly { teamId: string }[] }) {
  const view: ModerationView | null = params.view === undefined || params.view === "reports" ? "reports" : params.view === "pending" ? "pending" : params.view === "appeals" ? "appeals" : null
  const team = params.team === undefined ? undefined : capacity.teams.find((item) => item.teamId === params.team)?.teamId
  const cursor = params.cursor
  const permitted = view === "appeals" ? capacity.canReviewAppeals === true && params.team === undefined : params.team === undefined ? capacity.networkWide : team !== undefined
  const valid = view !== null && permitted && (cursor === undefined || (typeof cursor === "string" && cursor.length > 0 && cursor.length <= 4096))
  return { valid, view: view ?? "reports", team, cursor: typeof cursor === "string" ? cursor : null }
}

/**
 * SU01d : le chronomètre d'une échéance légale — le reste en heures et minutes entières (arrondi
 * vers le bas), ou le retard (arrondi vers le haut : une échéance dépassée l'est d'au moins une minute).
 */
export function deadlineCountdown(dueAt: number, now: number): { overdue: boolean; hours: number; minutes: number } {
  const overdue = now > dueAt
  const totalMinutes = overdue ? Math.ceil((now - dueAt) / 60_000) : Math.floor((dueAt - now) / 60_000)
  return { overdue, hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

/** Verrou partagé synchrone : deux gestes opposés ne passent pas entre deux rendus. */
export function createModerationLock() {
  let pending = false
  return { acquire: () => { if (pending) return false; pending = true; return true }, release: () => { pending = false }, pending: () => pending }
}
