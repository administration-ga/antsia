import type { CommerceMerchantTarget } from "@antsia/social-domain/commerce-merchant"
import type { CommercePaymentPreparationTarget } from "@antsia/social-domain/commerce-payment-preparation"
import { describe, expect, it, vi } from "vitest"
import { proFinancialPreparationHref, proMerchantTargetHref } from "./routes"

const shopRef = "pro.ga:structure:01ARZ3NDEKTSV4RRFFQ69G5FAV"
const prefix = "https://pro.example.test/structure/pro.ga%2Fstructure%2F01ARZ3NDEKTSV4RRFFQ69G5FAV"

describe("MP06 : destinations de gestion PRO fermées", () => {
  it.each([
    ["catalog", "catalogue"], ["new_offer", "catalogue/nouvelle"], ["quotes", "devis"], ["agenda", "agenda"], ["agenda_services", "agenda/prestations"], ["agenda_resources", "agenda/ressources"],
  ] as const)("ouvre le vrai écran %s sans autre paramètre", (target, path) => {
    expect(proMerchantTargetHref("https://pro.example.test", shopRef, target)).toBe(`${prefix}/${path}`)
  })
  it("refuse origine active, chemin privé, cible libre et référence d'un autre objet", () => {
    for (const origin of ["javascript:alert(1)", "https://user:pass@pro.example.test", "https://pro.example.test/private", "https://pro.example.test?token=secret", "https://pro.example.test#secret", " https://pro.example.test", "http://pro.example.test"]) expect(proMerchantTargetHref(origin, shopRef, "catalog")).toBeNull()
    for (const ref of [shopRef.replace("structure", "offer"), "pro.ga:structure:invalid", "../other"]) expect(proMerchantTargetHref("https://pro.example.test", ref, "catalog")).toBeNull()
    for (const target of ["__proto__", "../../private", "https://evil.test"]) expect(proMerchantTargetHref("https://pro.example.test", shopRef, target as CommerceMerchantTarget)).toBeNull()
  })
  it("autorise le poste local hors production et ferme HTTP en production", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(proMerchantTargetHref("http://localhost:3040", shopRef, "agenda")).toContain("http://localhost:3040/structure/")
    vi.stubEnv("NODE_ENV", "production")
    expect(proMerchantTargetHref("http://localhost:3040", shopRef, "agenda")).toBeNull()
    vi.unstubAllEnvs()
  })
})

describe("MP07 : destination financière fermée", () => {
  it("conserve uniquement l'écran paiements réel, sans compte ou secret dans l'adresse", () => {
    expect(proFinancialPreparationHref("https://pro.example.test", shopRef, "payments")).toBe(`${prefix}/paiements`)
    for (const target of ["policy", "__proto__", "../../private", "https://evil.test"]) expect(proFinancialPreparationHref("https://pro.example.test", shopRef, target as CommercePaymentPreparationTarget)).toBeNull()
  })
  it("refuse une origine ou une structure qui ne respecte pas le contrat", () => {
    for (const origin of ["https://user:pass@pro.example.test", "https://pro.example.test?token=secret", "https://pro.example.test/private", "javascript:alert(1)", "http://pro.example.test"]) expect(proFinancialPreparationHref(origin, shopRef, "payments")).toBeNull()
    expect(proFinancialPreparationHref("https://pro.example.test", shopRef.replace("structure", "offer"), "payments")).toBeNull()
  })
})
