// @vitest-environment edge-runtime
/**
 * Cliquet CH-817 E5 — la surface d'authentification est FIGÉE.
 *
 * La garde de la porte des comptes de démonstration, les fermetures et les seaux par adresse visent
 * une liste fixe de chemins (`auth.ts`). Une mise à jour de Better Auth, ou un greffon de plus, qui
 * ajouterait une façon d'obtenir ou de vérifier un code, ou de se connecter, passerait à côté sans
 * bruit. Ce cliquet énumère les routes de l'instance RÉELLE (`createAuth`, tous les greffons, IDN
 * configuré : la surface maximale), jamais une liste écrite à la main, et exige que chacune soit
 * classée dans `AUTH_ROUTE_SURFACE` avec une raison, que chaque ligne ait encore sa route, et que
 * chaque classe soit vraie selon les MÊMES ensembles exportés que lisent les crochets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { freshSessionMiddleware, requestOnlySessionMiddleware, sensitiveSessionMiddleware, sessionMiddleware } from "better-auth/api"

import { testConvex } from "../test.setup"
import {
  AUTH_ROUTE_SURFACE,
  type AuthRateBucket,
  type AuthRouteClassification,
  DEMO_GATED_AUTH_PATHS,
  DISABLED_ROUTE_PATHS,
  isPasswordRequest,
  RL_LOGIN_PATHS,
  RL_OTP_SEND_PATHS,
} from "./auth"

const PRIMARY_ORIGIN = "http://localhost:3030"
type T = ReturnType<typeof testConvex>

function configureIdnFixture() {
  vi.stubEnv("IDN_CLIENT_ID", "sandbox-client-fixture")
  vi.stubEnv("IDN_CLIENT_SECRET", "fictional-idn-secret-for-tests")
  vi.stubEnv("IDN_ISSUER", "https://idn.example.test")
}

beforeEach(() => {
  vi.stubEnv("SITE_URL", PRIMARY_ORIGIN)
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("BETTER_AUTH_SECRET", "fictional-auth-test-secret-at-least-thirty-two-characters")
  for (const key of ["IDN_CLIENT_ID", "IDN_CLIENT_SECRET", "IDN_ISSUER", "IDN_DISCOVERY_URL", "RESEND_API_KEY", "RESEND_FROM_ADDRESS", "SMS_PROVIDER", "SMS_ENDPOINT", "SMS_API_KEY", "TRUSTED_ORIGINS", "AUTH_DEFAULT_LOCALE"]) vi.stubEnv(key, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Une route de l'instance, telle que la voit le routeur better-call. */
type RouteFact = { path: string; methods: string[]; serverOnly: boolean; sessionGuarded: boolean }

/** Les réglages dont dépendent les justifications des routes `public` et des routes désactivées. */
type Conditions = {
  socialProviders: string[]
  sendVerificationEmail: boolean
  autoSignInAfterVerification: boolean
  userChangeEmail: boolean
  userDeleteUser: boolean
  emailOtpChangeEmail: boolean
  emailOtpOverridesVerification: boolean
  emailAndPassword: boolean
}

type EndpointShape = { path?: unknown; options?: { method?: unknown; metadata?: { SERVER_ONLY?: unknown }; use?: unknown[] } }

