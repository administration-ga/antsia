import { describe, expect, it } from "vitest"

import { effectiveActivityConfiguration, parseActivityConfiguration, visibleActivityBlocks, type ActivityConfiguration } from "./activityConfiguration"

const mixed: ActivityConfiguration = { version: 1, capabilities: ["services", "products"], template: "fashion", blocks: ["services", "about", "catalog", "publications"] }

describe("MP02 — configuration d'une activité", () => {
  it("conserve la compatibilité des deux modèles historiques sans mutation", () => {
    expect(effectiveActivityConfiguration(undefined, "products")).toEqual({ version: 1, capabilities: ["products"], template: "general", blocks: ["catalog", "publications", "about"] })
    expect(effectiveActivityConfiguration(undefined, "quote_services")).toEqual({ version: 1, capabilities: ["services"], template: "local", blocks: ["services", "publications", "about"] })
  })

  it("normalise les capacités mais conserve l'ordre choisi des blocs", () => {
    const parsed = parseActivityConfiguration(mixed)
    expect(parsed).toEqual({ ...mixed, capabilities: ["products", "services"] })
    expect(mixed.capabilities).toEqual(["services", "products"])
    expect(parsed?.blocks).not.toBe(mixed.blocks)
  })

  it.each([
    null, [], {}, { ...mixed, version: 2 }, { ...mixed, template: "free_css" },
    { ...mixed, capabilities: [] }, { ...mixed, capabilities: ["products", "products"] },
    { ...mixed, capabilities: ["payments"] }, { ...mixed, capabilities: ["services"], blocks: ["catalog"] },
    { ...mixed, capabilities: ["products"], blocks: ["services"] },
    { ...mixed, blocks: [] }, { ...mixed, blocks: ["about", "about"] }, { ...mixed, blocks: ["stock"] },
    { ...mixed, badge: "official" }, { ...mixed, price: 1200 },
  ])("refuse les données étrangères, doublons, versions et combinaisons incohérentes", (value) => {
    expect(parseActivityConfiguration(value)).toBeNull()
  })

  it("n'affiche que les blocs choisis qui disposent d'un contenu autorisé", () => {
    expect(visibleActivityBlocks(mixed, ["catalog", "services", "about"])).toEqual(["services", "about", "catalog"])
    expect(visibleActivityBlocks(mixed, ["about"])).toEqual(["about"])
    expect(visibleActivityBlocks(mixed, [])).toEqual([])
  })

  it("prépare le média sans inventer une rédaction ni un bloc commercial", () => {
    const media = parseActivityConfiguration({ version: 1, capabilities: ["media"], template: "media", blocks: ["publications", "about"] })
    expect(media).not.toBeNull()
    expect(visibleActivityBlocks(media!, ["catalog", "services", "about"])).toEqual(["about"])
  })
})
