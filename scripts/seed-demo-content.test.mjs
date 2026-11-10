import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"

import { adminClient, deploymentOfKey, seedDemoContent, seedMedia } from "./seed-demo-content.mjs"

const DEMO_KEY = "prod:vivid-hedgehog-655|cle-secrete-de-test"
const PROD_KEY = "prod:diligent-avocet-585|cle-secrete-de-test"
const originalFetch = globalThis.fetch
let consoleSpies

beforeEach(() => {
  globalThis.fetch = mock(async () => { throw new Error("Tout accès réseau non simulé est interdit dans ce test.") })
  consoleSpies = ["log", "warn", "error"].map(method => spyOn(console, method).mockImplementation(() => {}))
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const spy of consoleSpies) spy.mockRestore()
})

const target = (overrides = {}) => ({ key: "animation-20261020:post:membre-carte-mere:image", kind: "post", ownerHandle: "membre.demo", asset: "membre-reparation-portable", file: "photos-20261021/membre-reparation-portable.jpg", targetId: "p1", caption: null, attached: false, ...overrides })

describe("clé de déploiement de la démonstration", () => {
  test.each([
    [DEMO_KEY, "vivid-hedgehog-655"],
    ["dev:vivid-hedgehog-655|x", "vivid-hedgehog-655"],
    [PROD_KEY, "diligent-avocet-585"],
    ["sans-separateur", null],
    [undefined, null],
  ])("lit le déploiement de %p sans l'afficher", (key, expected) => {
    expect(deploymentOfKey(key)).toBe(expected)
  })

  test.each([PROD_KEY, undefined, ""])("refuse toute clé qui ne désigne pas la démo, avant tout appel : %p", key => {
    expect(() => adminClient(key)).toThrow("ANTSIA_CONVEX_DEMO_DEPLOY_KEY ne désigne pas vivid-hedgehog-655.")
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

describe("images : octets du dépôt, cibles planifiées par le serveur", () => {
  test("ne transmet que les cibles en attente, encodées, puis relit le reste", async () => {
    const planned = [target(), target({ key: "k2", kind: "person_avatar", ownerHandle: "ines.obame.demo", asset: "figurant-portrait-4", file: "photos-20261021/figurant-portrait-4.jpg" }), target({ key: "k3", attached: true })]
    const calls = []
    const call = mock(async (name, args) => {
      calls.push([name, args])
      if (name === "seeds/demoContent:mediaTargets") return calls.length === 1 ? planned : planned.map(item => ({ ...item, attached: true }))
      if (name === "seeds/demoContentMedia:storeAsset") return { attached: args.key !== "k2" }
      throw new Error(`Fonction inattendue : ${name}`)
    })
    const readMedia = mock(async file => new TextEncoder().encode(`octets:${file}`))
    const log = mock(() => {})
    expect(await seedMedia(call, { log, readMedia })).toEqual({ attached: 1, remaining: 0 })
    expect(readMedia.mock.calls.map(([file]) => file)).toEqual(["photos-20261021/membre-reparation-portable.jpg", "photos-20261021/figurant-portrait-4.jpg"])
    const stored = calls.filter(([name]) => name === "seeds/demoContentMedia:storeAsset").map(([, args]) => args)
    expect(stored.map(args => args.key)).toEqual([planned[0].key, "k2"])
    expect(Buffer.from(stored[0].dataBase64, "base64").toString()).toBe("octets:photos-20261021/membre-reparation-portable.jpg")
    expect(stored.every(args => args.confirmNonProduction === "ANTSIA_DEMO_CONTENT_2026_10_20")).toBe(true)
  })

  test.each(["../../../.env.local", "photos-20261021/../../secret.jpg", "/etc/passwd", "photos-20261021/x.svg"])("refuse un fichier hors du catalogue public : %p", async file => {
    const call = mock(async () => [target({ file })])
    const readMedia = mock(async () => new Uint8Array())
    await expect(seedMedia(call, { log: () => {}, readMedia })).rejects.toThrow("Fichier d'illustration refusé.")
    expect(readMedia).not.toHaveBeenCalled()
  })
})

describe("enchaînement des graines", () => {
  test("comptes OTP, contenus, figurants puis images, sans jamais afficher la clé", async () => {
    const order = []
    const prepare = {
      prepareDemoAccounts: mock(async (target, options) => { order.push(`acteurs:${target}:${options.apply === true}`); return {} }),
      prepareDemoFigurants: mock(async (target, options) => { order.push(`figurants:${target}:${options.apply === true}`); return {} }),
    }
    const call = mock(async name => {
      order.push(name)
      if (name === "seeds/demoContent:run") return { postsCreated: 52, postsExisting: 0 }
      if (name === "seeds/demoContent:runFigurants") return { figurants: 10, postsCreated: 20, connections: 30, requests: 16 }
      if (name === "seeds/demoConversations:run") return { directMessages: 25, shopMessages: 15, channelEnabled: true }
      if (name === "seeds/demoContent:mediaTargets") return []
      throw new Error(`Fonction inattendue : ${name}`)
    })
    const log = mock(() => {})
    const report = await seedDemoContent({ key: DEMO_KEY, client: { call }, prepare, log })
    expect(order).toEqual(["acteurs:demo:true", "figurants:demo:true", "seeds/demoContent:run", "seeds/demoContent:runFigurants", "seeds/demoConversations:run", "seeds/demoContent:mediaTargets", "seeds/demoContent:mediaTargets"])
    expect(report.media).toEqual({ attached: 0, remaining: 0 })
    const output = JSON.stringify({ report, logs: log.mock.calls, console: consoleSpies.flatMap(spy => spy.mock.calls) })
    expect(output).not.toContain("cle-secrete-de-test")
  })

  test("le dry-run ne fait que lire les catalogues de comptes", async () => {
    const prepare = {
      prepareDemoAccounts: mock(async (_target, options) => ({ action: options.apply ? "apply" : "dry-run" })),
      prepareDemoFigurants: mock(async (_target, options) => ({ action: options.apply ? "apply" : "dry-run" })),
    }
    const call = mock(async () => { throw new Error("Aucune graine en dry-run.") })
    const report = await seedDemoContent({ key: DEMO_KEY, dryRun: true, client: { call }, prepare, log: () => {} })
    expect(report).toEqual({ action: "dry-run", accounts: { action: "dry-run" }, figurants: { action: "dry-run" } })
    expect(call).not.toHaveBeenCalled()
  })
})