/** Les routes de l'instance réelle et ses réglages, lus dans une action (comme `auth.test.ts`). */
async function surfaceOf(t: T): Promise<{ routes: RouteFact[]; conditions: Conditions }> {
  return await t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const auth = createAuth(ctx)
    const sessionGuards = new Set<unknown>([sessionMiddleware, freshSessionMiddleware, sensitiveSessionMiddleware, requestOnlySessionMiddleware])
    const routes: RouteFact[] = []
    // `auth.api` est l'ensemble que le routeur reçoit (`getEndpoints` sur les mêmes options). Règle
    // du routeur better-call : un point d'entrée sans chemin n'est jamais routé ; `SERVER_ONLY` non plus.
    for (const endpoint of Object.values(auth.api as unknown as Record<string, EndpointShape>)) {
      if (typeof endpoint.path !== "string") continue
      const method = endpoint.options?.method
      routes.push({
        path: endpoint.path,
        methods: (Array.isArray(method) ? method : [method]).filter((item): item is string => typeof item === "string"),
        serverOnly: endpoint.options?.metadata?.SERVER_ONLY === true,
        sessionGuarded: (endpoint.options?.use ?? []).some((middleware) => sessionGuards.has(middleware)),
      })
    }
    const context = await auth.$context
    const emailOtp = auth.options.plugins?.find((plugin) => plugin.id === "email-otp")
    const emailOtpOptions = (emailOtp && "options" in emailOtp ? emailOtp.options : undefined) as { changeEmail?: { enabled?: boolean }; overrideDefaultEmailVerification?: boolean } | undefined
    const conditions: Conditions = {
      socialProviders: context.socialProviders.map((provider) => provider.id).sort(),
      sendVerificationEmail: typeof context.options.emailVerification?.sendVerificationEmail === "function",
      autoSignInAfterVerification: context.options.emailVerification?.autoSignInAfterVerification === true,
      userChangeEmail: context.options.user?.changeEmail?.enabled === true,
      userDeleteUser: context.options.user?.deleteUser?.enabled === true,
      emailOtpChangeEmail: emailOtpOptions?.changeEmail?.enabled === true,
      emailOtpOverridesVerification: emailOtpOptions?.overrideDefaultEmailVerification === true,
      emailAndPassword: context.options.emailAndPassword?.enabled === true,
    }
    return { routes, conditions }
  })
}

/** Ce que disent les crochets d'un chemin, lu dans les ensembles exportés par `auth.ts`. */
type HookFacts = {
  closedBy: (path: string) => "password" | "routeDisabled" | null
  demoGated: ReadonlySet<string>
  bucketOf: (path: string) => AuthRateBucket | null
  /** Les ensembles qui ne valent que s'ils visent une route vivante (un chemin mort = route renommée). */
  liveOnly: ReadonlyMap<string, ReadonlySet<string>>
}

const HOOKS: HookFacts = {
  closedBy: (path) => (isPasswordRequest({ path }) ? "password" : DISABLED_ROUTE_PATHS.has(path) ? "routeDisabled" : null),
  demoGated: DEMO_GATED_AUTH_PATHS,
  // Miroir du crochet des seaux (`auth.ts`) : il s'applique aux deux ensembles, `auth.otp.send` pour
  // l'envoi, `auth.login` sinon.
  bucketOf: (path) => (RL_OTP_SEND_PATHS.has(path) ? "auth.otp.send" : RL_LOGIN_PATHS.has(path) ? "auth.login" : null),
  // `PASSWORD_PATHS` n'y est pas : il ferme aussi, par précaution, des chemins que cette version ne
  // route pas (`/set-password`, réservé au serveur et sans chemin).
  liveOnly: new Map<string, ReadonlySet<string>>([
    ["DEMO_GATED_AUTH_PATHS", DEMO_GATED_AUTH_PATHS],
    ["RL_LOGIN_PATHS", RL_LOGIN_PATHS],
    ["RL_OTP_SEND_PATHS", RL_OTP_SEND_PATHS],
    ["DISABLED_ROUTE_PATHS", DISABLED_ROUTE_PATHS],
  ]),
}

const SESSIONLESS_KINDS = new Set<AuthRouteClassification["kind"]>(["public", "rateLimited", "demoGated"])

