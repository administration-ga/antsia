/**
 * Harnais convex-test du moteur (patron du socle, `socle/convex/test.setup.ts`).
 *
 * `testConvex()` monte un mock complet du backend câblé sur le schéma RÉEL et
 * les modules de fonctions réels. Les fichiers de test qui l'utilisent
 * déclarent en tête : `// @vitest-environment edge-runtime`.
 *
 * Fichier à deux points dans son nom : ignoré par le bundler de Convex, qui
 * refuserait `import.meta.glob` (piège payé par PRO.GA).
 */
import aggregateTest from "@convex-dev/aggregate/test"
import betterAuthTest from "@convex-dev/better-auth/test"
import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest, type TestConvex } from "convex-test"

import { NETWORK_FEATURES, type NetworkFeature } from "@antsia/social-domain/networkFeatures"

import { api, components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

// `import.meta.glob` est une primitive de Vite (vitest), remplacée au transform.
// Son type arrive par `@convex-dev/rate-limiter/test`, dont la référence
// `vite/client` augmente `ImportMeta` pour tout le programme : ne PAS le
// redéclarer ici (TS2717, piège déjà relevé au socle).

// Glob PARESSEUX de tous les modules de fonctions, plus les `.js` de
// `_generated/` (que convex-test exige pour situer la racine) ; tests, réglages
// et déclarations de types restent dehors — exactement ce que le bundler de
// Convex déploie. Un module n'est importé que si un test l'appelle.
// ⚠️ Forme TABLEAU avec exclusions « ! » : la négation extglob `!(…)` ne
// correspond à RIEN avec le glob de Vite (mesuré : zéro module, harnais muet).
// Référence littérale obligatoire (Vite la remplace statiquement).
export const modules = import.meta.glob([
  "./**/*.ts",
  "./_generated/*.js",
  "!./**/*.test.ts",
  "!./**/*.setup.ts",
  "!./**/*.d.ts",
  "!./vitest.config.ts",
])

/**
 * Instancie un backend Convex mocké contre le schéma et les modules réels, avec
 * le VRAI limiteur de débit et les VRAIS agrégats (composants montés) : les
 * tests exercent les seuils et les décomptes, ils ne les neutralisent pas.
 */
type BackendTest = TestConvex<typeof schema>

const TEST_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Une vraie ligne du composant, utilisable avec un claim `sessionId` explicite. */
export async function createTestSession(t: BackendTest, userId: string, expiresAt = Date.now() + TEST_SESSION_TTL_MS): Promise<string> {
  const now = Date.now()
  const session: unknown = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: { userId, expiresAt, token: `test-session-${crypto.randomUUID()}`, createdAt: now, updatedAt: now },
    },
  })
  if (typeof session !== "object" || session === null || !("_id" in session) || typeof session._id !== "string") {
    throw new Error("Le composant Better Auth n'a pas créé la session de test")
  }
  return session._id
}

/**
 * Revue CH-815 F3 — la clé, au catalogue, de la console du moteur (`operator_console`) : la seule
 * application dont une session IDN ouvre la console.
 */
export const OPERATOR_CONSOLE_APPLICATION = "admin_antsia_ga"

/**
 * ADR-0042 (CH-815) — la clé, au catalogue réel (`deploy/catalog.json`), de l'application qui administre
 * DIASPORA.GA (`administers_network: "diaspora-ga"`).
 */
export const NETWORK_ADMIN_APPLICATION = "admin_diaspora_ga"

/**
 * Fixture explicite PA7 : vraie session, compte IDN, preuve interne et lien vivant. Revue CH-815 F3 :
 * la preuve est scellée pour la console (`application`, par défaut `OPERATOR_CONSOLE_APPLICATION`) ;
 * une autre application, ou `null` (preuve d'avant ADR-0042), n'ouvre pas la console : son accès
 * n'est alors pas journalisé.
 */
export async function createTestOperatorProof(
  t: BackendTest,
  as: ReturnType<BackendTest["withIdentity"]>,
  personId: Id<"persons">,
  loa: 1 | 2 | 3 = 2,
  { application = OPERATOR_CONSOLE_APPLICATION }: { application?: string | null } = {},
): Promise<void> {
  await sealTestIdnSession(t, as, personId, loa, application ?? undefined)
  if (loa >= 2 && application === OPERATOR_CONSOLE_APPLICATION) await as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
}

/**
 * ADR-0042 — fixture explicite de l'administrateur d'un réseau : vraie session, compte IDN, preuve
 * interne SCELLÉE pour l'application qui administre le réseau (`administers_network` au catalogue ;
 * par défaut celle de DIASPORA.GA), lien vivant, puis l'accès d'administration journalisé
 * (`networks.adminAccess.recordAccess`), sauf `logged: false`. Le rôle `network_admin` est posé
 * par l'appelant : la fixture ne donne aucun droit, elle ne prouve que la session.
 */
export async function createTestNetworkAdminProof(
  t: BackendTest,
  as: ReturnType<BackendTest["withIdentity"]>,
  personId: Id<"persons">,
  networkId: Id<"networks">,
  { application = NETWORK_ADMIN_APPLICATION, loa = 2, logged = true }: { application?: string; loa?: 1 | 2 | 3; logged?: boolean } = {},
): Promise<void> {
  await sealTestIdnSession(t, as, personId, loa, application)
  if (logged) await as.mutation(api.modules.networks.adminAccess.recordAccess, { networkId })
}

