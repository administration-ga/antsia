import { describe, expect, it } from "vitest"
import { createModerationLock, deadlineCountdown, moderationDecisionInput, moderationDecisionSchema, moderationUntil, moderationWindow } from "./moderation-model"

describe("SU01d — chronomètre des délais légaux", () => {
  const due = Date.UTC(2026, 9, 24, 20, 0)
  it("dit le reste en heures et minutes entières, arrondi vers le bas", () => {
    expect(deadlineCountdown(due, due - (5 * 60 + 12) * 60_000 - 30_000)).toEqual({ overdue: false, hours: 5, minutes: 12 })
    expect(deadlineCountdown(due, due - 59_999)).toEqual({ overdue: false, hours: 0, minutes: 0 })
    expect(deadlineCountdown(due, due)).toEqual({ overdue: false, hours: 0, minutes: 0 })
  })
  it("dit le retard d'au moins une minute dès que l'échéance est passée", () => {
    expect(deadlineCountdown(due, due + 1)).toEqual({ overdue: true, hours: 0, minutes: 1 })
    expect(deadlineCountdown(due, due + (2 * 60 + 5) * 60_000)).toEqual({ overdue: true, hours: 2, minutes: 5 })
  })
})

describe("modération nationale : capacité et gestes", () => {
  const capacity = { networkWide: false, teams: [{ teamId: "allowed" }] }
  it("refuse une file réseau et une équipe absente des droits serveur", () => {
    expect(moderationWindow({}, capacity).valid).toBe(false)
    expect(moderationWindow({ team: "foreign" }, capacity).valid).toBe(false)
    expect(moderationWindow({ team: "allowed", view: "pending", cursor: "opaque" }, capacity)).toEqual({ valid: true, view: "pending", team: "allowed", cursor: "opaque" })
    expect(moderationWindow({ team: ["allowed", "foreign"] }, capacity).valid).toBe(false)
  })
  it("les recours sont réservés à la capacité serveur dédiée, sans filtre d'équipe", () => {
    expect(moderationWindow({ view: "appeals" }, { ...capacity, networkWide: true }).valid).toBe(false)
    const admin = { networkWide: true, canReviewAppeals: true, teams: [{ teamId: "allowed" }] }
    expect(moderationWindow({ view: "appeals" }, admin).valid).toBe(true)
    expect(moderationWindow({ view: "appeals", team: "allowed" }, admin).valid).toBe(false)
  })
  it("une décision opposée ne traverse pas le verrou en attente", () => {
    const lock = createModerationLock()
    expect(lock.acquire()).toBe(true)
    expect(lock.pending()).toBe(true)
    expect(lock.acquire()).toBe(false)
    lock.release()
    expect(lock.acquire()).toBe(true)
  })
  it("valide le vrai seuil du motif et la suspension datée", () => {
    const schema = moderationDecisionSchema("reason", "duration", "UTC")
    expect(schema.safeParse({ action: "dismissed", reason: " a ", until: "" }).success).toBe(false)
    expect(schema.safeParse({ action: "suspension", reason: "Motif motivé", until: "" }).success).toBe(false)
    expect(schema.safeParse({ action: "suspension", reason: "Motif motivé", until: new Date(Date.now() - 60_000).toISOString().slice(0, 16) }).success).toBe(false)
    expect(schema.safeParse({ action: "suspension", reason: "Motif motivé", until: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16) }).success).toBe(true)
  })
  it("convertit la fin dans le fuseau annoncé, sans accepter une heure inexistante", () => {
    expect(moderationUntil("2026-11-01T12:00", "Africa/Libreville")).toBe(Date.parse("2026-11-01T11:00:00Z"))
    expect(moderationUntil("2026-03-29T02:30", "Europe/Paris")).toBeNaN()
  })
  it("un classement sans suite ne transporte aucune sanction ni date résiduelle", () => {
    expect(moderationDecisionInput({ action: "dismissed", reason: "  Contexte relu.  ", until: "arbitrary" })).toEqual({ decision: "dismissed", reason: "Contexte relu.", sanctions: [] })
    expect(moderationDecisionInput({ action: "warning", reason: "Contexte relu.", until: "" }).sanctions).toEqual([{ kind: "warning" }])
  })
})
