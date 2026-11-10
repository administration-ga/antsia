// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/fileGuard/fileGuard.test.ts @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) au lieu des organisations et des comptes ; cas fail-open INVERSÉS (un fichier sans ligne est retenu) ; coupe-circuit qui SUSPEND ; quarantaine iDocument et avis du DSI retirés (le statut bloquant est la retenue ; l'avis arrive avec le module notifications) ; libération par un modérateur du réseau, relance par un opérateur ; tests neufs : fraîcheur du dépôt, purge sans famine (D31), fichier généré, pièces posées, lecture bornée au réseau, journal des décisions (libération, relance, purge).
/**
 * Garde des fichiers — la chaîne complète sur le harnais convex-test :
 * admission → analyse → verdict → retenue → libération.
 *
 * Les fichiers sont fabriqués en test (PDF minimal, EICAR, docx avec VBA, PNG
 * annoncé PDF) ; l'antivirus est le mock (EICAR seul), admis parce que le
 * déploiement simulé est LOCAL (`CONVEX_CLOUD_URL`). Le harnais n'enregistre
 * pas de `contentType` : le type DÉCLARÉ à l'admission sert de repli, et c'est
 * précisément ce que l'inspection des octets vient confronter.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { UploadUsage } from "@antsia/social-domain/uploadPolicy"
import JSZip from "jszip"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { admitStoredUpload, assertFreshUpload, enqueueScan, findScanByStorageId, registerGeneratedBlob } from "./admission"
import { EICAR_SIGNATURE } from "./avProviders"
import { admitPosedUploads } from "./posedUploads"
import { assertServableStorage, resolveFileDelivery, withheldCodeOf } from "./storageGuard"

type T = ReturnType<typeof testConvex>

const PDF = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n"
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

beforeEach(() => {
  // Déploiement simulé LOCAL : l'antivirus mock y est admis (hors local, il est refusé).
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seedRoot(t: T): Promise<Id<"networks">> {
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  return root
}

/** Une personne entrée dans la racine ; `role` pour un modérateur du réseau. */
async function member(t: T, rootId: Id<"networks">, subject: string, role?: Doc<"networkMemberships">["role"]) {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => {
    await ctx.db.patch(personId, { handle: subject, displayName: subject, publishedAt: Date.now() })
  })
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  if (role) {
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", rootId).eq("personId", personId))
        .unique()
      if (membership) await ctx.db.patch(membership._id, { role })
    })
  }
  return { as, personId }
}

/** Les lignes du journal des décisions qui visent cette analyse, des plus anciennes aux plus récentes. */
async function auditOf(t: T, scanId: Id<"fileScans">): Promise<Doc<"engineAudit">[]> {
  return await t.run(async (ctx) =>
    ctx.db
      .query("engineAudit")
      .withIndex("by_subject_at", (q) => q.eq("subjectTable", "fileScans").eq("subjectId", scanId))
      .take(20),
  )
}

async function operator(t: T, rootId: Id<"networks">, subject: string) {
  const person = await member(t, rootId, subject)
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: person.personId, role: "platform_operator", grantedAt: Date.now() })
  })
  await createTestOperatorProof(t, person.as, person.personId)
  return person
}

async function store(t: T, content: string | Uint8Array, type: string): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([content as BlobPart], { type })))
}

async function docxWithMacro(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file("[Content_Types].xml", "<Types/>")
  zip.file("word/document.xml", "<w:document/>")
  zip.file("word/vbaProject.bin", new Uint8Array([1, 2, 3]))
  return await zip.generateAsync({ type: "uint8array" })
}

/** Admet un fichier comme le fait une mutation de dépôt. */
async function admit(
  t: T,
  storageId: Id<"_storage">,
  mimeType: string,
  meta: { networkId?: Id<"networks">; uploadedByPersonId?: Id<"persons">; filename?: string } = {},
  usage: UploadUsage = "chat_attachment",
) {
  // Pièce de conversation par défaut : son usage admet PDF, images et bureautique.
  return await t.run(async (ctx) => admitStoredUpload(ctx as unknown as MutationCtx, { storageId, usage, mimeType }, { source: "message", ...meta }))
}