/**
 * ADR-0042 (CH-815, lot A6) — une SECONDE session de la personne de `as`, ouverte par le retour IDN
 * de l'application d'administration du réseau (`createTestNetworkAdminProof`, mêmes options), et
 * rendue comme une nouvelle identité : la session de `as` reste celle de l'application des membres,
 * non scellée. `expiresAt` borne la nouvelle session (et donc sa preuve). Le rôle est posé par
 * l'appelant ; `logged: false` pour une personne qui n'administre pas le réseau (`recordAccess` la
 * refuserait).
 */
export async function openTestNetworkAdminSession(
  t: BackendTest,
  as: ReturnType<BackendTest["withIdentity"]>,
  personId: Id<"persons">,
  networkId: Id<"networks">,
  { expiresAt, ...options }: { application?: string; loa?: 1 | 2 | 3; logged?: boolean; expiresAt?: number } = {},
): Promise<ReturnType<BackendTest["withIdentity"]>> {
  const identity = await as.run(async (ctx) => ctx.auth.getUserIdentity())
  if (!identity) throw new Error("Identité de fixture absente")
  const sessionId = await createTestSession(t, identity.subject, expiresAt)
  const admin = t.withIdentity({ subject: identity.subject, sessionId })
  await createTestNetworkAdminProof(t, admin, personId, networkId, options)
  return admin
}

/** Le retour IDN de la session de `as` : compte IDN, preuve du sujet, lien vivant, preuve de session (pour `application`, si elle est donnée). */
async function sealTestIdnSession(t: BackendTest, as: ReturnType<BackendTest["withIdentity"]>, personId: Id<"persons">, loa: 1 | 2 | 3, application?: string): Promise<void> {
  const identity = await as.run(async (ctx) => ctx.auth.getUserIdentity())
  if (!identity || typeof identity.sessionId !== "string") throw new Error("Session de fixture IDN absente")
  const idnSubject = "idn-operator-fixture-" + personId
  const now = Date.now()
  const accounts = await t.query(components.betterAuth.adapter.findMany, { model: "account", where: [{ field: "userId", value: identity.subject }, { field: "providerId", value: "idn" }], paginationOpts: { cursor: null, numItems: 2 } })
  const subject = accounts.page[0]?.accountId ?? idnSubject
  if (!accounts.page.length) await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: identity.subject, providerId: "idn", accountId: subject, createdAt: now, updatedAt: now } } })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject, loa })
  await t.run(async (ctx) => {
    const existing = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "idn")).unique()
    if (existing) await ctx.db.patch(existing._id, { subject, loa, revokedAt: undefined, linkedAt: now })
    else await ctx.db.insert("identityLinks", { personId, provider: "idn", subject, loa, linkedAt: now })
  })
  await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId: identity.sessionId, authUserId: identity.subject, idnSubject: subject, loa, ...(application ? { application } : {}) })
}

/**
 * ADR-0041 — ouvre les fonctionnalités d'un réseau gouverné (toutes par défaut), comme si son
 * administrateur l'avait décidé : les tests d'une fonctionnalité de la tranche l'exercent ouverte.
 * La graine, elle, n'ouvre rien ; la fermeture se prouve dans `modules/networks/features.test.ts`.
 */
export async function openNetworkFeatures(t: BackendTest, networkId: Id<"networks">, features: readonly NetworkFeature[] = NETWORK_FEATURES): Promise<void> {
  await t.run(async (ctx) => {
    const now = Date.now()
    for (const feature of features) {
      const row = await ctx.db.query("networkFeatures").withIndex("by_network_feature", (q) => q.eq("networkId", networkId).eq("feature", feature)).first()
      if (row) await ctx.db.patch(row._id, { enabled: true, updatedAt: now })
      else await ctx.db.insert("networkFeatures", { networkId, feature, enabled: true, updatedAt: now })
    }
  })
}

/**
 * Les fixtures sociales antérieures à PA4 donnent seulement un `subject`.
 * Leur session est provisionnée une seule fois, dans le VRAI composant,
 * avant la première exécution. Une session supprimée n'est jamais recréée.
 * Les tests de sécurité utilisent `automaticSessions: false` ou un claim
 * explicite : aucune correction de leurs identités n'est alors faite.
 */
export function testConvex({ automaticSessions = true }: { automaticSessions?: boolean } = {}) {
  const t = convexTest(schema, modules)
  betterAuthTest.register(t, "betterAuth")
  rateLimiterTest.register(t, "rateLimiter")
  aggregateTest.register(t, "followerCounts")
  aggregateTest.register(t, "engineCounters")
  if (!automaticSessions) return t

  const sessions = new Map<string, Promise<string>>()
  return new Proxy(t, {
    get(target, property, receiver) {
      if (property !== "withIdentity") return Reflect.get(target, property, receiver)
      return (identity: Parameters<typeof t.withIdentity>[0]): ReturnType<typeof t.withIdentity> => {
        const raw = t.withIdentity(identity)
        if ("sessionId" in identity) return raw

        let authenticated: Promise<ReturnType<typeof t.withIdentity>> | undefined
        const withSession = () => authenticated ??= (async () => {
          const resolved = await raw.run(async (ctx) => ctx.auth.getUserIdentity())
          if (!resolved) throw new Error("Identité de test absente")
          let session = sessions.get(resolved.subject)
          if (!session) {
            session = createTestSession(t, resolved.subject)
            sessions.set(resolved.subject, session)
          }
          return t.withIdentity({ ...resolved, sessionId: await session })
        })()

        return new Proxy(raw, {
          get(accessor, method, accessorReceiver) {
            if (!["query", "mutation", "action", "run", "fetch"].includes(String(method))) {
              return Reflect.get(accessor, method, accessorReceiver)
            }
            return async (...args: unknown[]) => {
              const ready = await withSession()
              return Reflect.apply(Reflect.get(ready, method), ready, args)
            }
          },
        })
      }
    },
  })
}
