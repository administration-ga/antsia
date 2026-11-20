import { describe, expect, it } from "vitest"

import { createUsagePayload, createUsageFunnelPayload, isUsageLocale, isUsageNetwork, isUsageScreen, resolvePostHogConfiguration, USAGE_SCREENS, USAGE_FUNNEL_STEPS } from "./posthog"

const configuration = { endpoint: "https://eu.i.posthog.com/i/v0/e/", projectToken: "phc_0123456789abcdef0123456789abcdef" }
const view = {
  projectToken: configuration.projectToken,
  distinctId: "01234567-89ab-4cde-8fab-0123456789ab",
  screen: "feed",
  networkSlug: "antsia",
  locale: "fr",
}

describe("Configuration facultative de mesure", () => {
  it("accepte le cloud UE exact et le jeton public de projet", () => {
    expect(resolvePostHogConfiguration(configuration)).toEqual(configuration)
    expect(resolvePostHogConfiguration({ ...configuration, personalApiKey: "ignored" })).toEqual(configuration)
  })

  it("ferme les autres origines sauf relais UE déclaré explicitement et exactement", () => {
    for (const endpoint of ["https://us.i.posthog.com/i/v0/e/", "https://analytics.example.test/i/v0/e/", "https://eu.i.posthog.com.evil.test/i/v0/e/", "https://eu.i.posthog.com:8443/i/v0/e/", "https://eu.i.posthog.com/other"]) {
      expect(resolvePostHogConfiguration({ ...configuration, endpoint })).toBeNull()
    }
    const relay = { ...configuration, endpoint: "https://analytics.example.test/i/v0/e/", euRelayOrigin: "https://analytics.example.test" }
    expect(resolvePostHogConfiguration(relay)).toEqual(relay)
    for (const euRelayOrigin of ["https://other.example.test", "https://analytics.example.test/", "http://analytics.example.test", "https://user@analytics.example.test", "https://analytics.example.test?private=1", true]) {
      expect(resolvePostHogConfiguration({ ...relay, euRelayOrigin })).toBeNull()
    }
  })

  it("refuse HTTP, chemins relatifs, credentials, paramètres et fragments", () => {
    for (const endpoint of [
      "http://analytics.example.test/i/v0/e/", "/i/v0/e/", "PLACEHOLDER", " https://analytics.example.test/i/v0/e/",
      "https://user:pass@analytics.example.test/i/v0/e/", "https://analytics.example.test/i/v0/e/?secret=1",
      "https://analytics.example.test/i/v0/e/#private", "https://analytics.example.test/i/v0/e/?",
      "https://analytics.example.test/i/v0/e/#",
    ]) expect(resolvePostHogConfiguration({ ...configuration, endpoint })).toBeNull()
  })

  it("refuse les clés personnelles, jetons incomplets, placeholders et types invalides", () => {
    for (const projectToken of [
      null, 12, "PLACEHOLDER", "phx_0123456789abcdef0123456789abcdef", "phc_short",
      "phc_PLACEHOLDER0123456789abcdef", "phc_REPLACE0123456789abcdef0123", "phc_yourprojecttoken0123456789abcdef",
    ]) expect(resolvePostHogConfiguration({ ...configuration, projectToken })).toBeNull()
    for (const invalid of [null, undefined, [], configuration.projectToken, { endpoint: 3 }, {}]) {
      expect(resolvePostHogConfiguration(invalid)).toBeNull()
    }
  })
})

describe("Funnel d'accueil fermé et sans rétention entre visites", () => {
  it("projette seulement les quatre étapes métier autorisées", () => {
    for (const step of USAGE_FUNNEL_STEPS) {
      const payload = createUsageFunnelPayload({ ...view, step, personId: "private-person", content: "private-body", duration: 123, handle: "private-handle" })
      expect(payload).toEqual({ token: configuration.projectToken, event: "onboarding_step", properties: { distinct_id: view.distinctId, step, network: "antsia", locale: "fr", $process_person_profile: false, $geoip_disable: true } })
      expect(JSON.stringify(payload)).not.toMatch(/private|content|duration|handle|screen/)
    }
    for (const step of ["sign_in_failed", "/entrer", "private-person", null, 1]) expect(createUsageFunnelPayload({ ...view, step })).toBeNull()
    expect(createUsageFunnelPayload({ ...view, step: "entry_started", distinctId: "persistent-person" })).toBeNull()
  })
})

describe("Projection de mesure fermée", () => {
  it("ne conserve que les propriétés admises, même si l'entrée contient du contenu et des identités", () => {
    const payload = createUsagePayload({
      ...view,
      url: "/messages/private?q=confidential",
      handle: "awa.ndong",
      personId: "persons_private",
      idnSub: "idn-private",
      email: "private@example.test",
      content: "private body",
      error: "private failure",
      userAgent: "private agent",
      dom: "private html",
      replay: "private recording",
    })
    expect(payload).toEqual({
      token: configuration.projectToken,
      event: "screen_viewed",
      properties: {
        distinct_id: view.distinctId,
        screen: "feed",
        network: "antsia",
        locale: "fr",
        $process_person_profile: false,
        $geoip_disable: true,
      },
    })
    expect(JSON.stringify(payload)).not.toMatch(/private|awa\.ndong|confidential/)
  })

  it("admet les dix catégories d'écran et refuse une route, un identifiant ou une catégorie inconnue", () => {
    expect(USAGE_SCREENS).toHaveLength(10)
    for (const screen of USAGE_SCREENS) expect(isUsageScreen(screen)).toBe(true)
    for (const screen of [null, "", "settings", "/messages/private", "awa.ndong", "persons_private"]) {
      expect(isUsageScreen(screen)).toBe(false)
      expect(createUsagePayload({ ...view, screen })).toBeNull()
    }
  })

  it("ne laisse passer que les noms publics des réseaux documentés et les langues admises", () => {
    for (const network of ["antsia", "diaspora-ga", "administration"]) expect(isUsageNetwork(network)).toBe(true)
    for (const networkSlug of ["persons_private", "jh7a0123456789abcdefghijklmn", "awa.ndong", "/fil", "private-network"]) {
      expect(isUsageNetwork(networkSlug)).toBe(false)
      expect(createUsagePayload({ ...view, networkSlug })).toBeNull()
    }
    expect(isUsageLocale("fr")).toBe(true)
    expect(isUsageLocale("en")).toBe(true)
    for (const locale of ["fr-FR", "es", null, 1]) {
      expect(isUsageLocale(locale)).toBe(false)
      expect(createUsagePayload({ ...view, locale })).toBeNull()
    }
  })

  it("refuse toute identité autre qu'un UUID aléatoire éphémère v4", () => {
    for (const distinctId of ["awa.ndong", "idn-sub", "persons_private", "shared-anonymous", null, "01234567-89ab-1cde-8fab-0123456789ab"]) {
      expect(createUsagePayload({ ...view, distinctId })).toBeNull()
    }
    expect(createUsagePayload({ ...view, projectToken: "PLACEHOLDER" })).toBeNull()
    expect(createUsagePayload(null)).toBeNull()
  })
})
