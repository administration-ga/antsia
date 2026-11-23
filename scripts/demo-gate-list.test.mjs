/** CH-817 E5 (constat 11a) — la seule voie documentée de gestion de la liste des numéros de la porte. */
import { describe, expect, test } from "bun:test"

import { convexRunArgs, DEMO_GATE_LIST_FUNCTIONS, DemoGateListError, parseDemoGateListArgs, phonesFromInput, runDemoGateList } from "./demo-gate-list.mjs"

// Valeurs FICTIVES : numéros de la plage réservée à la fiction (Ofcom, 07700 900xxx).
const FIRST = "+447700900123"
const SECOND = "+447700900456"
const KEY = "fictional-deploy-key"

/** Le geste, avec tout injecté : rend le code, les messages et les lancements. */
async function run(argv, input = "", env = { CONVEX_DEPLOY_KEY: KEY }) {
  const logs = []
  const launches = []
  const code = await runDemoGateList({
    argv,
    readInput: async () => input,
    env,
    launch: async (args, launchEnv) => { launches.push({ args, key: launchEnv.CONVEX_DEPLOY_KEY }); return 0 },
    log: (message) => logs.push(message),
    warn: (message) => logs.push(message),
  })
  return { code, logs: logs.join("\n"), launches }
}

describe("arguments — trois gestes, une portée, aucun numéro", () => {
  test("allow, revoke, reset ; la portée par défaut et `--scope` connue ; tout le reste refusé", () => {
    expect(parseDemoGateListArgs(["allow"])).toEqual({ action: "allow", scope: "diaspora-ga", dryRun: false })
    expect(parseDemoGateListArgs(["reset", "--scope", "diaspora-ga", "--dry-run"])).toEqual({ action: "reset", scope: "diaspora-ga", dryRun: true })
    for (const argv of [[], ["delete"], ["allow", "--scope", "antsia"], ["allow", FIRST], ["revoke", "--phones", FIRST]]) {
      expect(() => parseDemoGateListArgs(argv)).toThrow(DemoGateListError)
    }
    // Un numéro passé en argument n'est jamais recopié dans le refus.
    try { parseDemoGateListArgs(["allow", FIRST]) } catch (error) { expect(String(error)).not.toContain("7700") }
  })
})

describe("entrée standard — normalisée, refusée par RANG", () => {
  test("séparateurs, préfixe 00, lignes vides et commentaires ; sans doublon", () => {
    expect(phonesFromInput(`# invités\n${FIRST}\n\n0044 7700 900456\n+44 7700-900-123\n`)).toEqual([FIRST, SECOND])
  })

  test("un numéro hors forme lève avec son rang, jamais sa valeur", () => {
    let message = ""
    try { phonesFromInput(`${FIRST}\n07700 900456\n`) } catch (error) { message = String(error) }
    expect(message).toContain("n° 2")
    expect(message).not.toContain("900456")
    expect(message).not.toContain("7700")
  })

  test("de 1 à 20 numéros", () => {
    expect(() => phonesFromInput("\n# rien\n")).toThrow(DemoGateListError)
    const many = Array.from({ length: 21 }, (_, index) => `+447700900${100 + index}`).join("\n")
    expect(() => phonesFromInput(many)).toThrow("De 1 à 20")
  })
})

describe("appel — JSON construit par le script, lanceur du moteur, clé de l'environnement", () => {
  test("le JSON des trois fonctions internes", () => {
    expect(convexRunArgs({ action: "allow", scope: "diaspora-ga", phones: [FIRST] })).toEqual(["run", DEMO_GATE_LIST_FUNCTIONS.allow, JSON.stringify({ scope: "diaspora-ga", phones: [FIRST] })])
    expect(convexRunArgs({ action: "revoke", scope: "diaspora-ga", phones: [FIRST, SECOND] })[1]).toBe("modules/platform/demoGate:revokePhones")
    expect(convexRunArgs({ action: "reset", scope: "diaspora-ga", phones: [] })).toEqual(["run", "modules/platform/demoGate:resetScope", JSON.stringify({ scope: "diaspora-ga" })])
  })

  test("allow : un seul lancement, avec la clé ; seuls des nombres s'affichent", async () => {
    const { code, logs, launches } = await run(["allow"], `${FIRST}\n0044 7700 900456\n`)
    expect(code).toBe(0)
    expect(launches).toEqual([{ args: ["run", "modules/platform/demoGate:allowPhones", JSON.stringify({ scope: "diaspora-ga", phones: [FIRST, SECOND] })], key: KEY }])
    expect(logs).toContain("2 numéro(s)")
    expect(logs).not.toContain("7700")
    expect(logs).not.toContain(KEY)
  })

  test("reset ne lit pas l'entrée standard et n'envoie que la portée", async () => {
    const launches = []
    const code = await runDemoGateList({ argv: ["reset"], readInput: async () => { throw new Error("entrée lue") }, env: { CONVEX_DEPLOY_KEY: KEY }, launch: async (args) => { launches.push(args); return 0 }, log: () => {}, warn: () => {} })
    expect(code).toBe(0)
    expect(launches).toEqual([["run", DEMO_GATE_LIST_FUNCTIONS.reset, JSON.stringify({ scope: "diaspora-ga" })]])
  })

  test("refus local (rang, liste vide) et clé absente : aucun lancement, code 2", async () => {
    for (const [argv, input, env] of [[["allow"], `${FIRST}\nnuméro\n`, { CONVEX_DEPLOY_KEY: KEY }], [["revoke"], "", { CONVEX_DEPLOY_KEY: KEY }], [["allow"], FIRST, {}], [["reset"], "", { CONVEX_DEPLOY_KEY: "  " }]]) {
      const { code, logs, launches } = await run(argv, input, env)
      expect(code).toBe(2)
      expect(launches).toEqual([])
      expect(logs).not.toContain("7700")
    }
  })

  test("`--dry-run` : le décompte, sans lancement ni clé exigée", async () => {
    const { code, logs, launches } = await run(["allow", "--dry-run"], `${FIRST}\n`, {})
    expect(code).toBe(0)
    expect(launches).toEqual([])
    expect(logs).toContain("1 numéro(s)")
    expect(logs).not.toContain("7700")
  })

  test("un échec de l'appel rend son code, sans numéro", async () => {
    const logs = []
    const code = await runDemoGateList({ argv: ["allow"], readInput: async () => FIRST, env: { CONVEX_DEPLOY_KEY: KEY }, launch: async () => 1, log: (message) => logs.push(message), warn: (message) => logs.push(message) })
    expect(code).toBe(1)
    expect(logs.join("\n")).not.toContain("7700")
  })
})