async function scanOf(t: T, storageId: Id<"_storage">): Promise<Doc<"fileScans"> | null> {
  return await t.run(async (ctx) => findScanByStorageId(ctx as unknown as MutationCtx, storageId))
}

async function runScan(t: T, scanId: Id<"fileScans">) {
  await t.action(internal.modules.files.scan.runScan, { scanId })
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

describe("admission — une ligne par fichier, un job planifié", () => {
  it("crée la ligne `pending`, la planifie, et ne la double jamais", async () => {
    // convex-test tire `runAfter(0)` par un vrai `setTimeout` : les timers
    // factices figent le job pour observer l'état `pending`.
    vi.useFakeTimers()
    const t = testConvex()
    const rootId = await seedRoot(t)
    const { personId } = await member(t, rootId, "deposante")
    const storageId = await store(t, PDF, "application/pdf")

    const first = await admit(t, storageId, "application/pdf", { networkId: rootId, uploadedByPersonId: personId, filename: "note.pdf" })
    expect(first.scanStatus).toBe("pending")
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/)
    const again = await admit(t, storageId, "application/pdf", { networkId: rootId, uploadedByPersonId: personId })
    expect(again.scanId).toBe(first.scanId)

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("fileScans")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .take(5),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "pending", source: "message", declaredMimeType: "application/pdf", attempts: 0, networkId: rootId })
  })

  it("`FILE_GUARD=off` SUSPEND : la ligne naît `pending` sans job, et reste retenue", async () => {
    vi.stubEnv("FILE_GUARD", "off")
    const t = testConvex()
    const storageId = await store(t, PDF, "application/pdf")
    const out = await admit(t, storageId, "application/pdf", { filename: "x.pdf" })
    expect(out.scanStatus).toBe("pending")
    expect(await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))).toEqual({ url: null, scan: "pending" })
    // Ni l'analyse ni le balayeur ne travaillent pendant la suspension.
    await runScan(t, out.scanId)
    expect((await scanOf(t, storageId))?.status).toBe("pending")
    expect(await t.mutation(internal.modules.files.mutations.retryStale, {})).toBe(0)
  })

  it("la politique de dépôt reste la première barrière : un type hors liste blanche est refusé avant toute ligne", async () => {
    const t = testConvex()
    const storageId = await store(t, "MZ\x90", "application/x-msdownload")
    const error = await caught(admit(t, storageId, "application/x-msdownload"))
    expect(engineErrorRule(error)?.rule).toBe("UPLOAD_TYPE_NOT_ALLOWED")
    expect(await scanOf(t, storageId)).toBeNull()
  })

  it("un dépôt n'adopte jamais le fichier d'autrui : refus indistinct, et son propre fichier se nomme", async () => {
    const t = testConvex()
    const rootId = await seedRoot(t)
    const alice = await member(t, rootId, "alice")
    const bob = await member(t, rootId, "bob")
    const storageId = await store(t, PDF, "application/pdf")
    await admit(t, storageId, "application/pdf", { networkId: rootId, uploadedByPersonId: alice.personId })
    const fresh = (personId: Id<"persons">) => t.run(async (ctx) => assertFreshUpload(ctx as unknown as MutationCtx, personId, storageId))
    expect(engineErrorCode(await caught(fresh(bob.personId)))).toBe("notFound")
    expect(engineErrorCode(await caught(fresh(alice.personId)))).toBe("conflict")
    const unknown = await store(t, PDF, "application/pdf")
    await expect(t.run(async (ctx) => assertFreshUpload(ctx as unknown as MutationCtx, bob.personId, unknown))).resolves.toBeNull()
  })
})

