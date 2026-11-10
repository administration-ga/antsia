import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { main, parseArgs } from "./release.mjs"
import { apiFingerprint } from "./release/api-spec.mjs"
import { childEnv, formatCommand } from "./release/command.mjs"
import { describeItems } from "./release/executor.mjs"
import { vercelHost } from "./release/hosts/vercel.mjs"
import { readManifest, writeManifest } from "./release/manifest.mjs"
import { ALTERNATIVE_STEPS, RELEASE_ORDER, ROLLBACK_STEPS, createSteps, initialState } from "./release/steps.mjs"
import { KEY_ROUTES } from "./release/targets.mjs"
import { productionCsp } from "./release/fixtures.mjs"

const SHA = "0123456789abcdef0123456789abcdef01234567"
const SHA12 = SHA.slice(0, 12)
const DIASPORALE_COMMIT = "d".repeat(40)
/** Valeurs manifestement fictives : aucun identifiant réel dans le dépôt (cliquet no-deployment-identifiers). */
const TARGETS = Object.freeze({
  ANTSIA_RELEASE_CONVEX_DEMO: "exemple-demo",
  ANTSIA_RELEASE_CONVEX_PROD: "exemple-production",
  ANTSIA_RELEASE_SITE_ORIGIN: "https://site.exemple.test",
  ANTSIA_RELEASE_DEMO_CHILD_ORIGIN: "https://enfant.exemple.test",
  ANTSIA_RELEASE_CONSOLE_ORIGIN: "https://console.exemple.test",
  ANTSIA_RELEASE_VERCEL_TEAM: "exemple-equipe",
  ANTSIA_RELEASE_VERCEL_PROJECT_DEMO: "exemple-projet-demo",
  ANTSIA_RELEASE_VERCEL_PROJECT_MAIN: "exemple-projet-principal",
  ANTSIA_RELEASE_VERCEL_PROJECT_CONSOLE: "exemple-projet-console",
})
const REPOS = Object.freeze({ antsia: "/depot-fictif/ECOSYSTEMES/ANTSIA", diasporale: "/depot-fictif/ECOSYSTEMES/DIASPORALE" })
const originalFetch = globalThis.fetch

let home
let env

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "publication-antsia-"))
  env = { ...TARGETS, ANTSIA_RELEASE_HOME: home }
  globalThis.fetch = mock(async () => { throw new Error("Tout accès réseau non simulé est interdit dans ce test.") })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

const fn = (identifier, returns = { type: "any" }) => ({ identifier, functionType: "Query", visibility: { kind: "public" }, args: { type: "object", value: {} }, returns })
const CANDIDATE = { url: "http://127.0.0.1:3210", functions: [fn("health.js:ping"), fn("modules/posts/feed.js:list"), fn("modules/posts/feed.js:nouvelle")] }
const ONLINE_BEFORE = { functions: [fn("health.js:ping"), fn("modules/posts/feed.js:list")] }
const specOutput = (document) => `[convex-dev] Node v22.22.0 en tête du PATH de \`convex function-spec\` pour le backend local (actions « use node »).\n${JSON.stringify(document, null, 2)}\n`

/** Lanceur simulé : consigne chaque commande, répond par `handler`, n'exécute rien. */
function fakeRunner(handler = () => ({})) {
  const calls = []
  const run = (spec) => {
    calls.push(spec)
    return { status: 0, stdout: "", stderr: "", ...handler(spec, calls) }
  }
  return { run, calls }
}

/** `fetch` simulé : une table d'adresses ; toute autre adresse lève. */
function fakeFetch(answer) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    const response = answer(url)
    if (!response) throw new Error(`réseau non simulé : ${url}`)
    return new Response(response.body ?? "", { status: response.status ?? 200, headers: response.headers ?? {} })
  }
  return { fetch: fetchImpl, calls }
}

async function cli(args, { run = fakeRunner().run, fetch = fakeFetch(() => null).fetch, environment = env } = {}) {
  const out = []
  const err = []
  const code = await main(args, { env: environment, run, fetch, repos: REPOS, log: (line) => out.push(line), error: (line) => err.push(line), now: () => new Date("2026-11-10T10:00:00.000Z") })
  return { code, out: out.join("\n"), err: err.join("\n") }
}

const done = (extra = {}) => ({ status: "fait", finishedAt: "2026-11-10T09:00:00.000Z", ...extra })
const EXPORT_DONE = done({ inMain: true, diasporaleCommit: DIASPORALE_COMMIT, sourceFingerprint: "e".repeat(64), sourceFiles: 3 })

