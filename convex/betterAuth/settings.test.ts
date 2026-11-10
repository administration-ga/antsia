import { describe, expect, it } from "vitest"

import catalog from "../../deploy/catalog.json"
import { applicationOfOrigin, authenticationConfiguration, idnConfiguration, idnProfileProof, isE164Phone, parseOriginList, smsConfiguration, trustedOrigins } from "./settings"

// L'inventaire reste exhaustif ; seules les entrées web déclarent une origine HTTP.
const webApplications = Object.entries(catalog.applications).flatMap(([key, app]) =>
  app.platform === "web" && "site_url" in app && "dev_port" in app ? [{ ...app, key }] : [],
)

const idnEnv = {
  IDN_CLIENT_ID: "sandbox-client-fixture",
  IDN_CLIENT_SECRET: "fictional-idn-secret-for-tests",
  IDN_ISSUER: "https://idn.example.test",
}

describe("configuration des portes PA4", () => {
  it("IDN est fermé tant que les trois éléments de configuration ne sont pas présents", () => {
    expect(idnConfiguration({})).toBeNull()
    expect(idnConfiguration({ IDN_ISSUER: idnEnv.IDN_ISSUER })).toBeNull()
    expect(idnConfiguration({ ...idnEnv, IDN_CLIENT_ID: " " })).toBeNull()
    expect(idnConfiguration({ ...idnEnv, IDN_CLIENT_SECRET: " " })).toBeNull()
    expect(idnConfiguration({ ...idnEnv, IDN_ISSUER: undefined })).toBeNull()
  })

  it.each(["http://idn.example.test", "https://user:pass@idn.example.test", "https://idn.example.test/#fragment", "not-a-url"])("refuse un émetteur IDN mal configuré : %s", (issuer) => {
    expect(idnConfiguration({ ...idnEnv, IDN_ISSUER: issuer })).toBeNull()
  })

  it("accepte le discovery explicite HTTPS sans inventer un émetteur", () => {
    const config = idnConfiguration({ ...idnEnv, IDN_ISSUER: undefined, IDN_DISCOVERY_URL: "https://idn.example.test/oidc/discovery" })
    expect(config).toEqual({ clientId: idnEnv.IDN_CLIENT_ID, clientSecret: idnEnv.IDN_CLIENT_SECRET, discoveryUrl: "https://idn.example.test/oidc/discovery" })
  })

  it("le relais SMS est fermé pour un fournisseur, une clé ou une URL invalide", () => {
    expect(smsConfiguration({})).toBeNull()
    expect(smsConfiguration({ SMS_PROVIDER: "unknown", SMS_ENDPOINT: "https://sms.example.test", SMS_API_KEY: "fictional-key" })).toBeNull()
    expect(smsConfiguration({ SMS_PROVIDER: "webhook", SMS_ENDPOINT: "http://sms.example.test", SMS_API_KEY: "fictional-key" })).toBeNull()
    expect(smsConfiguration({ SMS_PROVIDER: "webhook", SMS_ENDPOINT: "https://sms.example.test", SMS_API_KEY: " " })).toBeNull()
    expect(smsConfiguration({ SMS_PROVIDER: "webhook", SMS_ENDPOINT: "https://sms.example.test/send", SMS_API_KEY: "fictional-key" })).toEqual({ endpoint: "https://sms.example.test/send", apiKey: "fictional-key" })
  })

  it("la projection publique expose les portes et les applications sans aucun secret", () => {
    const config = authenticationConfiguration({
      ...idnEnv,
      SITE_URL: "https://entry.example.test",
      RESEND_API_KEY: "fictional-mail-key",
      RESEND_FROM_ADDRESS: "ANTSIA <auth@example.test>",
      SMS_PROVIDER: "webhook",
      SMS_ENDPOINT: "https://sms.example.test/send",
      SMS_API_KEY: "fictional-sms-key",
      BETTER_AUTH_SECRET: "fictional-session-secret-which-is-not-returned",
    })
    expect(config).toMatchObject({ idn: true, emailOtp: true, smsOtp: true, localCodes: false })
    expect(Object.keys(config).sort()).toEqual(["applications", "demoAccounts", "emailOtp", "idn", "localCodes", "smsOtp", "trustedOrigins"])
    const serialized = JSON.stringify(config)
    for (const secret of [idnEnv.IDN_CLIENT_SECRET, "fictional-mail-key", "fictional-sms-key", "fictional-session-secret-which-is-not-returned"]) expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain("https://sms.example.test/send")
    expect(config.applications).toEqual(webApplications.map((app) => ({ key: app.key, origin: new URL(app.site_url).origin })))
  })

  it("une entrée native n'ajoute aucune origine ou porte HTTP implicite", () => {
    expect(catalog.applications.antsia_mobile.platform).toBe("expo-native")
    const config = authenticationConfiguration({})
    expect(config.applications.map((app) => app.key)).toEqual(webApplications.map((app) => app.key))
    expect(config.applications.some((app) => String(app.key) === "antsia_mobile")).toBe(false)
    expect(trustedOrigins({})).toEqual(webApplications.map((app) => new URL(app.site_url).origin))
    expect(applicationOfOrigin("antsia-mobile://auth", {})).toBeNull()
    expect(applicationOfOrigin("exp://localhost:8081", {})).toBeNull()
    expect(trustedOrigins({ ANTSIA_DEV_TOOLS: "true", CONVEX_CLOUD_URL: "http://127.0.0.1:3210" })).not.toContain("http://localhost:8081")
  })

  it("des portes non configurées restent annoncées fermées hors développement local", () => {
    expect(authenticationConfiguration({})).toMatchObject({ idn: false, emailOtp: false, smsOtp: false, localCodes: false })
  })

  it("la démonstration déclarée annonce ses comptes et le code e-mail, sans codes locaux ni ports locaux", () => {
    const demo = { CONVEX_CLOUD_URL: "https://demo-antsia-123.convex.cloud", ANTSIA_DEMO_DEPLOYMENT: "demo-antsia-123", ANTSIA_DEV_TOOLS: "true" }
    expect(authenticationConfiguration(demo)).toMatchObject({ demoAccounts: true, emailOtp: true, smsOtp: false, localCodes: false })
    expect(trustedOrigins(demo).some((origin) => origin.includes("localhost") || origin.includes("127.0.0.1"))).toBe(false)
    const copied = { ...demo, CONVEX_CLOUD_URL: "https://production-antsia-456.convex.cloud" }
    expect(authenticationConfiguration(copied)).toMatchObject({ demoAccounts: false, emailOtp: false, localCodes: false })
    expect(authenticationConfiguration({})).toMatchObject({ demoAccounts: false })
  })

  it("les codes et les ports locaux exigent ensemble le backend local et la variable explicite", () => {
    const local = { ANTSIA_DEV_TOOLS: "true", CONVEX_CLOUD_URL: "http://127.0.0.1:3210" }
    expect(authenticationConfiguration(local)).toMatchObject({ localCodes: true, emailOtp: true, smsOtp: true })
    for (const app of webApplications) expect(trustedOrigins(local)).toContain(`http://localhost:${app.dev_port}`)
    const cloud = { ...local, CONVEX_CLOUD_URL: "https://backend.example.test" }
    expect(authenticationConfiguration(cloud).localCodes).toBe(false)
    expect(trustedOrigins(cloud).some((origin) => origin.includes("localhost") || origin.includes("127.0.0.1"))).toBe(false)
    expect(authenticationConfiguration({ ...local, ANTSIA_DEV_TOOLS: "false" }).localCodes).toBe(false)
  })

  it("combine uniquement les origines HTTP(S) normalisées avec le catalogue", () => {
    expect(parseOriginList("https://site.example.test/path https://site.example.test/other, bad-url ftp://files.example.test https://user:password@site.example.test")).toEqual(["https://site.example.test"])
    const result = trustedOrigins({ SITE_URL: "https://entry.example.test/path", TRUSTED_ORIGINS: "https://peer.example.test, https://entry.example.test" })
    expect(result).toContain("https://entry.example.test")
    expect(result).toContain("https://peer.example.test")
    for (const app of webApplications) expect(result).toContain(new URL(app.site_url).origin)
    expect(new Set(result).size).toBe(result.length)
  })
})