describe("délivrance — FAIL-CLOSED", () => {
  it("un fichier sans ligne est RETENU ; `pending` aussi ; `clean` devient servable", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const unknown = await store(t, PDF, "application/pdf")
    expect(await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, unknown))).toEqual({ url: null, scan: null })

    const fresh = await store(t, PDF, "application/pdf")
    const admitted = await admit(t, fresh, "application/pdf")
    expect(await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, fresh))).toEqual({ url: null, scan: "pending" })
    vi.useRealTimers()
    await runScan(t, admitted.scanId)
    const after = await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, fresh))
    expect(after.scan).toBe("clean")
    expect(after.url).toBeTruthy()
  })

  it("`assertServableStorage` nomme la retenue dans `error.data`", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const unknown = await store(t, PDF, "application/pdf")
    expect(engineErrorCode(await caught(t.run(async (ctx) => assertServableStorage(ctx as unknown as MutationCtx, unknown))))).toBe("fileScanPending")
    const storageId = await store(t, PDF, "application/pdf")
    await admit(t, storageId, "application/pdf")
    expect(engineErrorCode(await caught(t.run(async (ctx) => assertServableStorage(ctx as unknown as MutationCtx, storageId))))).toBe("fileScanPending")
  })

  it("une erreur d'analyse se distingue d'un fichier suspect ou infecté, sans délivrer d'URL", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const storageId = await store(t, PDF, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf")
    for (const requiresFullScan of [false, true]) {
      for (const status of ["error", "suspicious", "infected"] as const) {
        await t.run(async (ctx) => ctx.db.patch(scanId, { status, requiresFullScan }))
        const expected = status === "error" ? "fileScanUnavailable" : "fileQuarantined"
        const delivery = await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))
        expect(delivery).toEqual({ url: null, scan: status })
        expect(withheldCodeOf(delivery.scan)).toBe(expected)
        expect(engineErrorCode(await caught(t.run(async (ctx) => assertServableStorage(ctx as unknown as MutationCtx, storageId))))).toBe(expected)
      }
    }
  })

  it("une analyse complète exige toujours un verdict antivirus sain avant de délivrer", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const storageId = await store(t, PDF, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf")
    for (const status of ["clean", "skipped"] as const) {
      await t.run(async (ctx) => ctx.db.patch(scanId, { status, requiresFullScan: true }))
      expect(await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))).toEqual({ url: null, scan: "error" })
    }
    await t.run(async (ctx) => ctx.db.patch(scanId, { status: "clean", av: { provider: "clamav-rest", verdict: "clean" } }))
    const delivery = await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))
    expect(delivery.scan).toBe("clean")
    expect(delivery.url).toBeTruthy()
  })
})

describe("analyse — verdicts", () => {
  it("un PDF sain finit `clean`, avec son type détecté et l'antivirus mock", async () => {
    const t = testConvex()
    const storageId = await store(t, PDF, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf", { filename: "sain.pdf" })
    await runScan(t, scanId)
    const scan = await scanOf(t, storageId)
    expect(scan).toMatchObject({ status: "clean", detectedMimeType: "application/pdf", verdictReason: "OK", attempts: 1 })
    expect(scan?.av).toMatchObject({ provider: "mock", verdict: "clean" })
    expect(scan?.completedAt).toBeDefined()
  })

  it("EICAR est `infected` : retenu, et refusé à tout envoi", async () => {
    const t = testConvex()
    const storageId = await store(t, EICAR_SIGNATURE, "text/plain")
    const { scanId } = await admit(t, storageId, "text/plain", { filename: "eicar.txt" }, "chat_attachment")
    await runScan(t, scanId)
    const scan = await scanOf(t, storageId)
    expect(scan?.status).toBe("infected")
    expect(scan?.verdictReason).toBe("AV_INFECTED:Eicar-Test-Signature")
    expect(await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))).toEqual({ url: null, scan: "infected" })
    expect(engineErrorCode(await caught(t.run(async (ctx) => assertServableStorage(ctx as unknown as MutationCtx, storageId))))).toBe("fileQuarantined")
  })

  it("un docx avec macros VBA est `infected` par l'inspection seule", async () => {
    const t = testConvex()
    const storageId = await store(t, await docxWithMacro(), DOCX_MIME)
    const { scanId } = await admit(t, storageId, DOCX_MIME, { filename: "macro.docx" }, "chat_attachment")
    await runScan(t, scanId)
    const scan = await scanOf(t, storageId)
    expect(scan?.status).toBe("infected")
    expect(scan?.findings?.some((f) => f.code === "OOXML_MACROS")).toBe(true)
    expect(scan?.detectedMimeType).toBe("application/zip")
  })

  it("un PNG annoncé PDF est `suspicious` — bloqué, mais libérable", async () => {
    const t = testConvex()
    const storageId = await store(t, PNG, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf", { filename: "faux.pdf" })
    await runScan(t, scanId)
    expect(await scanOf(t, storageId)).toMatchObject({ status: "suspicious", detectedMimeType: "image/png", verdictReason: "MIME_MISMATCH" })
  })

  it("une analyse déjà terminale ne se rejoue pas", async () => {
    const t = testConvex()
    const storageId = await store(t, PDF, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf")
    await runScan(t, scanId)
    await runScan(t, scanId)
    expect((await scanOf(t, storageId))?.attempts).toBe(1)
  })

  it("hors développement local, sans antivirus configuré, un fichier sain reste RETENU (`error` après les tentatives)", async () => {
    vi.unstubAllEnvs()
    const t = testConvex()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const storageId = await store(t, PDF, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf")
    await t.run(async (ctx) => {
      await ctx.db.patch(scanId, { attempts: 2 })
    })
    await runScan(t, scanId)
    expect(await scanOf(t, storageId)).toMatchObject({ status: "error", verdictReason: "AV_ERROR:provider_unconfigured" })
    expect(await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))).toEqual({ url: null, scan: "error" })
    expect(engineErrorCode(await caught(t.run(async (ctx) => assertServableStorage(ctx as unknown as MutationCtx, storageId))))).toBe("fileScanUnavailable")
    warn.mockRestore()
  })
})