function seedManifest(steps, { candidate = CANDIDATE, publication = SHA12 } = {}) {
  const dir = join(home, publication)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "api-candidat.json"), JSON.stringify(candidate))
  writeManifest(join(dir, "manifeste.json"), {
    version: 1,
    sha: SHA,
    host: "vercel",
    createdAt: "2026-11-10T08:00:00.000Z",
    steps,
    candidate: { fingerprint: apiFingerprint(candidate), functions: candidate.functions.length, file: "api-candidat.json" },
  })
  return dir
}

const manifestNow = (publication = SHA12) => readManifest(join(home, publication, "manifeste.json"))
const confirm = (stepId) => ["--execute", "--confirmer", `${stepId}@${SHA12}`]
const line = (spec) => formatCommand(spec)

describe("plan d'un commit : la méthode pas à pas, rien ne part", () => {
  test("les dix-sept étapes dans l'ordre invariable, sans aucune commande ni requête", async () => {
    const { run, calls } = fakeRunner()
    const network = fakeFetch(() => null)
    const { code, out } = await cli(["plan", SHA], { run, fetch: network.fetch })
    expect(code).toBe(0)
    expect(calls).toEqual([])
    expect(network.calls).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
    const numbered = [...out.matchAll(/^(\d+)\. (\S+) — /gm)].map((match) => match[2])
    expect(numbered).toEqual([...RELEASE_ORDER])
    expect(out).toContain("Rien n'est parti.")
  })

  test("chaque geste de la méthode apparaît, dans l'ordre de la reprise § 8", async () => {
    const { out } = await cli(["plan", SHA])
    const order = [
      `git -C ${REPOS.antsia} fetch origin main`,
      `git -C ${REPOS.diasporale} rev-parse origin/main`,
      `--output=${join(home, SHA12, "export", "antsia.tar")} ${SHA} -- . ':(exclude,glob)**/.env*'`,
      "bun install --frozen-lockfile",
      "CONVEX_DEPLOYMENT=prod:exemple-demo node scripts/convex-dev.mjs deploy --typecheck disable --dry-run",
      `CONVEX_DEPLOYMENT=prod:exemple-demo node scripts/convex-dev.mjs deploy --typecheck disable --message 'ANTSIA ${SHA12}'`,
      "CONVEX_DEPLOYMENT=prod:exemple-production node scripts/convex-dev.mjs deploy --typecheck disable --dry-run",
      `CONVEX_DEPLOYMENT=prod:exemple-production node scripts/convex-dev.mjs deploy --typecheck disable --message 'ANTSIA ${SHA12}'`,
      `VERCEL_PROJECT_ID=exemple-projet-demo vercel deploy ${join(home, SHA12, "export", "ECOSYSTEMES")} --prod --skip-domain --archive=tgz --yes --scope exemple-equipe --build-env NEXT_PUBLIC_BUILD_SHA=main-${SHA12}-demo`,
      `--build-env ANTSIA_DEMO_RUNTIME_ORIGIN=<ORIGINE_ENFANT>`,
      "vercel curl /api/sante-fonctionnelle --deployment <ID_DEPLOIEMENT>",
      "vercel curl /demo/entrer --deployment <ID_DEPLOIEMENT>",
      "VERCEL_PROJECT_ID=exemple-projet-demo vercel promote <ID_DEPLOIEMENT>",
      "VERCEL_PROJECT_ID=exemple-projet-principal vercel promote <ID_DEPLOIEMENT>",
      "GET https://site.exemple.test/api/sante-fonctionnelle",
      "GET https://site.exemple.test/demo/entrer",
      `--build-env NEXT_PUBLIC_BUILD_SHA=main-${SHA12}-console`,
    ]
    let cursor = -1
    for (const fragment of order) {
      const position = out.indexOf(fragment, cursor + 1)
      expect({ fragment, found: position > cursor }).toEqual({ fragment, found: true })
      cursor = position
    }
  })

  test("variables absentes : le plan montre des marqueurs et nomme ce qu'il faut poser", async () => {
    const { code, out } = await cli(["plan", SHA], { environment: { ANTSIA_RELEASE_HOME: home } })
    expect(code).toBe(0)
    expect(out).toContain("CONVEX_DEPLOYMENT=prod:<ANTSIA_RELEASE_CONVEX_DEMO>")
    expect(out).toContain("Variables de la machine à poser avant toute exécution : ANTSIA_RELEASE_CONVEX_DEMO")
  })

  test("aucune commande d'aucune étape ne pose de variable, ne rejoue de graine ni ne supprime", () => {
    const steps = createSteps(vercelHost)
    const state = initialState({ sha: SHA, home, repos: REPOS, values: { ...TARGETS }, manifest: null, options: {} })
    const forbidden = /\b(?:env\s+(?:set|add|rm|remove|pull)|seed|graines?|convex-deploy-demo-production|import|rm|remove|delete|redeploy|--force|--allow-deleting-large-indexes|run\s+seeds)\b/
    for (const stepId of [...RELEASE_ORDER, ...ALTERNATIVE_STEPS, ...ROLLBACK_STEPS]) {
      const step = steps[stepId]
      const commands = step.items().filter((item) => item.kind === "command").map((item) => line(item.build(state)))
      for (const text of commands) expect({ stepId, text, forbidden: forbidden.test(text) }).toEqual({ stepId, text, forbidden: false })
      expect(describeItems(step.items(), state).length).toBeGreaterThan(0)
    }
  })
})

