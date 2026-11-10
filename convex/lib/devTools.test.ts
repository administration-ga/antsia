/** La garde des outils de développement et celle, plus étroite, du déploiement de démonstration. */
import { describe, expect, it } from "vitest"

import { cloudDeploymentName, DEMO_EMAIL_DOMAINS, demoAccountsAllowed, demoCodeReadable, demoDeploymentDeclared, devToolsAllowed, isDemoEmail } from "./devTools"

const DEMO = { CONVEX_CLOUD_URL: "https://demo-antsia-123.convex.cloud", ANTSIA_DEMO_DEPLOYMENT: "demo-antsia-123" }
const LOCAL = { CONVEX_CLOUD_URL: "http://127.0.0.1:3210", ANTSIA_DEV_TOOLS: "true" }

describe("cloudDeploymentName — le nom lu dans l'adresse du déploiement", () => {
  it("rend le nom d'un déploiement en nuage, région comprise", () => {
    expect(cloudDeploymentName({ CONVEX_CLOUD_URL: "https://demo-antsia-123.convex.cloud" })).toBe("demo-antsia-123")
    expect(cloudDeploymentName({ CONVEX_CLOUD_URL: "https://demo-antsia-123.eu-west-1.convex.cloud" })).toBe("demo-antsia-123")
  })

  it("rien pour un backend local, une adresse non sécurisée, étrangère ou malformée", () => {
    for (const url of [undefined, "", "http://127.0.0.1:3210", "http://demo-antsia-123.convex.cloud", "https://demo-antsia-123.convex.cloud.example.test", "https://user:pass@demo-antsia-123.convex.cloud", "https://demo-antsia-123.convex.cloud:8443", "pas une adresse"]) {
      expect(cloudDeploymentName({ CONVEX_CLOUD_URL: url })).toBeNull()
    }
  })
})

describe("demoDeploymentDeclared — la démonstration se déclare par le nom même du déploiement", () => {
  it("ouverte quand la variable nomme CE déploiement", () => {
    expect(demoDeploymentDeclared(DEMO)).toBe(true)
    expect(demoDeploymentDeclared({ ...DEMO, ANTSIA_DEMO_DEPLOYMENT: " demo-antsia-123 " })).toBe(true)
  })

  it("une variable recopiée sur un autre déploiement (la production comprise) n'ouvre rien", () => {
    expect(demoDeploymentDeclared({ ...DEMO, CONVEX_CLOUD_URL: "https://production-antsia-456.convex.cloud" })).toBe(false)
    expect(demoDeploymentDeclared({ ...DEMO, ANTSIA_DEMO_DEPLOYMENT: "true" })).toBe(false)
    expect(demoDeploymentDeclared({ ...DEMO, ANTSIA_DEMO_DEPLOYMENT: "" })).toBe(false)
    expect(demoDeploymentDeclared({ CONVEX_CLOUD_URL: DEMO.CONVEX_CLOUD_URL })).toBe(false)
    expect(demoDeploymentDeclared({ CONVEX_CLOUD_URL: "http://127.0.0.1:3210", ANTSIA_DEMO_DEPLOYMENT: "127" })).toBe(false)
  })

  it("n'ouvre AUCUN outil de développement : seulement les comptes de démonstration", () => {
    expect(devToolsAllowed({ ...DEMO, ANTSIA_DEV_TOOLS: "true" })).toBe(false)
    expect(demoAccountsAllowed(DEMO)).toBe(true)
    expect(demoAccountsAllowed(LOCAL)).toBe(true)
    expect(demoAccountsAllowed({})).toBe(false)
  })
})

describe("demoCodeReadable — quels codes s'affichent à l'écran", () => {
  it("en développement local : tous", () => {
    expect(demoCodeReadable("alice@example.test", LOCAL)).toBe(true)
    expect(demoCodeReadable("+24107890123", LOCAL)).toBe(true)
  })

  it("sur la démonstration déclarée : ceux des adresses réservées seulement, ANTSIA et DIASPORALE (ADR-0038)", () => {
    expect(demoCodeReadable("membre@demo.antsia.test", DEMO)).toBe(true)
    expect(demoCodeReadable(" Membre@DEMO.antsia.test ", DEMO)).toBe(true)
    expect(demoCodeReadable("moderateur@demo.diasporale.test", DEMO)).toBe(true)
    expect(demoCodeReadable(" Verifie@DEMO.diasporale.test ", DEMO)).toBe(true)
    expect(demoCodeReadable("alice@example.test", DEMO)).toBe(false)
    expect(demoCodeReadable("membre@demo.antsia.test.example.test", DEMO)).toBe(false)
    expect(demoCodeReadable("membre@demo.diasporale.test.example.test", DEMO)).toBe(false)
    expect(demoCodeReadable("membre@diasporale.test", DEMO)).toBe(false)
    expect(demoCodeReadable("+24107890123", DEMO)).toBe(false)
  })

  it("ailleurs : aucun", () => {
    expect(demoCodeReadable("membre@demo.antsia.test", {})).toBe(false)
    expect(demoCodeReadable("membre@demo.antsia.test", { ...DEMO, CONVEX_CLOUD_URL: "https://production-antsia-456.convex.cloud" })).toBe(false)
    expect(demoCodeReadable("moderateur@demo.diasporale.test", {})).toBe(false)
    expect(demoCodeReadable("moderateur@demo.diasporale.test", { ...DEMO, CONVEX_CLOUD_URL: "https://production-antsia-456.convex.cloud" })).toBe(false)
  })

  it("les domaines réservés se lisent sans casse ni espaces, jamais en sous-chaîne", () => {
    expect(DEMO_EMAIL_DOMAINS).toEqual(["demo.antsia.test", "demo.diasporale.test"])
    expect(isDemoEmail("presse@demo.antsia.test")).toBe(true)
    expect(isDemoEmail("presse@xdemo.antsia.test")).toBe(false)
    expect(isDemoEmail("demo.antsia.test@example.test")).toBe(false)
    expect(isDemoEmail("institution@demo.diasporale.test")).toBe(true)
    expect(isDemoEmail("institution@xdemo.diasporale.test")).toBe(false)
    expect(isDemoEmail("demo.diasporale.test@example.test")).toBe(false)
  })
})