describe("libération par un modérateur, relance par un opérateur", () => {
  async function suspiciousScan(t: T, networkId: Id<"networks"> | undefined, uploaderId: Id<"persons">) {
    const storageId = await store(t, PNG, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf", { ...(networkId ? { networkId } : {}), uploadedByPersonId: uploaderId, filename: "faux.pdf" })
    await runScan(t, scanId)
    expect((await scanOf(t, storageId))?.status).toBe("suspicious")
    return { storageId, scanId }
  }

  it("un modérateur du réseau libère un suspect avec motif ; le fichier redevient servable", async () => {
    const t = testConvex()
    const rootId = await seedRoot(t)
    const moderator = await member(t, rootId, "moderatrice", "network_moderator")
    const uploader = await member(t, rootId, "deposant")
    const { storageId, scanId } = await suspiciousScan(t, rootId, uploader.personId)
    expect(await moderator.as.mutation(api.modules.files.mutations.releaseScan, { scanId, reason: "Faux positif : capture renommée" })).toEqual({ status: "clean" })
    expect(await scanOf(t, storageId)).toMatchObject({ status: "clean", releasedByPersonId: moderator.personId })
    // La décision laisse sa ligne : qui, à quel titre, dans quel réseau, pourquoi.
    expect(await auditOf(t, scanId)).toMatchObject([
      { action: "file.release", capacity: "network_moderator", actorPersonId: moderator.personId, networkId: rootId, details: { reason: "Faux positif : capture renommée", from: "suspicious" } },
    ])
    expect((await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))).url).toBeTruthy()
  })

  it("un membre ordinaire ne libère pas (refus indistinct) ; un motif vide non plus", async () => {
    const t = testConvex()
    const rootId = await seedRoot(t)
    const plain = await member(t, rootId, "membre")
    const moderator = await member(t, rootId, "moderateur", "network_admin")
    const { scanId } = await suspiciousScan(t, rootId, plain.personId)
    expect(engineErrorCode(await caught(plain.as.mutation(api.modules.files.mutations.releaseScan, { scanId, reason: "parce que" })))).toBe("notFound")
    expect(engineErrorCode(await caught(moderator.as.mutation(api.modules.files.mutations.releaseScan, { scanId, reason: " " })))).toBe("invalidArgument")
    // Une décision refusée n'a pas de ligne.
    expect(await auditOf(t, scanId)).toEqual([])
  })

  it("un fichier de profil (sans réseau) ne se libère que par un opérateur", async () => {
    const t = testConvex()
    const rootId = await seedRoot(t)
    const moderator = await member(t, rootId, "moderatrice", "network_moderator")
    const op = await operator(t, rootId, "operateur")
    const { scanId } = await suspiciousScan(t, undefined, moderator.personId)
    expect(engineErrorCode(await caught(moderator.as.mutation(api.modules.files.mutations.releaseScan, { scanId, reason: "c'est mon fichier" })))).toBe("notFound")
    expect(await op.as.mutation(api.modules.files.mutations.releaseScan, { scanId, reason: "Vérifié à la main" })).toEqual({ status: "clean" })
    const [line] = await auditOf(t, scanId)
    expect(line).toMatchObject({ action: "file.release", capacity: "platform_operator", actorPersonId: op.personId })
    expect(line?.networkId).toBeUndefined()
  })

  it("un `infected` ne se libère jamais ; seule une relance d'opérateur le remet en analyse", async () => {
    const t = testConvex()
    const rootId = await seedRoot(t)
    const op = await operator(t, rootId, "operatrice")
    const plain = await member(t, rootId, "membre")
    const storageId = await store(t, EICAR_SIGNATURE, "text/plain")
    const { scanId } = await admit(t, storageId, "text/plain", { filename: "eicar.txt" }, "chat_attachment")
    await runScan(t, scanId)
    expect((await scanOf(t, storageId))?.status).toBe("infected")
    expect(engineErrorCode(await caught(op.as.mutation(api.modules.files.mutations.releaseScan, { scanId, reason: "on verra" })))).toBe("conflict")
    expect(engineErrorCode(await caught(plain.as.mutation(api.modules.files.mutations.requeueScan, { scanId })))).toBe("operatorRequired")
    vi.useFakeTimers()
    await op.as.mutation(api.modules.files.mutations.requeueScan, { scanId })
    expect(await scanOf(t, storageId)).toMatchObject({ status: "pending", attempts: 0 })
    expect(await auditOf(t, scanId)).toMatchObject([{ action: "file.requeue", capacity: "platform_operator", actorPersonId: op.personId, details: { from: "infected" } }])
  })
})