describe("aucune commande ne part sans --execute ET la confirmation exacte", () => {
  test("le détail d'une étape ne lance rien", async () => {
    const { run, calls } = fakeRunner()
    const { code, out } = await cli(["export", SHA], { run })
    expect(code).toBe(0)
    expect(calls).toEqual([])
    expect(out).toContain(`--execute --confirmer export@${SHA12}`)
  })

  test.each([
    [["--execute"], "confirmation attendue"],
    [["--execute", "--confirmer", "export@ffffffffffff"], "confirmation attendue"],
    [["--execute", "--confirmer", `moteur-demo@${SHA12}`], "confirmation attendue"],
    [["--execute", "--confirmer", `export@${SHA}`], "confirmation attendue"],
  ])("refuse %p sans rien lancer", async (flags, message) => {
    const { run, calls } = fakeRunner()
    const { code, err } = await cli(["export", SHA, ...flags], { run })
    expect(code).toBe(1)
    expect(err).toContain(message)
    expect(calls).toEqual([])
    expect(existsSync(join(home, SHA12))).toBe(false)
  })

  test("une seule étape par appel, un SHA complet, aucune option inconnue", async () => {
    expect((await cli(["export", SHA, "moteur-demo"])).code).toBe(2)
    expect((await cli(["export", "main"])).code).toBe(2)
    expect((await cli(["export", SHA, "--tout"])).code).toBe(2)
    expect((await cli(["inconnue", SHA])).code).toBe(2)
    expect(() => parseArgs(["export", SHA, "--publication", "../ailleurs"])).toThrow("nom de publication invalide")
  })

  test("variable absente : étape refusée en la nommant, rien ne part", async () => {
    seedManifest({ export: EXPORT_DONE, "controle-moteur-production": done() })
    const { run, calls } = fakeRunner()
    const { ANTSIA_RELEASE_VERCEL_PROJECT_DEMO: _absent, ...partial } = env
    const { code, err } = await cli(["site-demo", SHA, ...confirm("site-demo")], { run, environment: partial })
    expect(code).toBe(1)
    expect(err).toContain("variable ANTSIA_RELEASE_VERCEL_PROJECT_DEMO absente")
    expect(calls).toEqual([])
  })

  test("le dossier des publications ne peut pas être dans un dépôt", async () => {
    const { code, err } = await cli(["plan", SHA], { environment: { ...env, ANTSIA_RELEASE_HOME: join(REPOS.antsia, "publications") } })
    expect(code).toBe(2)
    expect(err).toContain("dossier de publication dans un dépôt")
  })

  test("un seul publieur : une étape en cours (verrou) refuse la suivante", async () => {
    seedManifest({ export: EXPORT_DONE })
    writeFileSync(join(home, ".verrou-publication"), "autre étape\n")
    const { run, calls } = fakeRunner()
    const { code, err } = await cli(["moteur-demo-essai", SHA, ...confirm("moteur-demo-essai")], { run })
    expect(code).toBe(1)
    expect(err).toContain("déjà en cours")
    expect(calls).toEqual([])
  })
})

