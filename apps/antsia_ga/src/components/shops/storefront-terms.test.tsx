// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { getAppT } from "@/i18n/server"
import { publicStorefrontSchema } from "@/lib/public-shops-data"
import { StorefrontTerms } from "./storefront-terms"

const publishedAt = Date.UTC(2026, 9, 21)
const terms = { version: 1, publishedAt, pickup: { points: [{ establishmentRef: "pro.ga:establishment:01JA00000000000000000000E1", label: "Point Centre" }] }, delivery: { country: "GA", localities: ["Libreville"], label: "Livraison urbaine", fee: { amount: 1500, currency: "XAF" }, leadTimeDays: 2 }, fees: [{ kind: "packaging", label: "Emballage renforcé", amount: { amount: 500, currency: "XAF" } }], returns: { summary: "Contacter la boutique avant retour." } }
function render(value: unknown, locale: "fr" | "en", compact = false) {
  const { t } = getAppT(locale)
  const html = renderToStaticMarkup(<StorefrontTerms value={value} locale={locale} t={(key, options) => t(`shops:${key}`, options)} compact={compact} />)
  const node = document.createElement("div"); node.innerHTML = html
  return node
}
describe("MP05 conditions publiques du vendeur", () => {
  it.each(["fr", "en"] as const)("rend conditions déclarées, frais réels et absence de garantie (%s)", locale => {
    const node = render(terms, locale)
    expect(node.textContent).toContain("Point Centre")
    expect(node.textContent).toContain("Libreville")
    expect(node.textContent).toContain("XAF")
    expect(node.textContent).toContain("Emballage renforcé")
    expect(node.textContent).toContain(getAppT(locale).t("shops:storefrontTerms.unknown"))
    expect(node.textContent).not.toContain("pro.ga:")
    expect(node.querySelector("button, a, form")).toBeNull()
  })
  it("compact (panier) : une seule carte, les rubriques déclarées et « Non renseigné » pour les autres", () => {
    const node = render(terms, "fr", true)
    expect(node.querySelectorAll("dl")).toHaveLength(1)
    expect(node.querySelectorAll("dd")).toHaveLength(5)
    expect(node.textContent).toContain("Point Centre")
    expect(node.textContent).toContain("Emballage renforcé")
    expect([...node.querySelectorAll("dd")].at(-1)?.textContent).toBe("Non renseigné")
  })
  it("n'invente ni gratuité ni engagement lorsque les conditions manquent", () => {
    const node = render(undefined, "fr")
    expect(node.querySelectorAll("dd")).toHaveLength(5)
    expect([...node.querySelectorAll("dd")].every(el => el.textContent === "Non renseigné")).toBe(true)
    expect(node.textContent).not.toContain("XAF")
  })
  it("ne rend pas un corps invalide, une URL ou une date hors contrat", () => {
    for (const value of [{ ...terms, publishedAt: NaN }, { ...terms, returns: { summary: "https://interdit.example" } }, { ...terms, secret: "jamais exposer" }]) {
      const node = render(value, "fr")
      expect(node.textContent).not.toContain("Point Centre")
      expect(node.textContent).not.toContain("interdit.example")
      expect(node.textContent).not.toContain("jamais exposer")
    }
  })
  it("le schéma SSR n'accepte pas de champ commercial privé", () => {
    const base = { handle: "atelier", name: "Atelier partagé", description: null, logoUrl: null, bannerUrl: null, model: "products", specialty: null, serviceArea: null, hours: null, badge: "community", blocks: ["about"], publishedAt, origin: { slug: "antsia", name: "ANTSIA" } }
    expect(publicStorefrontSchema.safeParse({ ...base, storefrontTerms: terms }).success).toBe(true)
    expect(publicStorefrontSchema.safeParse({ ...base, storefrontTerms: { ...terms, privateBankAccount: "secret" } }).success).toBe(false)
  })
})
