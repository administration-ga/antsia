import { describe, expect, it, vi } from "vitest"
import { ConvexError } from "convex/values"
import { CONTENT_REPORT_NOTE_MAX, CONTENT_REPORT_REASONS } from "@antsia/social-domain/moderation"
import {
  NATIVE_ERASURE_CONFIRMATION,
  nativeErasureAllowed,
  nativeErasureBookingsKey,
  nativeErasureSchema,
  nativeNamedKey,
  nativeReportAcknowledgementKey,
  nativeReportAllowsNote,
  nativeReportNote,
  nativeReportSchema,
  nativeSafetyErrorKey,
  nativeSafetyOutcome,
  nativeSafetySteps,
  runNativeSafetySteps,
  type NativeSafetyGuard,
} from "./native-safety"

// MB-04 / PF-04 : tests purs, sans moteur ni appareil ; les mutations sont des doubles.
function guard(state = { current: true }): NativeSafetyGuard & { state: { current: boolean } } {
  return { state, current: () => state.current, capture: () => () => state.current }
}
const refusal = new ConvexError({ code: "notFound" })

describe("ordre des gestes : signaler avant de bloquer", () => {
  it("place toujours le signalement avant le blocage, quel que soit l'ordre demandé", () => {
    expect(nativeSafetySteps({ report: true, block: true })).toEqual(["report", "block"])
    expect(nativeSafetySteps({ block: true, report: true })).toEqual(["report", "block"])
    expect(nativeSafetySteps({ report: true, block: false })).toEqual(["report"])
    expect(nativeSafetySteps({ report: false, block: true })).toEqual(["block"])
    expect(nativeSafetySteps({ report: false, block: false })).toEqual([])
  })

  it("envoie le signalement au moteur avant le blocage", async () => {
    const calls: string[] = []
    const result = await runNativeSafetySteps({ steps: nativeSafetySteps({ report: true, block: true }), lock: { current: false }, guard: guard(), perform: async step => { calls.push(step) } })
    expect(calls).toEqual(["report", "block"])
    expect(result).toEqual({ status: "done", completed: ["report", "block"] })
  })
})

describe("garde de session des gestes", () => {
  it("n'envoie rien quand l'écran n'est plus celui de la session courante", async () => {
    const perform = vi.fn(async () => undefined)
    const result = await runNativeSafetySteps({ steps: ["block"], lock: { current: false }, guard: guard({ current: false }), perform })
    expect(result).toEqual({ status: "stale", completed: [] })
    expect(perform).not.toHaveBeenCalled()
  })

  it("s'arrête après le signalement si la session change pendant l'envoi : le blocage ne part pas", async () => {
    const state = { current: true }
    const perform = vi.fn(async (step: string) => { if (step === "report") state.current = false })
    const result = await runNativeSafetySteps({ steps: ["report", "block"], lock: { current: false }, guard: guard(state), perform })
    expect(perform).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ status: "stale", completed: ["report"] })
  })

  it("ignore un double appui : une seule transmission tant que la première n'est pas revenue", async () => {
    const lock = { current: false }
    let release: () => void = () => undefined
    const perform = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const first = runNativeSafetySteps({ steps: ["block"], lock, guard: guard(), perform })
    const second = await runNativeSafetySteps({ steps: ["block"], lock, guard: guard(), perform })
    expect(second).toEqual({ status: "busy" })
    release()
    expect(await first).toEqual({ status: "done", completed: ["block"] })
    expect(perform).toHaveBeenCalledTimes(1)
    expect(lock.current).toBe(false)
  })

  it("rend le verrou après un refus, et dit ce qui était déjà acquis", async () => {
    const lock = { current: false }
    const result = await runNativeSafetySteps({ steps: ["report", "block"], lock, guard: guard(), perform: async step => { if (step === "block") throw refusal } })
    expect(result).toEqual({ status: "failed", step: "block", completed: ["report"], errorKey: "mobile.safety.errors.refused" })
    expect(lock.current).toBe(false)
  })

  it("appelle onStart une seule fois, après la prise du verrou", async () => {
    const onStart = vi.fn()
    await runNativeSafetySteps({ steps: ["report", "block"], lock: { current: false }, guard: guard(), perform: async () => undefined, onStart })
    expect(onStart).toHaveBeenCalledTimes(1)
    const busy = vi.fn()
    await runNativeSafetySteps({ steps: ["block"], lock: { current: true }, guard: guard(), perform: async () => undefined, onStart: busy })
    expect(busy).not.toHaveBeenCalled()
  })
})