describe("export propre", () => {
  const exportHandler = ({ plant = [] } = {}) => (spec) => {
    if (spec.program === "git" && spec.args.includes("rev-parse")) return { stdout: `${DIASPORALE_COMMIT}\n` }
    if (spec.program === "tar") {
      const target = spec.args[spec.args.indexOf("-C") + 1]
      mkdirSync(join(target, "convex"), { recursive: true })
      writeFileSync(join(target, "package.json"), "{}\n")
      writeFileSync(join(target, "convex", "health.ts"), "export {}\n")
      for (const file of plant) writeFileSync(join(target, file), "SECRET=x\n")
    }
    return {}
  }

  test("archive du SHA sans .env*, DIASPORALE à origin/main, liste d'exclusion, installation figée, manifeste", async () => {
    const { run, calls } = fakeRunner(exportHandler())
    const { code, out } = await cli(["export", SHA, ...confirm("export")], { run })
    expect(code).toBe(0)
    expect(out).toContain("✓ export : fait")
    const lines = calls.map(line)
    expect(lines[0]).toBe(`git -C ${REPOS.antsia} cat-file -e '${SHA}^{commit}'`)
    expect(lines).toContain(`git -C ${REPOS.diasporale} rev-parse origin/main`)
    expect(lines.some((text) => text.includes(`archive --format=tar --output=${join(home, SHA12, "export", "diasporale.tar")} ${DIASPORALE_COMMIT} -- . ':(exclude,glob)**/.env*'`))).toBe(true)
    expect(lines.at(-1)).toBe(`(cd ${join(home, SHA12, "export", "ECOSYSTEMES", "ANTSIA")} && bun install --frozen-lockfile)`)
    const manifest = manifestNow()
    expect(manifest.steps.export).toMatchObject({ status: "fait", inMain: true, diasporaleCommit: DIASPORALE_COMMIT, sourceFiles: 5 })
    expect(manifest.steps.export.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(readFileSync(join(home, SHA12, "export", "ECOSYSTEMES", ".vercelignore"), "utf8")).toContain("**/.env*")
    expect(readFileSync(join(home, SHA12, "journal", "export.log"), "utf8")).toContain("bun install --frozen-lockfile")
    expect(existsSync(join(home, ".verrou-publication"))).toBe(false)
  })

  test("un commit hors de main est étiqueté « commit- », jamais « main- »", async () => {
    const { run } = fakeRunner((spec, calls) => (spec.args.includes("merge-base") ? { status: 1 } : exportHandler()(spec, calls)))
    expect((await cli(["export", SHA, ...confirm("export")], { run })).code).toBe(0)
    expect(manifestNow().steps.export.inMain).toBe(false)
    const { out } = await cli(["site-demo", SHA])
    expect(out).toContain(`NEXT_PUBLIC_BUILD_SHA=commit-${SHA12}-demo`)
  })

  test("un .env* dans l'export fait échouer l'étape, consignée", async () => {
    const { run, calls } = fakeRunner(exportHandler({ plant: [".env.local"] }))
    const { code, err } = await cli(["export", SHA, ...confirm("export")], { run })
    expect(code).toBe(1)
    expect(err).toContain("fichiers .env* dans l'export")
    expect(calls.some((spec) => spec.program === "bun")).toBe(false)
    expect(manifestNow().steps.export.status).toBe("echec")
    // Un second export de la même publication est refusé : rien n'est écrasé.
    expect((await cli(["export", SHA, ...confirm("export")], { run })).code).toBe(1)
  })
})

describe("moteur : démonstration d'abord, jamais de retrait de fonction, jamais de suppression d'index", () => {
  test("la production exige la démonstration publiée ET contrôlée dans ce manifeste", async () => {
    seedManifest({ export: EXPORT_DONE, "moteur-demo-essai": done(), "moteur-demo": done() })
    const { run, calls } = fakeRunner()
    const { code, err } = await cli(["moteur-production-essai", SHA, ...confirm("moteur-production-essai")], { run })
    expect(code).toBe(1)
    expect(err).toContain("controle-moteur-demo")
    expect(calls).toEqual([])
  })

  test("refuse un commit qui retirerait une fonction servie en ligne, avant tout essai d'envoi", async () => {
    seedManifest({ export: EXPORT_DONE })
    const online = { functions: [...ONLINE_BEFORE.functions, fn("modules/shops/plus-recente.js:list")] }
    const { run, calls } = fakeRunner((spec) => (spec.args.includes("function-spec") ? { stdout: specOutput(online) } : {}))
    const { code, err } = await cli(["moteur-demo-essai", SHA, ...confirm("moteur-demo-essai")], { run })
    expect(code).toBe(1)
    expect(err).toContain("retirerait 1 fonction(s)")
    expect(err).toContain("modules/shops/plus-recente.js:list")
    expect(calls.map((spec) => spec.args.slice(1, 2)[0])).toEqual(["function-spec"])
    expect(manifestNow().steps["moteur-demo-essai"].status).toBe("refusee")
  })

  test("refuse une suppression d'index annoncée par l'essai", async () => {
    seedManifest({ export: EXPORT_DONE })
    const { run, calls } = fakeRunner((spec) => {
      if (spec.args.includes("function-spec")) return { stdout: specOutput(ONLINE_BEFORE) }
      if (spec.args.includes("--dry-run")) return { stdout: "Would delete table indexes:\n  [-] posts.by_author   author\n" }
      return {}
    })
    const { code, err } = await cli(["moteur-demo-essai", SHA, ...confirm("moteur-demo-essai")], { run })
    expect(code).toBe(1)
    expect(err).toContain("suppression d'index annoncée")
    expect(calls.some((spec) => spec.args.includes("deploy") && !spec.args.includes("--dry-run"))).toBe(false)
  })

  test("essai puis envoi : cible imposée, clés héritées retirées, API inchangée entre les deux", async () => {
    seedManifest({ export: EXPORT_DONE })
    const { run, calls } = fakeRunner((spec) => (spec.args.includes("function-spec") ? { stdout: specOutput(ONLINE_BEFORE) } : { stdout: "✔ Would have deployed Convex functions" }))
    expect((await cli(["moteur-demo-essai", SHA, ...confirm("moteur-demo-essai")], { run })).code).toBe(0)
    const essai = manifestNow().steps["moteur-demo-essai"]
    expect(essai.comparison).toEqual({ missing: [], added: ["modules/posts/feed.js:nouvelle"], changed: [] })
    expect(calls.every((spec) => spec.env.CONVEX_DEPLOYMENT === "prod:exemple-demo")).toBe(true)
    expect(childEnv({ CONVEX_DEPLOY_KEY: "cle-de-la-machine", PATH: "/bin" }, calls[0])).toEqual({ PATH: "/bin", CONVEX_DEPLOYMENT: "prod:exemple-demo" })

    const sent = fakeRunner((spec) => (spec.args.includes("function-spec") ? { stdout: specOutput(ONLINE_BEFORE) } : {}))
    expect((await cli(["moteur-demo", SHA, ...confirm("moteur-demo")], { run: sent.run })).code).toBe(0)
    expect(sent.calls.map(line).at(-1)).toContain(`deploy --typecheck disable --message 'ANTSIA ${SHA12}'`)
    expect(manifestNow().steps["moteur-demo"]).toMatchObject({ status: "fait", previousApiFingerprint: apiFingerprint(ONLINE_BEFORE), previousSha: null })
  })

  test("l'envoi est refusé si l'API en ligne a changé depuis l'essai (un autre publieur)", async () => {
    seedManifest({ export: EXPORT_DONE, "moteur-demo-essai": done({ onlineFingerprint: apiFingerprint(ONLINE_BEFORE) }) })
    const changed = { functions: [fn("health.js:ping")] }
    const { run, calls } = fakeRunner(() => ({ stdout: specOutput(changed) }))
    const { code, err } = await cli(["moteur-demo", SHA, ...confirm("moteur-demo")], { run })
    expect(code).toBe(1)
    expect(err).toContain("un autre publieur est passé")
    expect(calls.some((spec) => spec.args.includes("deploy"))).toBe(false)
  })

  test("contrôle : l'API servie doit être celle du candidat, le site qui sert ce moteur doit le joindre", async () => {
    seedManifest({ export: EXPORT_DONE, "moteur-demo-essai": done(), "moteur-demo": done() })
    const health = { status: "ok", application: "antsia-ga", version: "ancienne-demo", backend: "configured", engine: { state: "reachable", version: null } }
    const network = fakeFetch((url) => (url === "https://site.exemple.test/demo/api/sante-fonctionnelle" ? { body: JSON.stringify(health) } : null))
    const stale = fakeRunner(() => ({ stdout: specOutput(ONLINE_BEFORE) }))
    const failed = await cli(["controle-moteur-demo", SHA, ...confirm("controle-moteur-demo")], { run: stale.run, fetch: network.fetch })
    expect(failed.code).toBe(1)
    expect(failed.err).toContain("API servie différente de celle du commit publié")
    const fresh = fakeRunner(() => ({ stdout: specOutput(CANDIDATE) }))
    expect((await cli(["controle-moteur-demo", SHA, ...confirm("controle-moteur-demo")], { run: fresh.run, fetch: network.fetch })).code).toBe(0)
    expect(manifestNow().steps["controle-moteur-demo"].status).toBe("fait")
  })

  test("retour arrière du moteur : seules les fonctions ajoutées par la publication annulée peuvent partir", async () => {
    // Publication annulée : son essai avait ajouté « nouvelle ».
    seedManifest({ export: EXPORT_DONE, "moteur-demo-essai": done({ comparison: { missing: [], added: ["modules/posts/feed.js:nouvelle"], changed: [] } }) }, { publication: "publiee" })
    // Republication du commit précédent, sous un autre nom de publication.
    seedManifest({ export: EXPORT_DONE }, { candidate: ONLINE_BEFORE, publication: "retour" })
    const { run } = fakeRunner((spec) => (spec.args.includes("function-spec") ? { stdout: specOutput(CANDIDATE) } : {}))
    const blocked = await cli(["moteur-demo-essai", SHA, "--publication", "retour", ...confirm("moteur-demo-essai")], { run })
    expect(blocked.code).toBe(1)
    expect(blocked.err).toContain("modules/posts/feed.js:nouvelle")
    const allowed = await cli(["moteur-demo-essai", SHA, "--publication", "retour", "--retour-de", "publiee", ...confirm("moteur-demo-essai")], { run })
    expect(allowed.code).toBe(0)
    expect(manifestNow("retour").steps["moteur-demo-essai"].retourDe).toBe("publiee")
  })

  test("le relevé du candidat doit venir d'un backend local", async () => {
    seedManifest({ export: EXPORT_DONE })
    const file = join(home, "candidat-en-ligne.json")
    writeFileSync(file, JSON.stringify({ url: "https://moteur.exemple.test", functions: [] }))
    const { run, calls } = fakeRunner()
    const { code, err } = await cli(["moteur-demo-essai", SHA, "--api-candidat", file, ...confirm("moteur-demo-essai")], { run })
    expect(code).toBe(1)
    expect(err).toContain("backend LOCAL")
    expect(calls).toEqual([])
  })
})

/** Réponses de l'hébergeur simulées pour les sites. */
function hostHandler({ aliases = {}, deployOutputs = [], ready = "READY", curl = () => null } = {}) {
  let deployCount = 0
  return (spec) => {
    const [verb, subject] = spec.args
    if (verb === "inspect") {
      const deployment = aliases[subject] ?? { id: `dpl_${subject.split(".")[0].replaceAll("-", "_")}`, url: subject }
      return { stdout: JSON.stringify({ ...deployment, readyState: ready }) }
    }
    if (verb === "deploy") return deployOutputs[deployCount++] ?? { stdout: "Production: https://exemple-enfant.vercel.app [2m]\n" }
    if (verb === "curl") return curl(subject, spec) ?? { status: 7, stderr: "simulé : chemin inconnu" }
    return {}
  }
}

const curlAnswer = (status, headers, body) => ({ stdout: `HTTP/2 ${status} \r\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("\r\n")}\r\n\r\n${body}` })
const healthBody = (version) => JSON.stringify({ status: "ok", application: "antsia-ga", version, backend: "configured", engine: { state: "reachable", version: "moteur-1", latencyMs: 30 } })

/** Le site principal privé, avec sa zone /demo : versions et CSP paramétrables pour simuler un défaut. */
function principalCurl({ version = `main-${SHA12}-production`, demoVersion = `main-${SHA12}-demo`, engine = "exemple-production", demoEngine = "exemple-demo" } = {}) {
  return (path) => {
    const demo = path.startsWith("/demo")
    if (path.endsWith("/api/sante-fonctionnelle")) return curlAnswer(200, { "content-type": "application/json" }, healthBody(demo ? demoVersion : version))
    return curlAnswer(200, { "content-security-policy": productionCsp(demo ? demoEngine : engine) }, "<!doctype html>")
  }
}

describe("sites : moteur d'abord, enfant avant principal, contrôle privé avant promotion", () => {
  test("les sites exigent le moteur contrôlé ou vérifié inchangé ; le principal exige l'enfant", async () => {
    seedManifest({ export: EXPORT_DONE, "moteur-production": done() })
    const { run, calls } = fakeRunner()
    const blocked = await cli(["site-demo", SHA, ...confirm("site-demo")], { run })
    expect(blocked.err).toContain("moteur d'abord")
    const principal = await cli(["site-principal", SHA, ...confirm("site-principal")], { run })
    expect(principal.err).toContain("l'enfant de démonstration d'abord")
    expect(calls).toEqual([])
  })

  test("enfant puis principal : sans bascule, déploiement précédent consigné, origine de l'enfant passée au principal", async () => {
    seedManifest({ export: EXPORT_DONE, "controle-moteur-production": done() })
    const child = fakeRunner(hostHandler({
      aliases: { "enfant.exemple.test": { id: "dpl_ancien_enfant", url: "exemple-ancien.vercel.app" }, "exemple-enfant.vercel.app": { id: "dpl_enfant", url: "exemple-enfant.vercel.app" } },
      deployOutputs: [{ status: 1, stderr: "Error: write EPIPE" }, { stdout: "Production: https://exemple-enfant.vercel.app [2m]\n" }],
    }))
    expect((await cli(["site-demo", SHA, ...confirm("site-demo")], { run: child.run })).code).toBe(0)
    expect(child.calls.filter((spec) => spec.args[0] === "deploy")).toHaveLength(2)
    expect(manifestNow().steps["site-demo"]).toMatchObject({ deployment: { id: "dpl_enfant", url: "https://exemple-enfant.vercel.app" }, previousAtDeploy: { id: "dpl_ancien_enfant" }, buildLabel: `main-${SHA12}-demo` })

    const principal = fakeRunner(hostHandler({
      aliases: { "site.exemple.test": { id: "dpl_ancien_principal", url: "exemple-ancien.vercel.app" }, "exemple-principal.vercel.app": { id: "dpl_principal", url: "exemple-principal.vercel.app" } },
      deployOutputs: [{ stdout: "Production: https://exemple-principal.vercel.app [2m]\n" }],
    }))
    expect((await cli(["site-principal", SHA, ...confirm("site-principal")], { run: principal.run })).code).toBe(0)
    const deploy = principal.calls.find((spec) => spec.args[0] === "deploy")
    expect(deploy.args).toContain("ANTSIA_DEMO_RUNTIME_ORIGIN=https://exemple-enfant.vercel.app")
    expect(deploy.args).toContain("--skip-domain")
    expect(deploy.env).toEqual({ VERCEL_ORG_ID: "exemple-equipe", VERCEL_PROJECT_ID: "exemple-projet-principal" })
  })

  test("un déploiement non prêt fait échouer l'étape", async () => {
    seedManifest({ export: EXPORT_DONE, "controle-moteur-production": done() })
    const { run } = fakeRunner(hostHandler({ ready: "ERROR" }))
    const { code, err } = await cli(["site-demo", SHA, ...confirm("site-demo")], { run })
    expect(code).toBe(1)
    expect(err).toContain("déploiement non prêt")
  })

  const deployedSteps = () => ({
    export: EXPORT_DONE,
    "controle-moteur-production": done(),
    "site-demo": done({ deployment: { id: "dpl_enfant", url: "https://exemple-enfant.vercel.app" }, previousAtDeploy: { id: "dpl_ancien_enfant", url: "https://exemple-ancien.vercel.app" } }),
    "site-principal": done({ deployment: { id: "dpl_principal", url: "https://exemple-principal.vercel.app" }, previousAtDeploy: { id: "dpl_ancien_principal", url: "https://exemple-ancien.vercel.app" } }),
  })

  test("contrôle privé : une version fausse ou la CSP du mauvais moteur font échouer", async () => {
    seedManifest(deployedSteps())
    const wrong = fakeRunner(hostHandler({ curl: principalCurl({ version: "main-ffffffffffff-production", demoEngine: "exemple-production" }) }))
    const { code, err } = await cli(["controle-prive", SHA, ...confirm("controle-prive")], { run: wrong.run })
    expect(code).toBe(1)
    expect(err).toContain("principal : santé : version servie « main-ffffffffffff-production »")
    expect(err).toContain("demo : CSP : CSP ouverte à un autre moteur : exemple-production")
    expect(wrong.calls.every((spec) => spec.args[0] === "curl" && spec.args.includes("dpl_principal"))).toBe(true)
    expect(wrong.calls.map((spec) => spec.args[1])).toEqual(expect.arrayContaining([...KEY_ROUTES.principal, ...KEY_ROUTES.demo.map((route) => `/demo${route}`)]))
    // Promotion impossible tant que le contrôle privé n'a pas réussi.
    expect((await cli(["promotion-demo", SHA, ...confirm("promotion-demo")], { run: wrong.run })).err).toContain("controle-prive réussi exigé")

    const right = fakeRunner(hostHandler({ curl: principalCurl() }))
    expect((await cli(["controle-prive", SHA, ...confirm("controle-prive")], { run: right.run })).code).toBe(0)
  })

  test("promotion : refusée si un autre déploiement a été promu depuis l'envoi", async () => {
    seedManifest({ ...deployedSteps(), "controle-prive": done() })
    const { run, calls } = fakeRunner(hostHandler({ aliases: { "enfant.exemple.test": { id: "dpl_intrus", url: "exemple-ancien.vercel.app" } } }))
    const { code, err } = await cli(["promotion-demo", SHA, ...confirm("promotion-demo")], { run })
    expect(code).toBe(1)
    expect(err).toContain("un autre publieur est passé")
    expect(calls.some((spec) => spec.args[0] === "promote")).toBe(false)
  })

  test("promotion de l'enfant puis du principal, version précédente consignée, puis retour arrière dans le même ordre", async () => {
    seedManifest({ ...deployedSteps(), "controle-prive": done() })
    const served = { child: "dpl_ancien_enfant", main: "dpl_ancien_principal" }
    const versions = { principal: "main-aaaaaaaaaaaa-production", demo: "main-aaaaaaaaaaaa-demo" }
    const runner = fakeRunner((spec) => {
      const [verb, subject] = spec.args
      const key = spec.env.VERCEL_PROJECT_ID === "exemple-projet-demo" ? "child" : "main"
      if (verb === "inspect") return { stdout: JSON.stringify({ id: served[key], url: "exemple-ancien.vercel.app", readyState: "READY" }) }
      if (verb === "promote") served[key] = subject
      return {}
    })
    const network = fakeFetch((url) => {
      if (url === "https://site.exemple.test/api/sante-fonctionnelle") return { body: healthBody(versions.principal) }
      if (url === "https://site.exemple.test/demo/api/sante-fonctionnelle") return { body: healthBody(versions.demo) }
      return null
    })
    expect((await cli(["promotion-demo", SHA, ...confirm("promotion-demo")], { run: runner.run, fetch: network.fetch })).code).toBe(0)
    expect((await cli(["promotion-principal", SHA, ...confirm("promotion-principal")], { run: runner.run, fetch: network.fetch })).code).toBe(0)
    expect(manifestNow().steps["promotion-principal"]).toMatchObject({ previous: { id: "dpl_ancien_principal" }, previousVersion: "main-aaaaaaaaaaaa-production", promoted: { id: "dpl_principal" } })
    expect(served).toEqual({ child: "dpl_enfant", main: "dpl_principal" })

    // Retour arrière : le principal attend l'enfant, comme à la publication.
    expect((await cli(["retour-principal", SHA, ...confirm("retour-principal")], { run: runner.run, fetch: network.fetch })).err).toContain("retour-demo")
    expect((await cli(["retour-demo", SHA, ...confirm("retour-demo")], { run: runner.run, fetch: network.fetch })).code).toBe(0)
    expect((await cli(["retour-principal", SHA, ...confirm("retour-principal")], { run: runner.run, fetch: network.fetch })).code).toBe(0)
    expect(served).toEqual({ child: "dpl_ancien_enfant", main: "dpl_ancien_principal" })
    expect(manifestNow().steps["retour-principal"].report.errors).toEqual([])
  })

  test("retour arrière : la version servie qui n'est pas revenue est un défaut", async () => {
    seedManifest({
      ...deployedSteps(),
      "promotion-demo": done({ previous: { id: "dpl_ancien_enfant" }, promoted: { id: "dpl_enfant" }, previousVersion: "main-aaaaaaaaaaaa-demo" }),
      "promotion-principal": done({ previous: { id: "dpl_ancien_principal" }, promoted: { id: "dpl_principal" }, previousVersion: "main-aaaaaaaaaaaa-production" }),
      "retour-demo": done(),
    })
    const served = { main: "dpl_principal" }
    const runner = fakeRunner((spec) => {
      const [verb, subject] = spec.args
      if (verb === "inspect") return { stdout: JSON.stringify({ id: served.main, readyState: "READY" }) }
      if (verb === "promote") served.main = subject
      return {}
    })
    const network = fakeFetch((url) => (url.endsWith("/api/sante-fonctionnelle") ? { body: healthBody(`main-${SHA12}-${url.includes("/demo/") ? "demo" : "production"}`) } : null))
    const { code, err } = await cli(["retour-principal", SHA, ...confirm("retour-principal")], { run: runner.run, fetch: network.fetch })
    expect(code).toBe(1)
    expect(err).toContain("attendue « main-aaaaaaaaaaaa-production »")
  })
})