describe("balayeur et purge", () => {
  it("un `pending` rassis est replanifié ; au-delà du plafond de tentatives il est figé en `error`", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const storageId = await store(t, PDF, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf")
    const stale = Date.now() - 10 * 60_000
    await t.run(async (ctx) => {
      await ctx.db.patch(scanId, { updatedAt: stale })
    })
    expect(await t.mutation(internal.modules.files.mutations.retryStale, {})).toBe(1)
    const scan = await scanOf(t, storageId)
    expect(scan?.status).toBe("pending")
    expect(scan?.updatedAt ?? 0).toBeGreaterThan(stale)

    await t.run(async (ctx) => {
      await ctx.db.patch(scanId, { attempts: 3, updatedAt: stale })
    })
    await t.mutation(internal.modules.files.mutations.retryStale, {})
    expect(await scanOf(t, storageId)).toMatchObject({ status: "error", verdictReason: "STALE_JOB" })
  })

  it("le fichier d'un `infected` plus vieux que la rétention est purgé, la ligne reste ; rejouer ne purge pas deux fois", async () => {
    const t = testConvex()
    const storageId = await store(t, EICAR_SIGNATURE, "text/plain")
    const { scanId } = await admit(t, storageId, "text/plain", { filename: "eicar.txt" }, "chat_attachment")
    await runScan(t, scanId)
    await t.run(async (ctx) => {
      await ctx.db.patch(scanId, { updatedAt: Date.now() - 200 * 24 * 60 * 60_000 })
    })
    expect(await t.mutation(internal.modules.files.mutations.purgeQuarantinedBlobs, {})).toBe(1)
    expect((await scanOf(t, storageId))?.blobPurgedAt).toBeDefined()
    expect(await t.run(async (ctx) => ctx.storage.getUrl(storageId))).toBeNull()
    expect(await t.mutation(internal.modules.files.mutations.purgeQuarantinedBlobs, {})).toBe(0)
    // Acte du SYSTÈME : une ligne, sans acteur ; le rejeu n'en ajoute pas.
    const lines = await auditOf(t, scanId)
    expect(lines).toMatchObject([{ action: "file.purge_blob", capacity: "system" }])
    expect(lines[0]?.actorPersonId).toBeUndefined()
  })

  it("D31 — cinquante lignes déjà purgées ne bouchent plus la file : la suivante est purgée", async () => {
    const t = testConvex()
    const old = Date.now() - 200 * 24 * 60 * 60_000
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i += 1) {
        const storageId = await ctx.storage.store(new Blob([`purge ${i}`], { type: "text/plain" }))
        await ctx.db.insert("fileScans", { storageId, status: "infected", source: "message", attempts: 1, blobPurgedAt: old, createdAt: old, updatedAt: old - i })
      }
    })
    const waiting = await store(t, EICAR_SIGNATURE, "text/plain")
    await t.run(async (ctx) => {
      await ctx.db.insert("fileScans", { storageId: waiting, status: "infected", source: "message", attempts: 1, createdAt: old, updatedAt: old })
    })
    expect(await t.mutation(internal.modules.files.mutations.purgeQuarantinedBlobs, {})).toBe(1)
    expect((await scanOf(t, waiting))?.blobPurgedAt).toBeDefined()
  })
})

