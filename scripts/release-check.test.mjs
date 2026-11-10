import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { main, parseCheckArgs } from "./release-check.mjs"
import { productionCsp } from "./release/fixtures.mjs"
import { KEY_ROUTES } from "./release/targets.mjs"

const SHA = "0123456789abcdef0123456789abcdef01234567"
const SHA12 = SHA.slice(0, 12)
const TARGETS = Object.freeze({
  ANTSIA_RELEASE_CONVEX_DEMO: "exemple-demo",
  ANTSIA_RELEASE_CONVEX_PROD: "exemple-production",
  ANTSIA_RELEASE_SITE_ORIGIN: "https://site.exemple.test",
  ANTSIA_RELEASE_CONSOLE_ORIGIN: "https://console.exemple.test",
  ANTSIA_RELEASE_VERCEL_TEAM: "exemple-equipe",
  ANTSIA_RELEASE_VERCEL_PROJECT_MAIN: "exemple-projet-principal",
  ANTSIA_RELEASE_VERCEL_PROJECT_CONSOLE: "exemple-projet-console",
})
const REPOS = Object.freeze({ antsia: "/depot-fictif/ECOSYSTEMES/ANTSIA", diasporale: "/depot-fictif/ECOSYSTEMES/DIASPORALE" })
const originalFetch = globalThis.fetch
let env

beforeEach(() => {
  env = { ...TARGETS, ANTSIA_RELEASE_HOME: mkdtempSync(join(tmpdir(), "controle-antsia-")) }
  globalThis.fetch = mock(async () => { throw new Error("Tout accès réseau non simulé est interdit dans ce test.") })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

const healthBody = (version, engineState = "reachable") => JSON.stringify({ status: engineState === "reachable" ? "ok" : "degraded", application: "antsia-ga", version, backend: "configured", engine: { state: engineState, version: "moteur-1", latencyMs: 25 } })

/** Le site public simulé : versions, moteurs de CSP et statut d'une route paramétrables. */
function publicSite({ version = `main-${SHA12}-production`, demoVersion = `main-${SHA12}-demo`, engine = "exemple-production", demoEngine = "exemple-demo", broken = null } = {}) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    const { origin, pathname } = new URL(url)
    if (origin !== "https://site.exemple.test" && origin !== "https://console.exemple.test") throw new Error(`réseau non simulé : ${url}`)
    const demo = pathname.startsWith("/demo")
    if (pathname === broken) return new Response("", { status: 500 })
    if (pathname.endsWith("/api/sante-fonctionnelle")) return new Response(healthBody(demo ? demoVersion : version), { headers: { "content-type": "application/json" } })
    return new Response("<!doctype html>", { headers: { "content-security-policy": productionCsp(demo ? demoEngine : engine) } })
  }
  return { fetch: fetchImpl, calls }
}

function fakeRunner(handler = () => ({})) {
  const calls = []
  return { calls, run: (spec) => { calls.push(spec); return { status: 0, stdout: "", stderr: "", ...handler(spec) } } }
}

async function check(args, { fetch = publicSite().fetch, run = fakeRunner().run, environment = env } = {}) {
  const out = []
  const err = []
  const code = await main(args, { env: environment, fetch, run, repos: REPOS, log: (line) => out.push(line), error: (line) => err.push(line) })
  return { code, out: out.join("\n"), err: err.join("\n") }
}

describe("contrôle après coup : lecture seule, rien sans --execute", () => {
  test("le plan liste les requêtes sans en lancer aucune", async () => {
    const site = publicSite()
    const { run, calls } = fakeRunner()
    const { code, out } = await check([SHA, "--cible", "principal"], { fetch: site.fetch, run })
    expect(code).toBe(0)
    expect(site.calls).toEqual([])
    expect(calls).toEqual([])
    expect(out).toContain("GET https://site.exemple.test/api/sante-fonctionnelle")
    expect(out).toContain("GET https://site.exemple.test/demo/entrer")
    expect(out).toContain("Rien n'est parti")
  })

  test("arguments : cible connue, --prive réservé aux sites, SHA complet", async () => {
    expect(() => parseCheckArgs([SHA, "--cible", "tout"])).toThrow("--cible attendue")
    expect(() => parseCheckArgs([SHA, "--cible", "moteur-demo", "--prive"])).toThrow("--prive ne vaut que pour un site")
    expect((await check(["main", "--cible", "principal", "--execute"])).code).toBe(2)
  })

  test("variable absente : refus nommé, aucune requête", async () => {
    const site = publicSite()
    const { ANTSIA_RELEASE_CONVEX_DEMO: _absent, ...partial } = env
    const { code, err } = await check([SHA, "--cible", "principal", "--execute"], { fetch: site.fetch, environment: partial })
    expect(code).toBe(1)
    expect(err).toContain("variable ANTSIA_RELEASE_CONVEX_DEMO absente")
    expect(site.calls).toEqual([])
  })
})

