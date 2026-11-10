import { describe, expect, test } from "bun:test"

import { analyzeCsp, analyzeDeploy, analyzeDryRun, analyzeHealth, analyzeRoutes, convexEnginesInCsp, parseCurlInclude } from "./checks.mjs"
import { productionCsp } from "./fixtures.mjs"

const health = (body, status = 200) => ({ status, headers: new Map(), body: JSON.stringify(body) })
const healthy = (version) => ({ status: "ok", application: "antsia-ga", version, backend: "configured", engine: { state: "reachable", version: "moteur-1", serverTime: "2026-11-10T10:00:00.000Z", latencyMs: 40 } })

describe("santé et version servie", () => {
  test("accepte la bonne version avec un moteur qui répond", () => {
    expect(analyzeHealth(health(healthy("main-0123456789ab-production")), { expectedVersion: "main-0123456789ab-production" })).toMatchObject({ errors: [], warnings: [] })
  })

  test("signale une version fausse", () => {
    const report = analyzeHealth(health(healthy("main-ffffffffffff-production")), { expectedVersion: "main-0123456789ab-production" })
    expect(report.errors).toEqual(["version servie « main-ffffffffffff-production », attendue « main-0123456789ab-production »"])
  })

  test("signale un 503 (moteur muet), une réponse illisible et un moteur injoignable", () => {
    expect(analyzeHealth(health({ ...healthy("v"), status: "degraded", engine: { state: "timeout", version: null } }, 503), { expectedVersion: "v" }).errors).toEqual([
      "santé HTTP 503 (attendu 200 : un 503 dit que le moteur ne répond pas)",
      "moteur injoignable selon la sonde (état « timeout »)",
    ])
    expect(analyzeHealth({ status: 200, headers: new Map(), body: "<html>" }, { expectedVersion: "v" }).errors).toEqual(["santé : réponse illisible (JSON attendu)"])
  })

  test("un site antérieur à la sonde EX-03 et un moteur sans version déclarée sont des avertissements", () => {
    const old = analyzeHealth(health({ status: "ok", application: "antsia-ga", version: "v", backend: "configured" }), { expectedVersion: null })
    expect(old.errors).toEqual([])
    expect(old.warnings).toEqual(["santé : état du moteur non rapporté (site antérieur à la sonde EX-03)"])
    const undeclared = analyzeHealth(health({ ...healthy("v"), engine: { state: "reachable", version: null } }), { expectedVersion: "v" })
    expect(undeclared.warnings).toEqual(["version du moteur non déclarée (ANTSIA_ENGINE_VERSION, posée par le propriétaire)"])
  })
})

describe("CSP limitée au bon moteur", () => {
  test("accepte la CSP de son seul moteur", () => {
    expect(convexEnginesInCsp(productionCsp("exemple-production"))).toEqual(["exemple-production"])
    expect(analyzeCsp(productionCsp("exemple-production"), "exemple-production").errors).toEqual([])
  })

  test("signale la CSP du mauvais moteur (démo servie par le principal, ou l'inverse)", () => {
    const report = analyzeCsp(productionCsp("exemple-demo"), "exemple-production")
    expect(report.errors).toEqual([
      "CSP ouverte à un autre moteur : exemple-demo",
      "CSP : https://exemple-production.convex.cloud absent de connect-src",
      "CSP : wss://exemple-production.convex.cloud absent de connect-src",
    ])
  })

  test("signale un second moteur ajouté, un joker, une CSP de développement ou absente", () => {
    const both = `${productionCsp("exemple-production")} https://exemple-demo.convex.cloud`
    expect(analyzeCsp(both, "exemple-production").errors).toEqual(["CSP ouverte à un autre moteur : exemple-demo"])
    expect(analyzeCsp(`${productionCsp("exemple-production")}; frame-src https://*.convex.cloud`, "exemple-production").errors).toContain("CSP ouverte à tous les moteurs Convex (joker)")
    expect(analyzeCsp(`${productionCsp("exemple-production")} ws://localhost:*`, "exemple-production").errors).toEqual(["CSP de développement servie (sources locales ou 'unsafe-eval')"])
    expect(analyzeCsp(undefined, "exemple-production").errors).toEqual(["CSP absente des en-têtes"])
  })
})

describe("routes clés", () => {
  test("toute réponse autre que 200 est un défaut, redirection comprise", () => {
    expect(analyzeRoutes([{ path: "/entrer", status: 200 }, { path: "/a-propos", status: 307 }, { path: "/transparence", status: 0, error: "injoignable" }]).errors).toEqual([
      "route /a-propos : HTTP 307 (attendu 200)",
      "route /transparence : injoignable (attendu 200)",
    ])
  })
})

describe("réponse privée de l'hébergeur (curl --include)", () => {
  test("lit la ligne d'état, les en-têtes et le corps du dernier bloc", () => {
    const raw = "HTTP/1.1 100 Continue\r\n\r\nHTTP/2 200 \r\ncontent-type: application/json\r\nContent-Security-Policy: default-src 'self'\r\n\r\n{\"version\":\"v\"}"
    const answer = parseCurlInclude(raw)
    expect(answer.status).toBe(200)
    expect(answer.headers.get("content-security-policy")).toBe("default-src 'self'")
    expect(answer.body).toBe('{"version":"v"}')
    expect(() => parseCurlInclude("Error: not found")).toThrow("ligne d'état")
  })
})

describe("essai d'envoi du moteur", () => {
  test("refuse une suppression d'index, la nomme, et consigne les ajouts", () => {
    const output = [
      "✔ Would have deployed Convex functions",
      "Would delete table indexes:",
      "  [-] posts.by_author   author, _creationTime",
      "Would add table indexes:",
      "  [+] posts.by_network_author   networkId, author, _creationTime",
      "Change the server's version for Node.js actions:",
    ].join("\n")
    const report = analyzeDryRun(output)
    expect(report.errors).toEqual(["suppression d'index annoncée (1) : jamais sans décision du propriétaire — [-] posts.by_author   author, _creationTime"])
    expect(report.facts.addedIndexes).toEqual(["[+] posts.by_network_author   networkId, author, _creationTime"])
    expect(report.warnings).toContain("ligne « version Node des actions » : artefact connu de la CLI, sans effet")
  })

  test("un essai sans suppression passe ; un envoi qui aurait supprimé un index est une alarme", () => {
    expect(analyzeDryRun("✔ Would have deployed Convex functions").errors).toEqual([])
    expect(analyzeDeploy("Deleted table indexes:\n  [-] x").errors).toHaveLength(1)
  })
})
