import { BRAND_NAME } from "@antsia/social-contracts"
import { describe, expect, it } from "vitest"

import en from "./locales/en/antsia.json"
import fr from "./locales/fr/antsia.json"
import { getAppT } from "./server"

describe("traductions serveur isolées par langue", () => {
  it("conserve le français par défaut après des appels anglais et des interpolations locales", () => {
    const french = getAppT()
    const english = getAppT("en")
    const explicitFrench = getAppT("fr")
    const undefinedLocale = getAppT(undefined)

    expect(french.locale).toBe("fr")
    expect(undefinedLocale.locale).toBe("fr")
    expect(english.locale).toBe("en")
    expect(french.t("home.enter")).toBe(fr.home.enter)
    expect(english.t("home.enter")).toBe(en.home.enter)
    expect(english.t("meta.title", { brand: "Marque de cet appel" })).toBe(en.meta.title.replace("{{brand}}", "Marque de cet appel"))
    expect(english.t("meta.title")).toBe(en.meta.title.replace("{{brand}}", BRAND_NAME))
    expect(french.t("meta.title")).toBe(fr.meta.title.replace("{{brand}}", BRAND_NAME))
    expect(explicitFrench.t("home.enter")).toBe(fr.home.enter)
    expect(undefinedLocale.t("home.enter")).toBe(fr.home.enter)
  })
})
