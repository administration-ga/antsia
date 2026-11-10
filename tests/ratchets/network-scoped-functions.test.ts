import { NETWORK_SLICES } from "@antsia/social-domain/network"
import { describe, expect, it } from "vitest"

import { detectUnscopedFunctions } from "./lib/detectors"
import { type Finding, formatFindings, isTestFile, listFiles, readRepoFile } from "./lib/source-files"

/**
 * Dossiers des MODULES SOCIAUX du moteur. Toute fonction publique qui y vit doit
 * être bornée par le réseau : constructeur `networkQuery`/`networkMutation`, ou
 * `requireMembership(ctx, args.networkId, …)` explicite avec `networkId` en
 * argument, ou projection publique allowlistée (`@publicProjection <raison>`).
 *
 * Actif depuis PA2 (networks, people) ; la liste s'étend à chaque module posé
 * (PA3 : tous les modules dupliqués). Un module absent des deux listes est
 * lui-même un défaut (test ci-dessous). Les TRANCHES d'application
 * (`NETWORK_SLICES` : `convex/modules/diaspora`, écrite par la session
 * DIASPORALE) sont sociales, classées avant même d'exister.
 */
export const SOCIAL_MODULE_DIRECTORIES: readonly string[] = [
  "convex/modules/networks",
  "convex/modules/people",
  "convex/modules/posts",
  "convex/modules/public",
  "convex/modules/discovery",
  "convex/modules/engagement",
  "convex/modules/media",
  "convex/modules/graph",
  "convex/modules/notifications",
  "convex/modules/thematicGroups",
  "convex/modules/marks",
  "convex/modules/moderation",
  "convex/modules/messaging",
  "convex/modules/commercialMessaging",
  // CC-2b (ADR-0025) : conversations contextuelles, ouvertes et fermées par un objet déjà accepté.
  "convex/modules/contextualMessaging",
  "convex/modules/groups",
  "convex/modules/events",
  "convex/modules/stories",
  "convex/modules/suggestions",
  "convex/modules/pages",
  "convex/modules/shops",
  "convex/modules/professionals",
  "convex/modules/personalMeetings",
  "convex/modules/editorial",
  "convex/modules/albums",
  "convex/modules/calls",
  "convex/modules/live",
  "convex/modules/diaspora",
]

/**
 * Modules du moteur qui ne sont PAS sociaux (aucun contenu, aucune adhésion) :
 * `files` est l'infrastructure de garde des fichiers — ses lectures publiques
 * sont bornées une à une (réseau, déposant, modérateur, opérateur).
 * `federation` garde le transport système : émetteurs/receipts/DLQ réservés
 * aux opérateurs, inbox HMAC avec réseau issu du registre serveur et admission
 * AST contrôlée par rate-limited-writes. PA9C ajoute agents.ts exclusivement
 * personQuery/personMutation @selfScoped ; les handlers vérifient le grant,
 * l'identité, les réseaux/source et les pages avant tout effet social.
 */
export const NON_SOCIAL_MODULE_DIRECTORIES: readonly string[] = ["convex/modules/platform", "convex/modules/files", "convex/modules/federation"]

describe("network-scoped-functions — toute fonction sociale est bornée par le réseau (R10)", () => {
  it("chaque fonction publique des modules sociaux exige un réseau et une adhésion", () => {
    const findings: Finding[] = []
    for (const file of listFiles([...SOCIAL_MODULE_DIRECTORIES], [".ts"])) {
      if (isTestFile(file)) continue
      findings.push(...detectUnscopedFunctions(file, readRepoFile(file)))
    }
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("chaque tranche qui peut gouverner un réseau est un module social classé", () => {
    expect(NETWORK_SLICES.map((slice) => `convex/modules/${slice}`).filter((module) => !SOCIAL_MODULE_DIRECTORIES.includes(module))).toEqual([])
  })

  it("chaque module du moteur est classé (social ou non) : aucun n'échappe au cliquet", () => {
    const modules = new Set(listFiles(["convex/modules"], [".ts"]).map((file) => file.split("/").slice(0, 3).join("/")))
    const classified = new Set([...SOCIAL_MODULE_DIRECTORIES, ...NON_SOCIAL_MODULE_DIRECTORIES])
    expect([...modules].filter((module) => !classified.has(module))).toEqual([])
  })

  it("test du test : une fonction publique non bornée est refusée, une bornée passe", () => {
    const source = [
      'export const leak = query({ args: { postId: v.id("posts") }, handler: async (ctx, args) => ctx.db.get(args.postId) })',
      "export const ok = query({",
      '  args: { networkId: v.id("networks") },',
      "  handler: async (ctx, args) => { await requireMembership(ctx, args.networkId, \"declaree\"); return null },",
      "})",
      "export const scoped = networkQuery({ args: {}, handler: async () => null })",
      "export const hidden = internalQuery({ args: {}, handler: async () => null })",
      "/** @publicProjection page Officiel lisible sans compte (arbitrage A4) */",
      "export const officialPage = query({ args: {}, handler: async () => null })",
      "/** @selfScoped la personne appelante règle ses propres consentements */",
      "export const mine = personMutation({ args: {}, handler: async () => null })",
      "/** @selfScoped trop court */",
      "export const shortReason = personQuery({ args: {}, handler: async () => null })",
      "export const console = operatorMutation({ args: {}, handler: async () => null })",
    ].join("\n")
    const findings = detectUnscopedFunctions("convex/modules/posts/posts.ts", source)
    expect(findings.map((finding) => finding.line)).toEqual([1, 13])
  })

  it("test du test : imports renommés et exports locaux restent gardés ; citer une garde ne suffit pas", () => {
    const source = [
      'import { query as read } from "../../_generated/server"',
      'import { networkQuery as scoped, requireMembership as membership } from "../../lib/functions"',
      'export const aliasLeak = read({ args: {}, handler: async () => null })',
      'const localLeak = read({ args: {}, handler: async () => null })',
      'export { localLeak as separatedLeak }',
      'export const copiedLeak = localLeak',
      'export const fakeGuard = read({ args: { networkId: v.id("networks") }, handler: async () => { /* requireMembership(ctx, id) */ return "requireMembership(" } })',
      'export const wrongNetwork = read({ args: { networkId: v.id("networks") }, handler: async (ctx, args) => { await membership(ctx, args.otherId, "declaree"); return null } })',
      'export const unawaited = read({ args: { networkId: v.id("networks") }, handler: async (ctx, args) => { membership(ctx, args.networkId, "declaree"); return null } })',
      'export const nestedOnly = read({ args: { networkId: v.id("networks") }, handler: async (ctx, args) => { const ignored = async () => { await membership(ctx, args.networkId, "declaree") }; return null } })',
      'export const scopedAlias = scoped({ args: {}, handler: async () => null })',
      'const localOk = read({ args: { networkId: v.id("networks") }, handler: async (ctx, args) => { await membership(ctx, args.networkId, "declaree"); return null } })',
      'export { localOk as separatedOk }',
      'const hidden = read({ args: {}, handler: async () => null })',
    ].join("\n")
    const findings = detectUnscopedFunctions("convex/modules/posts/fixture.ts", source)
    expect(findings.map((finding) => finding.message.match(/« (.*?) »/)?.[1])).toEqual(["aliasLeak", "separatedLeak", "copiedLeak", "fakeGuard", "wrongNetwork", "unawaited", "nestedOnly"])
  })
})