describe("refus indistinct", () => {
  it("rend la même phrase pour tout refus du moteur : absent, bloqué, soi-même, conflit", () => {
    for (const code of ["notFound", "invalidArgument", "conflict", "policyRefused", "statusInsufficient"]) {
      expect(nativeSafetyErrorKey(new ConvexError({ code }))).toBe("mobile.safety.errors.refused")
    }
  })
  it("ne distingue que le débit dépassé et la panne de transport, qui ne révèlent rien", () => {
    expect(nativeSafetyErrorKey(new ConvexError({ code: "rateLimited", retryAfterMs: 1000 }))).toBe("mobile.safety.errors.rateLimited")
    expect(nativeSafetyErrorKey(new Error("Network request failed"))).toBe("mobile.safety.errors.unavailable")
    expect(nativeSafetyErrorKey(undefined)).toBe("mobile.safety.errors.unavailable")
  })
})

describe("ce que l'écran dit d'un geste", () => {
  const t = (key: string, params?: Record<string, string | number>) => params?.name ? `${key}(${params.name})` : key
  it("dit l'accusé du signalement puis le blocage, dans cet ordre", () => {
    expect(nativeSafetyOutcome(t, { status: "done", completed: ["report", "block"] }, { name: "Awa", reportAck: "mobile.safety.report.already" })).toEqual({ text: "mobile.safety.report.already mobile.safety.block.done(Awa)", error: false })
    expect(nativeSafetyOutcome(t, { status: "done", completed: ["block"] }, { name: null })).toEqual({ text: "mobile.safety.block.doneUnnamed", error: false })
    expect(nativeSafetyOutcome(t, { status: "done", completed: ["unblock"] }, { name: "Awa" })).toEqual({ text: "mobile.safety.unblock.done", error: false })
  })
  it("dit qu'un signalement est acquis quand seul le blocage a été refusé", () => {
    expect(nativeSafetyOutcome(t, { status: "failed", step: "block", completed: ["report"], errorKey: "mobile.safety.errors.refused" }, { name: "Awa" })).toEqual({ text: "mobile.safety.block.reportedNotBlocked mobile.safety.errors.refused", error: true })
    expect(nativeSafetyOutcome(t, { status: "failed", step: "block", completed: [], errorKey: "mobile.safety.errors.rateLimited" }, { name: "Awa" })).toEqual({ text: "mobile.safety.block.failed mobile.safety.errors.rateLimited", error: true })
    expect(nativeSafetyOutcome(t, { status: "failed", step: "report", completed: [], errorKey: "mobile.safety.errors.refused" }, { name: null })?.text).toBe("mobile.safety.report.failed mobile.safety.errors.refused")
    expect(nativeSafetyOutcome(t, { status: "failed", step: "unblock", completed: [], errorKey: "mobile.safety.errors.refused" }, { name: null })?.text).toBe("mobile.safety.unblock.failed mobile.safety.errors.refused")
  })
  it("ne dit rien d'un double appui ni d'une session changée", () => {
    expect(nativeSafetyOutcome(t, { status: "busy" }, { name: "Awa" })).toBeNull()
    expect(nativeSafetyOutcome(t, { status: "stale", completed: ["report"] }, { name: "Awa" })).toBeNull()
  })
})