describe("application du catalogue servie à une origine", () => {
  const local = { ANTSIA_DEV_TOOLS: "true", CONVEX_CLOUD_URL: "http://127.0.0.1:3210" }

  it("reconnaît l'adresse publique de chaque application, chemin ignoré", () => {
    for (const app of webApplications) {
      expect(applicationOfOrigin(new URL(app.site_url).origin, {})).toBe(app.key)
      expect(applicationOfOrigin(`${new URL(app.site_url).origin}/entrer`, {})).toBe(app.key)
    }
  })

  it("ne reconnaît les ports locaux qu'avec les outils de développement d'un backend local", () => {
    for (const app of webApplications) {
      expect(applicationOfOrigin(`http://localhost:${app.dev_port}`, local)).toBe(app.key)
      expect(applicationOfOrigin(`http://127.0.0.1:${app.dev_port}`, local)).toBe(app.key)
      expect(applicationOfOrigin(`http://localhost:${app.dev_port}`, { ...local, CONVEX_CLOUD_URL: "https://backend.example.test" })).toBeNull()
      expect(applicationOfOrigin(`http://localhost:${app.dev_port}`, {})).toBeNull()
    }
  })

  it.each([null, undefined, "", "null", "not-a-url", "https://foreign.example.test", "https://user:pass@diasporale.com"])("aucune application pour l'origine %s", (origin) => {
    expect(applicationOfOrigin(origin, local)).toBeNull()
  })
})