/** Tout écart entre l'instance, la table et les crochets ; vide quand la surface est figée. */
function surfaceFindings(routes: readonly RouteFact[], table: Readonly<Record<string, AuthRouteClassification>>, hooks: HookFacts): string[] {
  const findings: string[] = []
  const live = new Map(routes.map((route) => [route.path, route]))
  const classified = new Map(Object.entries(table))
  for (const route of routes) {
    if (!classified.has(route.path)) findings.push(`${route.path} : route non classée — la classer dans AUTH_ROUTE_SURFACE (convex/betterAuth/auth.ts)`)
  }
  for (const [path, entry] of classified) {
    const route = live.get(path)
    if (!route) {
      findings.push(`${path} : classée mais absente de l'instance — retirer la ligne ou retrouver la route`)
      continue
    }
    if (entry.reason.trim().length < 20) findings.push(`${path} : raison absente ou trop courte`)
    const closedBy = hooks.closedBy(path)
    const declaredClosure = entry.kind === "closed" ? entry.by : null
    if (declaredClosure !== closedBy) findings.push(`${path} : classée ${entry.kind}${declaredClosure ? ` (${declaredClosure})` : ""}, mais les crochets disent ${closedBy ? `fermée (${closedBy})` : "ouverte"}`)
    const gated = hooks.demoGated.has(path)
    if ((entry.kind === "demoGated") !== gated) findings.push(`${path} : classée ${entry.kind}, mais ${gated ? "la garde de la porte la vise (classer demoGated)" : "absente de DEMO_GATED_AUTH_PATHS"}`)
    const bucket = hooks.bucketOf(path)
    const declaredBucket = entry.kind === "demoGated" || entry.kind === "rateLimited" ? entry.bucket : null
    if (declaredBucket !== bucket) findings.push(`${path} : seau déclaré ${declaredBucket ?? "aucun"}, seau des crochets ${bucket ?? "aucun"}`)
    if ((entry.kind === "serverOnly") !== route.serverOnly) findings.push(`${path} : classée ${entry.kind}, mais SERVER_ONLY vaut ${route.serverOnly}`)
    if (entry.kind === "sessionRequired" && entry.guard === "middleware" && !route.sessionGuarded) findings.push(`${path} : session « middleware » déclarée, aucun intergiciel de session sur la route`)
    if (entry.kind === "sessionRequired" && entry.guard === "handler" && route.sessionGuarded) findings.push(`${path} : session « handler » déclarée, mais la route porte un intergiciel de session (déclarer middleware)`)
    if (route.sessionGuarded && SESSIONLESS_KINDS.has(entry.kind)) findings.push(`${path} : classée ${entry.kind}, mais la route exige une session (classer sessionRequired)`)
  }
  for (const [name, paths] of hooks.liveOnly) {
    for (const path of paths) if (!live.has(path)) findings.push(`${name} : ${path} ne vise aucune route de l'instance (crochet mort ou route renommée)`)
  }
  return findings
}

