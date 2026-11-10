import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"

import { prepareDemoAccounts, prepareDemoFigurants, targetConfiguration } from "./prepare-demo-content.mjs"

const actors = ["membre", "verifie", "nouveau", "presse", "commercant", "association", "administration", "moderateur"]
const activeActors = actors.filter(actor => actor !== "nouveau")
const cataloguePath = "modules/platform/demoAccounts:catalogue"
const otpPath = "modules/platform/devTools:latestOtp"
const ensurePath = "modules/people/persons:ensureMyPerson"
const personPath = "modules/people/persons:getMyPerson"
const equipPath = "modules/platform/demoAccounts:equipMyDemoAccount"
const figurantCataloguePath = "modules/platform/demoAccounts:figurantCatalogue"
const equipFigurantPath = "modules/platform/demoAccounts:equipMyDemoFigurant"
const figurantSlots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const identities = [...activeActors, ...figurantSlots.map(slot => `figurant-${slot}`)]
const otp = "739162"
const sessionToken = actor => `session-secrete-de-test-${actor}`
const jwtToken = actor => `jwt-secret-de-test-${actor}`
const originalFetch = globalThis.fetch
let consoleSpies

function catalogue() {
  return actors.map(actor => ({
    actor,
    email: `${actor}@demo.antsia.test`,
    profile: actor === "nouveau" ? null : {
      handle: actor === "moderateur" ? "moderation.demo" : `${actor}.demo`,
      displayName: "Personne FICTIVE",
      headline: "Profil de démonstration",
    },
  }))
}

function figurantCatalogue() {
  return figurantSlots.map(slot => ({
    slot,
    email: `figurant-${slot}@demo.antsia.test`,
    profile: { handle: `prenom${slot}.nom.demo`, displayName: "Prénom NOM", headline: "Figurant · Démo" },
  }))
}

beforeEach(() => {
  globalThis.fetch = mock(async () => { throw new Error("Tout accès réseau non simulé est interdit dans ce test.") })
  consoleSpies = ["log", "warn", "error"].map(method => spyOn(console, method).mockImplementation(() => {}))
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const spy of consoleSpies) spy.mockRestore()
})

function transport({ accounts = catalogue(), figurants = figurantCatalogue(), target = "local", person, authFailure } = {}) {
  const config = targetConfiguration(target)
  const requests = []
  const convexResponse = value => Response.json({ status: "success", value })
  const fetchMock = mock(async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const payload = init.body ? JSON.parse(init.body) : undefined
    const headers = new Headers(init.headers)
    // La démo sert son authentification sous /demo : le chemin relatif à la base d'auth est comparé.
    const authPath = url.href.startsWith(`${config.auth}/`) ? `/api/auth${url.href.slice(config.auth.length)}` : null
    const request = { url: url.href, path: payload?.path ?? authPath ?? url.pathname, method: init.method, payload, headers, redirect: init.redirect }
    requests.push(request)

    if (url.origin === config.backend && ["/api/query", "/api/mutation"].includes(url.pathname)) {
      if (payload.path === cataloguePath && url.pathname === "/api/query") return convexResponse(accounts)
      if (payload.path === figurantCataloguePath && url.pathname === "/api/query") return convexResponse(figurants)
      if (payload.path === otpPath && url.pathname === "/api/query") return convexResponse({ code: otp, expiresAt: Date.now() + 60_000 })
      const actor = identities.find(value => headers.get("Authorization") === `Bearer ${jwtToken(value)}`)
      if (!actor) throw new Error("Appel moteur sans le jeton de la session simulée.")
      if (payload.path === ensurePath && url.pathname === "/api/mutation") return convexResponse(null)
      if (payload.path === personPath && url.pathname === "/api/query") {
        const account = accounts.find(value => value.actor === actor) ?? figurants.find(value => `figurant-${value.slot}` === actor)
        return convexResponse(person ? person(account) : { published: true, handle: account.profile.handle, consentsInForce: ["social_profile"] })
      }
      if (payload.path === equipFigurantPath && url.pathname === "/api/mutation") {
        if (actor !== `figurant-${payload.args[0].slot}`) throw new Error("Figurant équipé sous une autre session.")
        return convexResponse({ slot: payload.args[0].slot, status: "declaree" })
      }
      if (payload.path === equipPath && url.pathname === "/api/mutation") {
        return convexResponse({ actor, status: "declaree", role: "membre" })
      }
    }
    if (authPath) {
      if (authPath === authFailure) return Response.json({ token: jwtToken("membre"), otp }, { status: 503 })
      if (authPath === "/api/auth/email-otp/send-verification-otp") return Response.json({ success: true })
      if (authPath === "/api/auth/sign-in/email-otp") {
        if (payload.otp !== otp) throw new Error("Le parcours doit transmettre le code OTP reçu.")
        return Response.json({ token: sessionToken(payload.email.split("@")[0]) })
      }
      if (authPath === "/api/auth/convex/token") {
        const actor = identities.find(value => headers.get("Authorization") === `Bearer ${sessionToken(value)}`)
        if (!actor) throw new Error("Échange sans le jeton de session simulé.")
        return Response.json({ token: jwtToken(actor) })
      }
    }
    throw new Error(`Requête non simulée refusée : ${url.origin}${url.pathname}`)
  })
  globalThis.fetch = fetchMock
  return { requests, fetchMock }
}