describe("fichiers produits par la plateforme et pièces posées", () => {
  it("un fichier généré est inscrit `skipped/server_generated`, servable, et n'est plus « neuf »", async () => {
    const t = testConvex()
    const rootId = await seedRoot(t)
    const someone = await member(t, rootId, "quelquun")
    const storageId = await store(t, PDF, "application/pdf")
    const first = await t.run(async (ctx) => registerGeneratedBlob(ctx as unknown as MutationCtx, storageId, { mimeType: "application/pdf", filename: "rediffusion.pdf" }))
    const again = await t.run(async (ctx) => registerGeneratedBlob(ctx as unknown as MutationCtx, storageId, { mimeType: "application/pdf" }))
    expect(first.created).toBe(true)
    expect(again).toEqual({ scanId: first.scanId, created: false })
    expect(await scanOf(t, storageId)).toMatchObject({ status: "skipped", source: "generated", skipReason: "server_generated" })
    expect((await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))).url).toBeTruthy()
    expect(engineErrorCode(await caught(t.run(async (ctx) => assertFreshUpload(ctx as unknown as MutationCtx, someone.personId, storageId))))).toBe("notFound")
  })

  it("une réécriture en bloc n'admet que ce qu'elle AJOUTE ; un identifiant inventé est introuvable", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const rootId = await seedRoot(t)
    const author = await member(t, rootId, "autrice")
    const inPlace = await store(t, PNG, "image/png")
    const added = await store(t, PNG, "image/png")
    const admitted = await t.run(async (ctx) => {
      const facts = await admitPosedUploads(ctx as unknown as MutationCtx, author.personId, {
        inPlace: [inPlace],
        posed: [
          { storageId: inPlace, usage: "album_image", mimeType: "image/png" },
          { storageId: added, usage: "album_image", mimeType: "image/png" },
          { storageId: added, usage: "album_image", mimeType: "image/png" },
        ],
        meta: { source: "album", networkId: rootId },
      })
      return [...facts.keys()]
    })
    expect(admitted).toEqual([added])
    expect(await scanOf(t, inPlace)).toBeNull()
    expect(await scanOf(t, added)).toMatchObject({ status: "pending", source: "album", uploadedByPersonId: author.personId })
    const invented = await caught(
      t.run(async (ctx) =>
        admitPosedUploads(ctx as unknown as MutationCtx, author.personId, {
          inPlace: [],
          posed: [{ storageId: "pas-un-identifiant", usage: "album_image" }],
          meta: { source: "album" },
        }),
      ),
    )
    expect(engineErrorCode(invented)).toBe("notFound")
  })
})