describe("numéro SMS international", () => {
  it.each(["+24107890123", "+33612345678"])("accepte le format E.164 %s", (phone) => expect(isE164Phone(phone)).toBe(true))
  it.each(["07890123", "0024107890123", "+241 07890123", "+00000000", "+123", "+1234567890123456"])("refuse le numéro ambigu %s", (phone) => expect(isE164Phone(phone)).toBe(false))
})

describe("preuve IDN minimale provenant de userinfo", () => {
  const profile = { sub: "idn-sub-fixture", email: "alice@example.test", email_verified: true }

  it("ne copie aucun champ civil, photo, courriel ni jeton dans la preuve", () => {
    expect(idnProfileProof({ ...profile, loa: 2, nationality: "GA", profile_type: "citizen", name: "Nom civil", given_name: "Prénom", family_name: "Nom", birthdate: "1990-01-01", picture: "https://images.example.test/photo", nip: "fictional-nip", access_token: "fictional-token" })).toEqual({ subject: profile.sub, loa: 2, nationality: "GA", profileType: "citizen" })
  })

  it.each([1, 2, 3])("garde le niveau attesté %s sans le relever", (loa) => {
    expect(idnProfileProof({ ...profile, loa })).toEqual({ subject: profile.sub, loa })
  })

  it("n'invente ni niveau de garantie ni nationalité lorsqu'ils sont absents ou illisibles", () => {
    expect(idnProfileProof(profile)).toEqual({ subject: profile.sub })
    expect(idnProfileProof({ ...profile, nationality: 241 })).toEqual({ subject: profile.sub })
    expect(idnProfileProof({ ...profile, nationality: "X".repeat(65) })).toEqual({ subject: profile.sub })
  })

  it.each([
    { sub: "" }, { sub: " " }, { sub: "X".repeat(257) }, { sub: 42 },
    { email: "invalid" }, { email: undefined }, { email_verified: false }, { email_verified: "true" },
    { loa: "2" }, { loa: 0 }, { loa: 4 }, { profile_type: "unknown" },
  ])("refuse une preuve IDN invalide %#", (invalid) => {
    expect(() => idnProfileProof({ ...profile, ...invalid })).toThrow("idnInvalidProfile")
  })
})