describe("cibles de préparation des comptes de démonstration", () => {
  test.each([undefined, "", "production", "prod", "https://example.test"])("refuse la cible %p avant tout appel", async target => {
    expect(() => targetConfiguration(target)).toThrow("Choisir explicitement --target local ou demo.")
    await expect(prepareDemoAccounts(target, { apply: true })).rejects.toThrow("Choisir explicitement --target local ou demo.")
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test.each(["local", "demo"])("le dry-run %s ne fait que lire le catalogue sans auth ni écriture", async target => {
    const accounts = catalogue().reverse()
    const { requests } = transport({ accounts, target })
    const log = mock(() => {})
    await expect(prepareDemoAccounts(target, { log })).resolves.toEqual({
      target,
      actors: accounts.filter(account => account.profile !== null).map(account => account.actor),
      action: "dry-run",
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe(`${targetConfiguration(target).backend}/api/query`)
    expect(requests[0].payload).toEqual({ path: cataloguePath, format: "convex_encoded_json", args: [{}] })
    expect(requests[0].headers.has("Authorization")).toBe(false)
    expect(log).not.toHaveBeenCalled()
  })
})

describe("catalogue fermé avant authentification", () => {
  const invalidCatalogues = [
    ["réponse non tableau", () => null],
    ["catalogue vide en production", () => []],
    ["acteur manquant", accounts => accounts.slice(1)],
    ["neuvième compte", accounts => [...accounts, accounts[0]]],
    ["acteur dupliqué remplaçant un autre", accounts => accounts.map((account, index) => index === 1 ? accounts[0] : account)],
    ["acteur inconnu avec son adresse cohérente", accounts => accounts.map((account, index) => index === 0 ? { ...account, actor: "intrus", email: "intrus@demo.antsia.test" } : account)],
    ["compte nul", accounts => accounts.map((account, index) => index === 0 ? null : account)],
    ["adresse non réservée", accounts => accounts.map((account, index) => index === 0 ? { ...account, email: "membre@example.test" } : account)],
    ["nouveau déjà équipé d’un profil", accounts => accounts.map(account => account.actor === "nouveau" ? { ...account, profile: accounts[0].profile } : account)],
    ["profil actif nul", accounts => accounts.map((account, index) => index === 0 ? { ...account, profile: null } : account)],
    ["profil actif absent", accounts => accounts.map((account, index) => index === 0 ? { actor: account.actor, email: account.email } : account)],
    ["handle inattendu", accounts => accounts.map((account, index) => index === 0 ? { ...account, profile: { ...account.profile, handle: "autre.demo" } } : account)],
    ["handle de modération erroné", accounts => accounts.map(account => account.actor === "moderateur" ? { ...account, profile: { ...account.profile, handle: "moderateur.demo" } } : account)],
    ["nom affiché absent", accounts => accounts.map((account, index) => index === 0 ? { ...account, profile: { handle: account.profile.handle, headline: account.profile.headline } } : account)],
    ["nom affiché vide", accounts => accounts.map((account, index) => index === 0 ? { ...account, profile: { ...account.profile, displayName: " " } } : account)],
    ["présentation non textuelle", accounts => accounts.map((account, index) => index === 0 ? { ...account, profile: { ...account.profile, headline: 42 } } : account)],
  ]

  test.each(invalidCatalogues)("refuse %s avant tout OTP ou mutation", async (_label, alter) => {
    const { requests } = transport({ accounts: alter(catalogue()) })
    const log = mock(() => {})
    await expect(prepareDemoAccounts("local", { apply: true, log })).rejects.toThrow("Le catalogue ne confirme pas les huit comptes fictifs.")
    expect(requests.map(request => request.path)).toEqual([cataloguePath])
    expect(log).not.toHaveBeenCalled()
  })
})

describe("parcours OTP et protection des comptes existants", () => {
  test("conserve le profil publié dont le handle a changé sans l’équiper ni le republier", async () => {
    const { requests } = transport({ person: () => ({ published: true, handle: "identifiant-personnel", consentsInForce: ["social_profile"] }) })
    const log = mock(() => {})
    await expect(prepareDemoAccounts("local", { apply: true, log })).rejects.toThrow("Le compte fictif a changé d’identifiant ; profil conservé.")
    expect(requests.map(request => request.path)).toEqual([
      cataloguePath,
      "/api/auth/email-otp/send-verification-otp",
      otpPath,
      "/api/auth/sign-in/email-otp",
      "/api/auth/convex/token",
      ensurePath,
      personPath,
    ])
    expect(requests.filter(request => request.url.endsWith("/api/mutation")).map(request => request.path)).toEqual([ensurePath])
    expect(log).not.toHaveBeenCalled()
  })

  test("équipe les sept comptes par OTP sans toucher nouveau ni divulguer les secrets dans les sorties", async () => {
    const { requests } = transport({ target: "demo" })
    const report = await prepareDemoAccounts("demo", { apply: true })
    expect(report).toEqual({
      target: "demo",
      accounts: catalogue().filter(account => account.profile !== null).map(account => ({
        actor: account.actor,
        handle: account.profile.handle,
        status: "declaree",
        role: "membre",
      })),
      newcomerPreserved: true,
    })
    expect(requests.filter(request => request.path === equipPath).map(request => request.payload.args[0].actor)).toEqual(activeActors)
    expect(requests.filter(request => request.path === otpPath).map(request => request.payload.args[0].email)).toEqual(activeActors.map(actor => `${actor}@demo.antsia.test`))
    const authRequests = requests.filter(request => request.path.startsWith("/api/auth/"))
    expect(authRequests).toHaveLength(21)
    for (const request of authRequests) {
      expect(request.headers.get("Origin")).toBe(targetConfiguration("demo").origin)
      expect(request.redirect).toBe("error")
    }
    expect(requests.some(request => JSON.stringify(request.payload ?? null).includes("nouveau@demo.antsia.test"))).toBe(false)
    expect(consoleSpies[0].mock.calls).toEqual(activeActors.map(actor => [`Compte démo prêt : ${actor} (declaree)`]))
    expect(consoleSpies[1]).not.toHaveBeenCalled()
    expect(consoleSpies[2]).not.toHaveBeenCalled()
    const output = JSON.stringify({ report, logs: consoleSpies.flatMap(spy => spy.mock.calls) })
    for (const secret of [otp, ...activeActors.flatMap(actor => [sessionToken(actor), jwtToken(actor)])]) expect(output).not.toContain(secret)
  })

  test("l’erreur HTTP d’authentification ne reprend ni corps secret ni jeton et arrête les écritures", async () => {
    const { requests } = transport({ authFailure: "/api/auth/convex/token" })
    const log = mock(() => {})
    let failure
    try {
      await prepareDemoAccounts("local", { apply: true, log })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toBe("Authentification de démonstration refusée (/convex/token, 503).")
    expect(requests.some(request => request.url.endsWith("/api/mutation"))).toBe(false)
    expect(log).not.toHaveBeenCalled()
    const output = JSON.stringify({ error: failure.message, logs: consoleSpies.flatMap(spy => spy.mock.calls) })
    for (const secret of [otp, sessionToken("membre"), jwtToken("membre")]) expect(output).not.toContain(secret)
  })
})

describe("cible de démonstration servie sous /demo", () => {
  test("l'authentification passe par la base /demo du site principal, l'origine reste celle du site", () => {
    expect(targetConfiguration("demo")).toEqual({ origin: "https://antsia.vercel.app", auth: "https://antsia.vercel.app/demo/api/auth", backend: "https://vivid-hedgehog-655.convex.cloud" })
  })
})

describe("figurants : vrai parcours OTP, hors de l'écran de connexion", () => {
  test("équipe les dix figurants sous leur propre session, sans divulguer de secret", async () => {
    const { requests } = transport({ target: "demo" })
    const report = await prepareDemoFigurants("demo", { apply: true })
    expect(report).toEqual({ target: "demo", figurants: figurantCatalogue().map(figurant => ({ slot: figurant.slot, handle: figurant.profile.handle, status: "declaree" })) })
    expect(requests.filter(request => request.path === equipFigurantPath).map(request => request.payload.args[0].slot)).toEqual(figurantSlots)
    const authRequests = requests.filter(request => request.path.startsWith("/api/auth/"))
    expect(authRequests).toHaveLength(30)
    for (const request of authRequests) {
      expect(request.url.startsWith("https://antsia.vercel.app/demo/api/auth/")).toBe(true)
      expect(request.headers.get("Origin")).toBe("https://antsia.vercel.app")
    }
    const output = JSON.stringify({ report, logs: consoleSpies.flatMap(spy => spy.mock.calls) })
    for (const secret of [otp, ...figurantSlots.flatMap(slot => [sessionToken(`figurant-${slot}`), jwtToken(`figurant-${slot}`)])]) expect(output).not.toContain(secret)
  })

  test.each([
    ["catalogue vide", () => []],
    ["figurant manquant", figurants => figurants.slice(1)],
    ["adresse non réservée", figurants => figurants.map((figurant, index) => index === 0 ? { ...figurant, email: "figurant-1@example.test" } : figurant)],
    ["identifiant hors démo", figurants => figurants.map((figurant, index) => index === 0 ? { ...figurant, profile: { ...figurant.profile, handle: "vrai.compte" } } : figurant)],
    ["rang dupliqué", figurants => figurants.map((figurant, index) => index === 1 ? { ...figurants[0] } : figurant)],
  ])("refuse %s avant tout OTP", async (_label, alter) => {
    const { requests } = transport({ figurants: alter(figurantCatalogue()) })
    await expect(prepareDemoFigurants("local", { apply: true })).rejects.toThrow("Le catalogue ne confirme pas les dix figurants fictifs.")
    expect(requests.map(request => request.path)).toEqual([figurantCataloguePath])
  })
})