describe("formulaire de signalement", () => {
  const schema = nativeReportSchema("trop long")
  it("n'accepte que les motifs du domaine", () => {
    for (const reason of CONTENT_REPORT_REASONS) expect(schema.safeParse({ reason, note: "", alsoBlock: false }).success).toBe(true)
    expect(schema.safeParse({ reason: "spam_libre", note: "", alsoBlock: false }).success).toBe(false)
  })
  it("borne la précision à la limite du moteur", () => {
    expect(schema.safeParse({ reason: "other", note: "a".repeat(CONTENT_REPORT_NOTE_MAX), alsoBlock: false }).success).toBe(true)
    const parsed = schema.safeParse({ reason: "other", note: "a".repeat(CONTENT_REPORT_NOTE_MAX + 1), alsoBlock: false })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toBe("trop long")
  })
  it("ne transmet une précision qu'aux chemins qui la portent, et jamais vide", () => {
    expect(nativeReportAllowsNote("post")).toBe(true)
    expect(nativeReportAllowsNote("comment")).toBe(true)
    expect(nativeReportAllowsNote("person")).toBe(false)
    expect(nativeReportAllowsNote("personalMessage")).toBe(false)
    expect(nativeReportNote("comment", "  précision  ")).toEqual({ note: "précision" })
    expect(nativeReportNote("comment", "   ")).toEqual({})
    expect(nativeReportNote("person", "ignorée")).toEqual({})
  })
  it("dit l'accusé du moteur : dossier neuf ou rejeu sans doublon", () => {
    expect(nativeReportAcknowledgementKey({ created: true, hidden: true })).toBe("mobile.safety.report.sent")
    expect(nativeReportAcknowledgementKey({ created: false, hidden: true })).toBe("mobile.safety.report.already")
    expect(nativeReportAcknowledgementKey(null)).toBe("mobile.safety.report.sent")
  })
  it("ne compose jamais une phrase avec un nom vide", () => {
    expect(nativeNamedKey("mobile.safety.block.title", "  Awa ")).toEqual({ key: "mobile.safety.block.title", values: { name: "Awa" } })
    expect(nativeNamedKey("mobile.safety.block.title", "  ")).toEqual({ key: "mobile.safety.block.titleUnnamed", values: {} })
    expect(nativeNamedKey("mobile.safety.block.title", null)).toEqual({ key: "mobile.safety.block.titleUnnamed", values: {} })
  })
})

describe("suppression du compte : double confirmation", () => {
  const word = "SUPPRIMER"
  it("exige le mot de confirmation exact, espaces du clavier mis à part", () => {
    const schema = nativeErasureSchema(word, "ne correspond pas")
    expect(schema.safeParse({ confirmation: "SUPPRIMER" }).success).toBe(true)
    expect(schema.safeParse({ confirmation: " SUPPRIMER " }).success).toBe(true)
    for (const typed of ["", "supprimer", "SUPPRIME", "SUPPRIMER MON COMPTE", NATIVE_ERASURE_CONFIRMATION]) {
      const parsed = schema.safeParse({ confirmation: typed })
      expect(parsed.success).toBe(false)
      expect(parsed.error?.issues[0]?.message).toBe("ne correspond pas")
    }
  })
  it("ne laisse partir la demande qu'à l'étape 2, mot saisi, hors démonstration partagée et sans demande en cours", () => {
    const base = { stage: "confirm" as const, typed: word, word, sharedDemo: false, existing: false }
    expect(nativeErasureAllowed(base)).toBe(true)
    expect(nativeErasureAllowed({ ...base, stage: "consequences" })).toBe(false)
    expect(nativeErasureAllowed({ ...base, typed: "" })).toBe(false)
    expect(nativeErasureAllowed({ ...base, sharedDemo: true })).toBe(false)
    expect(nativeErasureAllowed({ ...base, existing: true })).toBe(false)
  })
  it("envoie au moteur la phrase littérale qu'il exige, jamais le mot traduit", () => {
    expect(NATIVE_ERASURE_CONFIRMATION).toBe("DELETE_MY_ANTSIA_ACCOUNT")
  })
  it("dit les rendez-vous à venir comme le site : une lecture absente ne vaut jamais « aucun »", () => {
    expect(nativeErasureBookingsKey(undefined)).toBe("mobile.safety.erasure.bookingsUnknown")
    expect(nativeErasureBookingsKey(null)).toBe("mobile.safety.erasure.bookingsUnknown")
    expect(nativeErasureBookingsKey({ count: 2, truncated: false })).toBe("mobile.safety.erasure.bookings")
    expect(nativeErasureBookingsKey({ count: 2, truncated: true })).toBe("mobile.safety.erasure.bookingsMany")
    expect(nativeErasureBookingsKey({ count: 0, truncated: false })).toBe("mobile.safety.erasure.bookingsNone")
    expect(nativeErasureBookingsKey({ count: 0, truncated: true })).toBe("mobile.safety.erasure.bookingsEmptyWindow")
  })
})