/** Une requête ANONYME au vrai gestionnaire, d'une origine de confiance. */
async function anonymous(t: T, method: string, path: string, body?: Record<string, unknown>) {
  return await t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const headers = new Headers({ Origin: PRIMARY_ORIGIN })
    if (body) headers.set("Content-Type", "application/json")
    const response = await createAuth(ctx, PRIMARY_ORIGIN).handler(new Request(`${PRIMARY_ORIGIN}/api/auth${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }))
    return { status: response.status, tokenHeader: response.headers.get("set-auth-token"), browserCookie: response.headers.has("set-better-auth-cookie") }
  })
}

/**
 * Les routes `sessionRequired` contrôlées DANS le gestionnaire (aucun intergiciel à lire) : la preuve
 * est un appel anonyme valide qui est refusé. Corps minimal qui passe la validation (sinon 400 avant
 * le contrôle de session).
 */
const HANDLER_SESSION_PROBES: Record<string, { method: "GET" | "POST"; path: string; body?: Record<string, unknown>; status: number }> = {
  "/refresh-token": { method: "POST", path: "/refresh-token", body: { providerId: "idn" }, status: 401 },
  "/get-access-token": { method: "POST", path: "/get-access-token", body: { providerId: "idn" }, status: 401 },
  "/account-info": { method: "GET", path: "/account-info", status: 401 },
  // Suppression non activée : 404 avant même le contrôle de session.
  "/delete-user/callback": { method: "GET", path: "/delete-user/callback?token=fictional-delete-token", status: 404 },
}

/** Les routes que le greffon IDN (`generic-oauth`) ajoute quand il est configuré, et elles seules. */
const IDN_ONLY_PATHS = ["/oauth2/callback/:providerId", "/oauth2/link", "/sign-in/oauth2"]

describe("cliquet de la surface d'authentification (CH-817 E5)", () => {
  it("chaque route de l'instance réelle (IDN configuré) est classée, chaque ligne vit, chaque classe est vraie selon les crochets", async () => {
    configureIdnFixture()
    const { routes } = await surfaceOf(testConvex({ automaticSessions: false }))
    // Garde-fou de l'énumération elle-même : une instance vide rendrait le cliquet aveugle.
    expect(routes.length).toBeGreaterThan(40)
    expect(new Set(routes.map((route) => route.path)).size).toBe(routes.length)
    const findings = surfaceFindings(routes, AUTH_ROUTE_SURFACE, HOOKS)
    expect(findings, findings.join("\n")).toEqual([])
  })

  it("sans IDN : rien n'apparaît, seules les routes du greffon OAuth disparaissent, et aucun fournisseur social n'existe", async () => {
    const { routes, conditions } = await surfaceOf(testConvex({ automaticSessions: false }))
    const live = new Set(routes.map((route) => route.path))
    expect(routes.filter((route) => !(route.path in AUTH_ROUTE_SURFACE)).map((route) => route.path)).toEqual([])
    expect(Object.keys(AUTH_ROUTE_SURFACE).filter((path) => !live.has(path)).sort()).toEqual(IDN_ONLY_PATHS)
    expect(conditions.socialProviders).toEqual([])
  })

  it("les justifications tiennent : IDN seul fournisseur social, ni expéditeur de vérification, ni mot de passe, ni changement de courriel, ni suppression", async () => {
    configureIdnFixture()
    const { conditions } = await surfaceOf(testConvex({ automaticSessions: false }))
    expect(conditions).toEqual({
      // `generic-oauth` inscrit IDN parmi les fournisseurs sociaux (Better Auth 1.6) : `/sign-in/social`
      // et `/callback/:id` l'atteignaient hors des crochets d'IDN, d'où leur fermeture (`DISABLED_ROUTE_PATHS`).
      // Un autre fournisseur ajouté ici passerait par d'autres routes encore ouvertes (`/link-social`) :
      // il arrête le cliquet.
      socialProviders: ["idn"],
      sendVerificationEmail: false,
      autoSignInAfterVerification: false,
      userChangeEmail: false,
      userDeleteUser: false,
      emailOtpChangeEmail: false,
      emailOtpOverridesVerification: false,
      emailAndPassword: false,
    })
  })

  it("les routes à session contrôlée dans le gestionnaire refusent l'appel anonyme, sans session émise", async () => {
    configureIdnFixture()
    const handlerGuarded = Object.entries(AUTH_ROUTE_SURFACE).filter(([, entry]) => entry.kind === "sessionRequired" && entry.guard === "handler").map(([path]) => path).sort()
    expect(handlerGuarded, "chaque route « handler » a sa sonde, et réciproquement").toEqual(Object.keys(HANDLER_SESSION_PROBES).sort())
    const t = testConvex({ automaticSessions: false })
    for (const [route, probe] of Object.entries(HANDLER_SESSION_PROBES)) {
      const refusal = await anonymous(t, probe.method, probe.path, probe.body)
      expect(refusal, route).toEqual({ status: probe.status, tokenHeader: null, browserCookie: false })
    }
  })

  it("les routes réservées au serveur ne sont pas routées : 404 en HTTP", async () => {
    configureIdnFixture()
    const t = testConvex({ automaticSessions: false })
    const { routes } = await surfaceOf(t)
    const serverOnly = routes.filter((route) => route.serverOnly)
    expect(serverOnly.map((route) => route.path).sort()).toEqual(Object.entries(AUTH_ROUTE_SURFACE).filter(([, entry]) => entry.kind === "serverOnly").map(([path]) => path).sort())
    for (const route of serverOnly) {
      for (const method of route.methods) expect((await anonymous(t, method, route.path, method === "POST" ? {} : undefined)).status, `${method} ${route.path}`).toBe(404)
    }
  })

  describe("test du test", () => {
    const sessionless = (path: string): RouteFact => ({ path, methods: ["POST"], serverOnly: false, sessionGuarded: false })
    const PUBLIC: AuthRouteClassification = { kind: "public", reason: "Justification de fixture assez longue." }

    it("une route inconnue de la table, et une ligne sans route, sont refusées", () => {
      const findings = surfaceFindings([sessionless("/ok"), sessionless("/email-otp/sign-in-fictional")], { "/ok": PUBLIC, "/vanished-route": PUBLIC }, { ...HOOKS, liveOnly: new Map() })
      expect(findings).toEqual([
        "/email-otp/sign-in-fictional : route non classée — la classer dans AUTH_ROUTE_SURFACE (convex/betterAuth/auth.ts)",
        "/vanished-route : classée mais absente de l'instance — retirer la ligne ou retrouver la route",
      ])
    })

    it("une classe démentie par les ensembles des crochets est refusée", () => {
      const routes = ["/sign-in/email", "/email-otp/check-verification-otp", "/sign-in/email-otp", "/phone-number/verify", "/ok"].map(sessionless)
      const findings = surfaceFindings(routes, {
        // Fermée par le mot de passe, classée publique.
        "/sign-in/email": PUBLIC,
        // Fermée, mais pas par le mécanisme déclaré.
        "/email-otp/check-verification-otp": { kind: "closed", by: "password", reason: "Raison de fixture assez longue." },
        // Gardée par la porte, déclarée seulement comptée.
        "/sign-in/email-otp": { kind: "rateLimited", bucket: "auth.login", reason: "Raison de fixture assez longue." },
        // Mauvais seau.
        "/phone-number/verify": { kind: "rateLimited", bucket: "auth.otp.send", reason: "Raison de fixture assez longue." },
        // Déclarée gardée et comptée alors qu'aucun crochet ne la vise.
        "/ok": { kind: "demoGated", bucket: "auth.login", reason: "Raison de fixture assez longue." },
      }, { ...HOOKS, liveOnly: new Map() })
      expect(findings).toEqual([
        "/sign-in/email : classée public, mais les crochets disent fermée (password)",
        "/email-otp/check-verification-otp : classée closed (password), mais les crochets disent fermée (routeDisabled)",
        "/sign-in/email-otp : classée rateLimited, mais la garde de la porte la vise (classer demoGated)",
        "/phone-number/verify : seau déclaré auth.otp.send, seau des crochets auth.login",
        "/ok : classée demoGated, mais absente de DEMO_GATED_AUTH_PATHS",
        "/ok : seau déclaré auth.login, seau des crochets aucun",
      ])
    })

    it("une session, un SERVER_ONLY, une raison ou un crochet mort démentis sont refusés", () => {
      const routes: RouteFact[] = [
        { path: "/list-sessions", methods: ["GET"], serverOnly: false, sessionGuarded: true },
        { path: "/refresh-token", methods: ["POST"], serverOnly: false, sessionGuarded: false },
        { path: "/convex/rotate-keys", methods: ["POST"], serverOnly: false, sessionGuarded: false },
        sessionless("/error"),
      ]
      const findings = surfaceFindings(routes, {
        "/list-sessions": PUBLIC,
        "/refresh-token": { kind: "sessionRequired", guard: "middleware", reason: "Raison de fixture assez longue." },
        "/convex/rotate-keys": { kind: "serverOnly", reason: "Raison de fixture assez longue." },
        "/error": { kind: "public", reason: "court" },
      }, { ...HOOKS, liveOnly: new Map([["RL_LOGIN_PATHS", new Set(["/sign-in/renamed-otp"])]]) })
      expect(findings).toEqual([
        "/list-sessions : classée public, mais la route exige une session (classer sessionRequired)",
        "/refresh-token : session « middleware » déclarée, aucun intergiciel de session sur la route",
        "/convex/rotate-keys : classée serverOnly, mais SERVER_ONLY vaut false",
        "/error : raison absente ou trop courte",
        "RL_LOGIN_PATHS : /sign-in/renamed-otp ne vise aucune route de l'instance (crochet mort ou route renommée)",
      ])
    })
  })
})