describe("sites en public", () => {
  test("version servie, CSP de chaque zone sur son seul moteur, routes clés en 200 : aucun défaut", async () => {
    const site = publicSite()
    const { code, out } = await check([SHA, "--cible", "principal", "--execute"], { fetch: site.fetch })
    expect(code).toBe(0)
    expect(out).toContain("✓ principal : aucun défaut")
    expect(site.calls).toEqual(expect.arrayContaining([...KEY_ROUTES.principal.map((route) => `https://site.exemple.test${route}`), ...KEY_ROUTES.demo.map((route) => `https://site.exemple.test/demo${route}`)]))
  })

  test("signale une version fausse", async () => {
    const { code, err } = await check([SHA, "--cible", "principal", "--execute"], { fetch: publicSite({ version: "main-ffffffffffff-production" }).fetch })
    expect(code).toBe(1)
    expect(err).toContain("principal : santé : version servie « main-ffffffffffff-production », attendue « main-0123456789ab-production »")
  })

  test("signale la CSP du mauvais moteur (la démo ouverte au moteur de production)", async () => {
    const { code, err } = await check([SHA, "--cible", "principal", "--execute"], { fetch: publicSite({ demoEngine: "exemple-production" }).fetch })
    expect(code).toBe(1)
    expect(err).toContain("demo : CSP : CSP ouverte à un autre moteur : exemple-production")
  })

  test("signale une route clé en erreur", async () => {
    const { code, err } = await check([SHA, "--cible", "principal", "--execute"], { fetch: publicSite({ broken: "/transparence" }).fetch })
    expect(code).toBe(1)
    expect(err).toContain("principal : routes : route /transparence : HTTP 500 (attendu 200)")
  })

  test("la console : sa version et le moteur de production", async () => {
    const good = await check([SHA, "--cible", "console", "--execute"], { fetch: publicSite({ version: `main-${SHA12}-console` }).fetch })
    expect(good.code).toBe(0)
    const wrong = await check([SHA, "--cible", "console", "--execute", "--etiquette", "commit"], { fetch: publicSite({ version: `main-${SHA12}-console` }).fetch })
    expect(wrong.err).toContain(`attendue « commit-${SHA12}-console »`)
  })
})

describe("site en privé, avant promotion", () => {
  test("passe par la commande privée de l'hébergeur, sur le déploiement nommé", async () => {
    const { run, calls } = fakeRunner((spec) => {
      const path = spec.args[1]
      const demo = path.startsWith("/demo")
      if (path.endsWith("/api/sante-fonctionnelle")) return { stdout: `HTTP/2 200 \r\ncontent-type: application/json\r\n\r\n${healthBody(`main-${SHA12}-${demo ? "demo" : "production"}`)}` }
      return { stdout: `HTTP/2 200 \r\ncontent-security-policy: ${productionCsp(demo ? "exemple-demo" : "exemple-production")}\r\n\r\n<!doctype html>` }
    })
    const site = publicSite()
    const { code } = await check([SHA, "--cible", "principal", "--prive", "--deploiement", "dpl_exemple", "--execute"], { run, fetch: site.fetch })
    expect(code).toBe(0)
    expect(site.calls).toEqual([])
    expect(calls.every((spec) => spec.program === "vercel" && spec.args[0] === "curl" && spec.args[3] === "dpl_exemple")).toBe(true)
    expect(calls[0].env).toEqual({ VERCEL_ORG_ID: "exemple-equipe", VERCEL_PROJECT_ID: "exemple-projet-principal" })
  })
})

describe("moteurs : API servie comparée à celle du commit publié", () => {
  const fn = (identifier) => ({ identifier, functionType: "Query", visibility: { kind: "public" }, args: {}, returns: { type: "any" } })
  const reference = { url: "http://127.0.0.1:3210", functions: [fn("health.js:ping"), fn("modules/posts/feed.js:list")] }

  test("même API : aucun défaut ; relevé par le lanceur Convex, cible imposée", async () => {
    const file = join(env.ANTSIA_RELEASE_HOME, "reference.json")
    writeFileSync(file, JSON.stringify(reference))
    const { run, calls } = fakeRunner(() => ({ stdout: `[convex-dev] Node v22\n${JSON.stringify({ functions: [...reference.functions].reverse() })}` }))
    const { code } = await check([SHA, "--cible", "moteur-production", "--api-reference", file, "--execute"], { run })
    expect(code).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual(["scripts/convex-dev.mjs", "function-spec"])
    expect(calls[0].env).toEqual({ CONVEX_DEPLOYMENT: "prod:exemple-production" })
  })

  test("API différente : défaut nommé", async () => {
    const file = join(env.ANTSIA_RELEASE_HOME, "reference.json")
    writeFileSync(file, JSON.stringify(reference))
    const { run } = fakeRunner(() => ({ stdout: JSON.stringify({ functions: [fn("health.js:ping")] }) }))
    const { code, err } = await check([SHA, "--cible", "moteur-demo", "--api-reference", file, "--execute"], { run })
    expect(code).toBe(1)
    expect(err).toContain("API servie différente de celle du commit publié (0 en plus, 1 manquantes, 0 signatures différentes) : modules/posts/feed.js:list")
  })

  test("sans référence (ni fichier ni manifeste), le contrôle s'arrête", async () => {
    const { run, calls } = fakeRunner()
    const { code, err } = await check([SHA, "--cible", "moteur-demo", "--execute"], { run })
    expect(code).toBe(1)
    expect(err).toContain("référence absente")
    expect(calls).toEqual([])
  })
})
