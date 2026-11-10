import { beforeEach, describe, expect, it, vi } from "vitest"
import { getFunctionName } from "convex/server"

const mocks = vi.hoisted(() => ({ query: vi.fn(), viewer: vi.fn() }))
vi.mock("convex/nextjs", () => ({ fetchQuery: mocks.query }))
vi.mock("./server-session", () => ({ getServerViewer: mocks.viewer, getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga", withinBridgeDeadline: (work: () => Promise<unknown>) => work() }))

import { loadPublicPost, loadPublicProfile, publicErrorStatus, publicMetadata, publicPostSchema, publicSearch, publicTransparencyDeadlinesSchema } from "./public-data"

beforeEach(() => { mocks.query.mockReset(); mocks.viewer.mockReset(); mocks.viewer.mockResolvedValue({ status: "anonymous" }); vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://localhost:3210") })
const post = { id: "publication", body: "Bonjour #gabon", publishedAt: 1_700_000_000_000, editedAt: null, tags: ["gabon"], province: null, author: { kind: "person", handle: null, displayName: null, badges: [], avatarUrl: null }, origin: { slug: "diasporale", name: "DIASPORALE" }, media: [], shared: { available: false } }

describe("projections publiques : aucun fallback de session", () => {
  it("ne requête rien quand un OTT attend adoption ou un reçu est refusé", async () => {
    expect((await loadPublicPost("publication", true)).status).toBe("handoff")
    mocks.viewer.mockResolvedValue({ status: "refused" })
    expect((await loadPublicPost("publication")).status).toBe("refused")
    expect(mocks.query).not.toHaveBeenCalled()
    expect(publicSearch({ ott: "", cursor: "opaque" })).toEqual({ handoff: true, cursor: "opaque" })
  })
  it("rattache chaque lecture à la racine et au jeton du sujet de cette requête", async () => {
    mocks.viewer.mockResolvedValueOnce({ status: "authenticated", token: "JWT-A" }).mockResolvedValueOnce({ status: "authenticated", token: "JWT-B" })
    mocks.query.mockImplementation(async (reference, args, options) => {
      if (getFunctionName(reference).endsWith(":getBySlug")) return { _id: "root" }
      expect(args.networkId).toBe("root")
      return { handle: options.token === "JWT-A" ? "alice" : "bob", displayName: options.token, headline: null, avatarUrl: null, badges: ["community"] }
    })
    const a = await loadPublicProfile("alice"), b = await loadPublicProfile("bob")
    expect(a.status === "ready" && a.data?.displayName).toBe("JWT-A")
    expect(b.status === "ready" && b.data?.displayName).toBe("JWT-B")
  })
  it("rejette DTO privé, original élargi et média actif en scheme non admis", () => {
    expect(publicPostSchema.safeParse(post).success).toBe(true)
    expect(publicPostSchema.safeParse({ ...post, authorPersonId: "private" }).success).toBe(false)
    expect(publicPostSchema.safeParse({ ...post, shared: { available: false, body: "private-original" } }).success).toBe(false)
    expect(publicPostSchema.safeParse({ ...post, media: [{ kind: "image", mimeType: "image/png", url: "javascript:alert(1)", withheld: null }] }).success).toBe(false)
  })
  it("accepte chaque motif de retenue renvoyé par la garde des fichiers, et lui seul", () => {
    for (const withheld of ["fileScanPending", "fileScanUnavailable", "fileQuarantined"]) {
      expect(publicPostSchema.safeParse({ ...post, media: [{ kind: "image", mimeType: "image/png", url: null, withheld }] }).success).toBe(true)
    }
    expect(publicPostSchema.safeParse({ ...post, media: [{ kind: "image", mimeType: "image/png", url: null, withheld: "fileScanUnknown" }] }).success).toBe(false)
  })
  it("SU01d : n'admet des échéances légales que des nombres ou « moins de », jamais leur base", () => {
    const period = { periodStart: 0, periodEnd: 86_400_000, legal: { met: 7, missed: null } }
    expect(publicTransparencyDeadlinesSchema.safeParse({ threshold: 5, periods: [period, { ...period, legal: null }] }).success).toBe(true)
    expect(publicTransparencyDeadlinesSchema.safeParse({ threshold: 5, periods: [{ ...period, legal: { ...period.legal, due: 8 } }] }).success).toBe(false)
    expect(publicTransparencyDeadlinesSchema.safeParse({ threshold: 5, periods: [{ ...period, cases: 12 }] }).success).toBe(false)
    expect(publicTransparencyDeadlinesSchema.safeParse({ threshold: 5, periods: [{ ...period, legal: { met: -1, missed: null } }] }).success).toBe(false)
  })
  it("distingue refus métier et panne sans montrer le message du backend", async () => {
    mocks.query.mockImplementation(async (reference) => {
      if (getFunctionName(reference).endsWith(":getBySlug")) return { _id: "root" }
      throw { data: { code: "membershipSuspended", privateReason: "secret" } }
    })
    expect(await loadPublicPost("publication")).toEqual({ status: "refused" })
    expect(publicErrorStatus(new Error("connection unavailable"))).toBe("unavailable")
    const metadata = publicMetadata("Contenu indisponible", "Confirmer la connexion", "/@private", false)
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.openGraph).toBeUndefined()
    expect(metadata.alternates).toBeUndefined()
    expect(JSON.stringify(metadata)).not.toContain("private")
  })
})
