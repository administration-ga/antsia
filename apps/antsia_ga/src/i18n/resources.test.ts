/** Lexique ANTSIA : scénarios écrits, non exécutés à la demande du propriétaire. */
import { BRAND_NAME } from "@antsia/social-contracts"
import { createAppI18n, engineResources } from "@antsia/social-features/i18n"
import { describe, expect, it } from "vitest"

import { composeAntsiaEngineOverrides } from "./compose-engine-overrides"
import frOverrides from "./overrides/fr.json"
import enOverrides from "./overrides/en.json"
import { APP_NAMESPACE, appResources } from "./resources"
import { getAppT } from "./server"

function leaves(record: Readonly<Record<string, unknown>>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") result[path] = value
    else if (value !== null && typeof value === "object" && !Array.isArray(value)) Object.assign(result, leaves(value as Record<string, unknown>, path))
  }
  return result
}

describe("composition des namespaces ANTSIA", () => {
  it("compose en profondeur sans muter ou partager les objets du moteur", () => {
    const navigation = Object.freeze({ label: "Fil", hint: "{{count}} publications", alternatives: ["a", "b"] })
    const base = Object.freeze({ nav: navigation, other: Object.freeze({ keep: "Conserver" }) })
    const result = composeAntsiaEngineOverrides({ reseau: base }, { reseau: { nav: { label: "Accueil" } } })
    expect(result.reseau).toEqual({ nav: { label: "Accueil", hint: "{{count}} publications", alternatives: ["a", "b"] }, other: { keep: "Conserver" } })
    expect(result.reseau).not.toBe(base)
    expect(result.reseau?.nav).not.toBe(navigation)
    expect(result.reseau?.other).not.toBe(base.other)
    expect(base.nav.label).toBe("Fil")
    expect(() => composeAntsiaEngineOverrides({ reseau: base }, { reseau: { missing: "Inconnue" } })).toThrow()
  })

  it("conserve toutes les clés de chaque namespace complet, les pluriels et interpolations", () => {
    const overrides = { fr: frOverrides, en: enOverrides }
    expect(Object.keys(leaves(frOverrides)).sort()).toEqual(Object.keys(leaves(enOverrides)).sort())
    for (const locale of ["fr", "en"] as const) {
      const before = JSON.stringify(engineResources[locale])
      const composed = composeAntsiaEngineOverrides(engineResources[locale], overrides[locale])
      const sourceNamespaces: Readonly<Record<string, Record<string, unknown>>> = engineResources[locale]
      for (const [namespace, partial] of Object.entries(overrides[locale])) {
        const original = leaves(sourceNamespaces[namespace]!), adapted = leaves(composed[namespace]!)
        const changed = leaves(partial)
        expect(Object.keys(adapted).sort(), `${locale}:${namespace}`).toEqual(Object.keys(original).sort())
        for (const [key, value] of Object.entries(original)) {
          if (!Object.hasOwn(changed, key)) expect(adapted[key], `${locale}:${namespace}.${key}`).toBe(value)
          else expect(adapted[key]?.match(/\{\{[^}]+\}\}/gu) ?? [], `${locale}:${namespace}.${key}`).toEqual(value.match(/\{\{[^}]+\}\}/gu) ?? [])
        }
      }
      expect(JSON.stringify(engineResources[locale])).toBe(before)
    }
  })
})

describe.each(["fr", "en"] as const)("lexique ANTSIA %s partagé serveur/client", (locale) => {
  function client() {
    return createAppI18n({ locale, appResources, defaultNS: APP_NAMESPACE, defaultVariables: { brand: BRAND_NAME } })
  }

  it("emploie les mêmes noms en SSR et dans le fournisseur client", () => {
    const server = getAppT(locale), browser = client()
    const expected = locale === "fr" ? {
      "direct:directory.title": "Direct", "direct:status.live": "En live", "direct:create.submit": "Préparer un direct", "direct:start": "Lancer le direct",
      "direct:directory.replays": "Replays", "stories:storiesTray.label": "Stories", "antsia:stories.title": "Stories",
      "reseau:reseauDestinations.fil": "Accueil", "reseau:reseauDestinations.decouvrir": "Explorer", "reseau:reseauAgentNav.tabs.relations.label": "Mon réseau",
      "reseau:reseauAgentNav.tabs.enregistrements.label": "Enregistrés", "antsia:feedPreferences.title": "Mon fil",
      "memberNetwork:nav.discover": "Explorer", "publicNetwork:nav.myFeed": "Accueil",
      "reseau:profilPersonnePage.connection.connect": "Ajouter à mon réseau",
    } : {
      "direct:directory.title": "Live", "direct:status.live": "Live", "direct:create.submit": "Prepare a live stream", "direct:start": "Start the live stream",
      "direct:directory.replays": "Replays", "stories:storiesTray.label": "Stories", "antsia:stories.title": "Stories",
      "reseau:reseauDestinations.fil": "Home", "reseau:reseauDestinations.decouvrir": "Explore", "reseau:reseauAgentNav.tabs.relations.label": "My network",
      "reseau:reseauAgentNav.tabs.enregistrements.label": "Saved", "antsia:feedPreferences.title": "My feed",
      "memberNetwork:nav.discover": "Explore", "publicNetwork:nav.myFeed": "Home",
      "reseau:profilPersonnePage.connection.connect": "Add to my network",
    }
    for (const [key, value] of Object.entries(expected)) {
      expect(server.t(key), key).toBe(value)
      expect(browser.t(key), key).toBe(value)
    }
    expect(browser.t("stories:storiesTray.tile.storyCount", { count: 1 })).toBe("1 story")
    expect(browser.t("stories:storiesTray.tile.storyCount", { count: 2 })).toBe("2 stories")
    expect(browser.t("reseau:shared.notification.liveInvite", { actor: "Awa" })).toBe(locale === "fr" ? "Awa vous invite à un direct." : "Awa invites you to a live stream.")
  })

  it("laisse la sémantique relationnelle, le micro et les services indisponibles dans le moteur", () => {
    const browser = client()
    const engineOnly = createAppI18n({ locale, appResources: { fr: {}, en: {} }, defaultNS: APP_NAMESPACE })
    for (const key of [
      "direct:audience.connections", "direct:microphoneOn", "direct:replayFailure.recording_unavailable",
      "iappel:callStage.mic", "reseau:shared.audience.connections", "shell:appearance.light", "notifications:notificationBell.title",
      "reseau:profilPersonnePage.connection.connected", "reseau:profilPersonnePage.connection.requested", "reseau:profilPersonnePage.follow.follow",
    ]) expect(browser.t(key), key).toBe(engineOnly.t(key))
    expect(engineOnly.t("direct:directory.title")).toBe(locale === "fr" ? "Conférences" : "Conferences")
    expect(browser.t("messagerie:icomMobileTabs.unseenStatuses", { count: 2 })).toBe(locale === "fr" ? "2 stories non vues" : "2 unseen stories")
  })
})