describe("lecture de l'état", () => {
  it("l'état se lit dans le réseau (membre seulement, 100 au plus) ; le rapport par le déposant, un modérateur ou un opérateur", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const rootId = await seedRoot(t)
    const uploader = await member(t, rootId, "deposante")
    const moderator = await member(t, rootId, "moderateur", "network_moderator")
    const other = await member(t, rootId, "autre")
    const op = await operator(t, rootId, "operateur")
    const outsider = t.withIdentity({ subject: "sans-reseau" })
    await outsider.mutation(api.modules.people.persons.ensureMyPerson, {})
    const storageId = await store(t, PDF, "application/pdf")
    const { scanId } = await admit(t, storageId, "application/pdf", { networkId: rootId, uploadedByPersonId: uploader.personId })

    expect(await other.as.query(api.modules.files.queries.statusByStorageIds, { networkId: rootId, storageIds: [storageId] })).toEqual([{ storageId, status: "pending" }])
    expect(engineErrorCode(await caught(outsider.query(api.modules.files.queries.statusByStorageIds, { networkId: rootId, storageIds: [storageId] })))).toBe("notFound")
    const tooMany = Array.from({ length: 101 }, () => storageId)
    expect(engineErrorCode(await caught(other.as.query(api.modules.files.queries.statusByStorageIds, { networkId: rootId, storageIds: tooMany })))).toBe("invalidArgument")

    expect((await uploader.as.query(api.modules.files.queries.getScan, { scanId }))._id).toBe(scanId)
    expect((await moderator.as.query(api.modules.files.queries.getScan, { scanId }))._id).toBe(scanId)
    expect((await op.as.query(api.modules.files.queries.getScan, { scanId }))._id).toBe(scanId)
    expect(engineErrorCode(await caught(other.as.query(api.modules.files.queries.getScan, { scanId })))).toBe("notFound")

    const page = await op.as.query(api.modules.files.queries.listForConsole, { status: "pending", paginationOpts: { numItems: 10, cursor: null } })
    expect(page.page.map((row) => row._id)).toEqual([scanId])
    const stats = await op.as.query(api.modules.files.queries.stats, {})
    expect(stats.byStatus.find((row) => row.status === "pending")).toEqual({ status: "pending", count: 1, sampled: false })
    expect(engineErrorCode(await caught(other.as.query(api.modules.files.queries.stats, {})))).toBe("operatorRequired")
  })
})

describe("rapport d'un fichier sans réseau (parité de queries.rapport.test du socle)", () => {
  it("le rapport d'un fichier de profil ne sort pas de son enclave : déposant et opérateur seulement", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const rootId = await seedRoot(t)
    const uploader = await member(t, rootId, "deposante")
    const moderator = await member(t, rootId, "moderatrice", "network_moderator")
    const op = await operator(t, rootId, "operateur")
    const storageId = await store(t, PNG, "image/png")
    const { scanId } = await admit(t, storageId, "image/png", { uploadedByPersonId: uploader.personId }, "avatar")
    expect((await uploader.as.query(api.modules.files.queries.getScan, { scanId }))._id).toBe(scanId)
    expect((await op.as.query(api.modules.files.queries.getScan, { scanId }))._id).toBe(scanId)
    expect(engineErrorCode(await caught(moderator.as.query(api.modules.files.queries.getScan, { scanId })))).toBe("notFound")
  })
})

describe("politique de dépôt sur le harnais", () => {
  it("un fichier stocké qui n'existe plus est introuvable", async () => {
    const t = testConvex()
    const storageId = await store(t, PDF, "application/pdf")
    await t.run(async (ctx) => ctx.storage.delete(storageId))
    expect(engineErrorCode(await caught(admit(t, storageId, "application/pdf")))).toBe("notFound")
  })

  it("un plafond d'usage dépassé est refusé avec sa borne", async () => {
    const t = testConvex()
    const storageId = await store(t, new Uint8Array(6 * 1024 * 1024), "image/png")
    const error = await caught(admit(t, storageId, "image/png", {}, "avatar"))
    expect(engineErrorRule(error)).toEqual({ rule: "UPLOAD_SIZE_OUT_OF_RANGE", params: { maxMegabytes: 5 } })
  })

  it("une ligne d'analyse existante ne se double pas, même déposée par un autre chemin", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const storageId = await store(t, PDF, "application/pdf")
    const first = await t.run(async (ctx) => enqueueScan(ctx as unknown as MutationCtx, { storageId, mimeType: "application/pdf" }, { source: "message" }))
    const second = await t.run(async (ctx) => enqueueScan(ctx as unknown as MutationCtx, { storageId }, { source: "message", filename: "plus-tard.pdf" }))
    expect(second).toEqual({ scanId: first.scanId, status: "pending", created: false, scheduled: false })
    expect((await scanOf(t, storageId))?.filename).toBe("plus-tard.pdf")
  })
})
