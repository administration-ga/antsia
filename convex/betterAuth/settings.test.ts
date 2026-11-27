import { describe, expect, it } from "vitest"

import catalog from "../../deploy/catalog.json"
import { applicationOfOAuthState, applicationOfOrigin, applicationOfSignInStart, authenticationConfiguration, entryPathOf, extraApplicationOrigins, IDN_ENTRY_SSO, idnAuthorizationParams, idnConfiguration, idnEntryIntentOf, idnEntryPrefill, idnProfileProof, idnSignInStartParams, isE164Phone, isOperatorConsoleApplication, isWebApplicationKey, networkAdministeredBy, parseOriginList, smsConfiguration, trustedOrigins } from "./settings"

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

  it.each([null, undefined, "", "null", "not-a-url", "https://foreign.example.test", "https://user:pass@diaspora.ga"])("aucune application pour l'origine %s", (origin) => {
    expect(applicationOfOrigin(origin, local)).toBeNull()
  })
})

describe("ADR-0042 — application où un retour IDN livre la session", () => {
  const members = webApplications.find((app) => app.key === "diaspora_ga")
  const publicSite = webApplications.find((app) => app.key === "antsia_ga")
  if (!members || !publicSite) throw new Error("Applications du catalogue attendues absentes")
  const membersOrigin = new URL(members.site_url).origin
  const publicOrigin = new URL(publicSite.site_url).origin

  it("l'origine exacte de l'adresse de retour enregistrée, chemin et requête ignorés", () => {
    expect(applicationOfOAuthState({ callbackURL: `${membersOrigin}/fil?onglet=recent`, codeVerifier: "x", expiresAt: 1 }, {})).toBe("diaspora_ga")
    expect(applicationOfOAuthState({ callbackURL: publicOrigin }, {})).toBe("antsia_ga")
    // L'adresse de nouvel utilisateur, absente, vide ou vers la même application, ne change rien.
    expect(applicationOfOAuthState({ callbackURL: `${membersOrigin}/fil`, newUserURL: "" }, {})).toBe("diaspora_ga")
    expect(applicationOfOAuthState({ callbackURL: `${membersOrigin}/fil`, newUserURL: `${membersOrigin}/bienvenue` }, {})).toBe("diaspora_ga")
  })

  it("les ports locaux ne valent qu'avec les outils de développement d'un backend local", () => {
    const local = { ANTSIA_DEV_TOOLS: "true", CONVEX_CLOUD_URL: "http://127.0.0.1:3210" }
    expect(applicationOfOAuthState({ callbackURL: `http://localhost:${members.dev_port}/fil` }, local)).toBe("diaspora_ga")
    expect(applicationOfOAuthState({ callbackURL: `http://localhost:${members.dev_port}/fil` }, {})).toBeNull()
  })

  it.each([
    ["aucun état", null],
    ["un état qui n'est pas un objet", "état"],
    ["un parcours natif", { callbackURL: `${membersOrigin}/fil`, antsiaNative: { challenge: "c", state: "s", redirectUri: "antsia://auth/idn" } }],
    ["une adresse relative (aucun départ web de confiance)", { callbackURL: "/fil" }],
    ["une adresse illisible", { callbackURL: "pas une adresse" }],
    ["une adresse hors des origines de confiance", { callbackURL: "https://foreign.example.test/fil" }],
    ["une adresse à identifiants", { callbackURL: `https://user:pass@${new URL(membersOrigin).host}/fil` }],
    ["un autre schéma", { callbackURL: `ftp://${new URL(membersOrigin).host}/fil` }],
    ["une adresse trop longue", { callbackURL: `${membersOrigin}/${"a".repeat(2_100)}` }],
    ["une adresse de nouvel utilisateur vers une autre application", { callbackURL: `${membersOrigin}/fil`, newUserURL: `${publicOrigin}/accueil` }],
    ["une adresse de nouvel utilisateur illisible", { callbackURL: `${membersOrigin}/fil`, newUserURL: 42 }],
  ])("aucune application pour %s", (_label, state) => {
    expect(applicationOfOAuthState(state, {})).toBeNull()
  })

  it("revue F2 — une application qui administre un réseau : les trois adresses valent exactement son entrée (`entry_path`)", () => {
    const admin = webApplications.find((app) => app.key === "admin_diaspora_ga")
    if (!admin || !("entry_path" in admin)) throw new Error("Entrée d'administration attendue au catalogue, avec son chemin d'entrée")
    const entry = `${new URL(admin.site_url).origin}${admin.entry_path}`
    expect(admin.entry_path).toBe("/entrer")
    expect(applicationOfOAuthState({ callbackURL: entry, newUserURL: entry, errorURL: entry }, {})).toBe("admin_diaspora_ga")
    for (const [label, state] of [
      ["requête", { callbackURL: `${entry}?x=`, newUserURL: entry, errorURL: entry }],
      ["fragment", { callbackURL: `${entry}#x`, newUserURL: entry, errorURL: entry }],
      ["autre chemin", { callbackURL: `${new URL(admin.site_url).origin}/anything`, newUserURL: entry, errorURL: entry }],
      ["nouvel utilisateur absent", { callbackURL: entry, errorURL: entry }],
      ["nouvel utilisateur vide", { callbackURL: entry, newUserURL: "", errorURL: entry }],
      ["erreur absente", { callbackURL: entry, newUserURL: entry }],
      ["erreur ailleurs", { callbackURL: entry, newUserURL: entry, errorURL: `${entry}/erreur` }],
      ["casse différente", { callbackURL: entry.replace("/entrer", "/Entrer"), newUserURL: entry, errorURL: entry }],
    ] as const) expect(applicationOfOAuthState(state, {}), label).toBeNull()
    // Une application qui administre un réseau sans chemin d'entrée déclaré n'est jamais scellée (fermé par défaut).
    const applications = { administration: { platform: "web", administers_network: "reseau-fictif" } }
    expect(networkAdministeredBy("administration", applications)).toBe("reseau-fictif")
    expect(entryPathOf("administration", applications)).toBeNull()
    expect(entryPathOf("admin_diaspora_ga")).toBe("/entrer")
    expect(entryPathOf("diaspora_ga")).toBeNull()
  })

  it("seule une application WEB du catalogue est une clé de preuve", () => {
    for (const app of webApplications) expect(isWebApplicationKey(app.key)).toBe(true)
    for (const key of ["antsia_mobile", "inconnue", "", "__proto__"]) expect(isWebApplicationKey(key)).toBe(false)
  })

  it("le réseau administré est déclaré au catalogue, par une application web seulement", () => {
    const applications = {
      administration: { platform: "web", administers_network: "reseau-fictif" },
      membres: { platform: "web" },
      natif: { platform: "expo-native", administers_network: "reseau-fictif" },
      vide: { platform: "web", administers_network: "" },
    }
    expect(networkAdministeredBy("administration", applications)).toBe("reseau-fictif")
    for (const key of ["membres", "natif", "vide", "inconnue", "toString", "", null, undefined]) expect(networkAdministeredBy(key, applications)).toBeNull()
    // Le catalogue réel : ni le site public, ni la console, ni l'application des membres n'administrent un réseau.
    for (const key of ["antsia_ga", "admin_antsia_ga", "diaspora_ga", "antsia_mobile"]) expect(networkAdministeredBy(key)).toBeNull()
  })
})

describe("revue CH-815 F3 — la console du moteur, liée à son application", () => {
  it("la console est déclarée au catalogue (`operator_console`), et elle seule", () => {
    expect(isOperatorConsoleApplication("admin_antsia_ga")).toBe(true)
    for (const key of ["antsia_ga", "diaspora_ga", "admin_diaspora_ga", "antsia_mobile", "inconnue", "toString", "", null, undefined]) expect(isOperatorConsoleApplication(key), String(key)).toBe(false)
  })

  it("une console est une application web, déclarée par la valeur `true`, qui n'administre aucun réseau", () => {
    const applications = {
      console: { platform: "web", operator_console: true },
      membres: { platform: "web" },
      refusee: { platform: "web", operator_console: false },
      natif: { platform: "expo-native", operator_console: true },
      // Une console qui administrerait aussi un réseau confondrait les deux autorités : fermé.
      double: { platform: "web", operator_console: true, administers_network: "reseau-fictif" },
    }
    expect(isOperatorConsoleApplication("console", applications)).toBe(true)
    for (const key of ["membres", "refusee", "natif", "double", "inconnue", "__proto__"]) expect(isOperatorConsoleApplication(key, applications), key).toBe(false)
  })

  it("la console n'est scellée qu'à son entrée exacte (`entry_path`), comme une administration de réseau", () => {
    const consoleApp = webApplications.find((app) => app.key === "admin_antsia_ga")
    if (!consoleApp || !("entry_path" in consoleApp)) throw new Error("Entrée de la console attendue au catalogue, avec son chemin d'entrée")
    const origin = new URL(consoleApp.site_url).origin
    const entry = `${origin}${consoleApp.entry_path}`
    expect(consoleApp.entry_path).toBe("/entrer")
    expect(entryPathOf("admin_antsia_ga")).toBe("/entrer")
    expect(applicationOfOAuthState({ callbackURL: entry, newUserURL: entry, errorURL: entry }, {})).toBe("admin_antsia_ga")
    for (const [label, state] of [
      // Le départ de la console d'avant ce durcissement : l'accueil, sans adresse de nouvel utilisateur.
      ["l'ancien départ de la console", { callbackURL: `${origin}/`, errorURL: entry }],
      ["l'accueil", { callbackURL: `${origin}/`, newUserURL: `${origin}/`, errorURL: `${origin}/` }],
      ["un état de console", { callbackURL: `${origin}/?section=files`, newUserURL: entry, errorURL: entry }],
      ["une requête", { callbackURL: `${entry}?retour=/`, newUserURL: entry, errorURL: entry }],
      ["un fragment", { callbackURL: `${entry}#suite`, newUserURL: entry, errorURL: entry }],
      ["une barre finale", { callbackURL: `${entry}/`, newUserURL: entry, errorURL: entry }],
      ["nouvel utilisateur absent", { callbackURL: entry, errorURL: entry }],
      ["nouvel utilisateur ailleurs", { callbackURL: entry, newUserURL: `${origin}/`, errorURL: entry }],
      ["erreur absente", { callbackURL: entry, newUserURL: entry }],
      ["erreur ailleurs", { callbackURL: entry, newUserURL: entry, errorURL: `${origin}/erreur` }],
    ] as const) expect(applicationOfOAuthState(state, {}), label).toBeNull()
  })

  it("une console servie sur une origine déclarée par le déploiement y est scellée à son entrée exacte, et là seulement", () => {
    const DEMO_CONSOLE = "https://console.demo.example.test"
    const entry = `${DEMO_CONSOLE}/entrer`
    const env = { APPLICATION_EXTRA_ORIGINS_JSON: JSON.stringify({ admin_antsia_ga: [DEMO_CONSOLE] }), TRUSTED_ORIGINS: DEMO_CONSOLE }
    expect(applicationOfOAuthState({ callbackURL: entry, newUserURL: entry, errorURL: entry }, env)).toBe("admin_antsia_ga")
    expect(applicationOfOAuthState({ callbackURL: `${DEMO_CONSOLE}/`, newUserURL: entry, errorURL: entry }, env)).toBeNull()
    // Sans déclaration, la console servie ailleurs qu'à son adresse du catalogue n'est jamais scellée.
    expect(applicationOfOAuthState({ callbackURL: entry, newUserURL: entry, errorURL: entry }, { TRUSTED_ORIGINS: DEMO_CONSOLE })).toBeNull()
  })
})

describe("revue CH-815 A1b — origines supplémentaires d'une application, déclarées par le déploiement", () => {
  const DEMO_ADMIN = "https://admin.demo.example.test"
  const DEMO_MEMBERS = "https://membres.demo.example.test"
  const declared = JSON.stringify({ admin_diaspora_ga: [DEMO_ADMIN], diaspora_ga: [DEMO_MEMBERS] })
  const env = { APPLICATION_EXTRA_ORIGINS_JSON: declared, TRUSTED_ORIGINS: `${DEMO_ADMIN}, ${DEMO_MEMBERS}` }
  const entry = `${DEMO_ADMIN}/entrer`

  it("absente ou vide : aucune correspondance, une origine hors catalogue n'a pas d'application", () => {
    for (const raw of [undefined, "", "   "]) expect(extraApplicationOrigins({ APPLICATION_EXTRA_ORIGINS_JSON: raw }).size).toBe(0)
    expect(applicationOfOrigin(DEMO_ADMIN, { TRUSTED_ORIGINS: DEMO_ADMIN })).toBeNull()
    // Le risque relevé au lot A8 : sans déclaration, une administration servie en démonstration n'est jamais scellée.
    expect(applicationOfOAuthState({ callbackURL: entry, newUserURL: entry, errorURL: entry }, { TRUSTED_ORIGINS: DEMO_ADMIN })).toBeNull()
  })

  it("une origine déclarée ET de confiance nomme son application ; le sceau de l'administration y vaut à son entrée exacte", () => {
    expect([...extraApplicationOrigins(env)]).toEqual([[DEMO_ADMIN, "admin_diaspora_ga"], [DEMO_MEMBERS, "diaspora_ga"]])
    expect(applicationOfOrigin(DEMO_ADMIN, env)).toBe("admin_diaspora_ga")
    expect(applicationOfOrigin(`${DEMO_ADMIN}/entrer`, env)).toBe("admin_diaspora_ga")
    expect(applicationOfOrigin(DEMO_MEMBERS, env)).toBe("diaspora_ga")
    expect(applicationOfOAuthState({ callbackURL: entry, newUserURL: entry, errorURL: entry }, env)).toBe("admin_diaspora_ga")
    expect(applicationOfOAuthState({ callbackURL: `${DEMO_ADMIN}/autre`, newUserURL: entry, errorURL: entry }, env)).toBeNull()
    expect(applicationOfOAuthState({ callbackURL: `${DEMO_MEMBERS}/fil` }, env)).toBe("diaspora_ga")
    // Les adresses du catalogue gardent leur application.
    expect(applicationOfOrigin("https://diaspora.ga", env)).toBe("diaspora_ga")
  })

  it("la déclaration n'ajoute aucune confiance : une origine déclarée hors de TRUSTED_ORIGINS n'a pas d'application", () => {
    const untrusted = { APPLICATION_EXTRA_ORIGINS_JSON: declared, TRUSTED_ORIGINS: DEMO_MEMBERS }
    expect(trustedOrigins(untrusted)).not.toContain(DEMO_ADMIN)
    expect(applicationOfOrigin(DEMO_ADMIN, untrusted)).toBeNull()
    expect(applicationOfOAuthState({ callbackURL: entry, newUserURL: entry, errorURL: entry }, untrusted)).toBeNull()
    expect(applicationOfOrigin(DEMO_MEMBERS, untrusted)).toBe("diaspora_ga")
  })

  it.each([
    ["un JSON illisible", "{"],
    ["un tableau", JSON.stringify([DEMO_ADMIN])],
    ["null", "null"],
    ["une chaîne", JSON.stringify(DEMO_ADMIN)],
    ["une clé inconnue", JSON.stringify({ inconnue: [DEMO_ADMIN] })],
    ["une clé inconnue à côté d'une clé valide", JSON.stringify({ admin_diaspora_ga: [DEMO_ADMIN], inconnue: [DEMO_MEMBERS] })],
    ["une application native", JSON.stringify({ antsia_mobile: [DEMO_ADMIN] })],
    ["la clé __proto__", `{"__proto__": ["${DEMO_ADMIN}"]}`],
    ["une liste vide", JSON.stringify({ admin_diaspora_ga: [] })],
    ["une valeur qui n'est pas une liste", JSON.stringify({ admin_diaspora_ga: DEMO_ADMIN })],
    ["une valeur qui n'est pas une chaîne", JSON.stringify({ admin_diaspora_ga: [42] })],
    ["une origine en http", JSON.stringify({ admin_diaspora_ga: ["http://admin.demo.example.test"] })],
    ["un chemin", JSON.stringify({ admin_diaspora_ga: [`${DEMO_ADMIN}/entrer`] })],
    ["une barre oblique finale", JSON.stringify({ admin_diaspora_ga: [`${DEMO_ADMIN}/`] })],
    ["une requête", JSON.stringify({ admin_diaspora_ga: [`${DEMO_ADMIN}?x=1`] })],
    ["des identifiants", JSON.stringify({ admin_diaspora_ga: ["https://u:p@admin.demo.example.test"] })],
    ["des majuscules", JSON.stringify({ admin_diaspora_ga: ["https://Admin.demo.example.test"] })],
    ["le port par défaut écrit", JSON.stringify({ admin_diaspora_ga: ["https://admin.demo.example.test:443"] })],
    ["une origine répétée entre deux applications", JSON.stringify({ admin_diaspora_ga: [DEMO_ADMIN], diaspora_ga: [DEMO_ADMIN] })],
    ["une origine répétée dans une application", JSON.stringify({ admin_diaspora_ga: [DEMO_ADMIN, DEMO_ADMIN] })],
    ["l'adresse d'une application du catalogue", JSON.stringify({ admin_diaspora_ga: ["https://diaspora.ga"] })],
    ["trop d'origines", JSON.stringify({ admin_diaspora_ga: Array.from({ length: 9 }, (_, index) => `https://demo${index}.example.test`) })],
  ])("une déclaration hors forme est ignorée EN ENTIER : %s", (_label, raw) => {
    const refused = { APPLICATION_EXTRA_ORIGINS_JSON: raw, TRUSTED_ORIGINS: `${DEMO_ADMIN}, ${DEMO_MEMBERS}` }
    expect(extraApplicationOrigins(refused).size).toBe(0)
    expect(applicationOfOrigin(DEMO_ADMIN, refused)).toBeNull()
    expect(applicationOfOrigin(DEMO_MEMBERS, refused)).toBeNull()
  })
})

// CH-863 M1 (ADR-0045) — sur la porte d'arrivée, et là seulement, l'entrée IDN accepte la session
// identite.ga tant qu'elle vit : ni `prompt`, ni `max_age`. Partout ailleurs, `prompt=login`.
describe("CH-863 M1 — paramètres d'autorisation IDN et intention fermée d'entrée sans ressaisie", () => {
  const origin = (key: string) => {
    const app = webApplications.find((item) => item.key === key)
    if (!app) throw new Error(`Application ${key} attendue au catalogue`)
    return new URL(app.site_url).origin
  }
  const members = origin("diaspora_ga")
  const publicSite = origin("antsia_ga")

  it("porte uniquement l’identifiant du compte IDN de l’entrée consulaire Diaspora, y compris lors d’une nouvelle saisie du PIN", () => {
    const body = { providerId: "idn", callbackURL: members + "/passerelle/consulat?apres=idn", additionalData: { antsiaEntry: "consulate", loginHint: "citoyen@idn.ga" } }
    expect(idnSignInStartParams(body, {})).toEqual({ login_hint: "citoyen@idn.ga" })
    expect(idnSignInStartParams({ ...body, additionalData: { ...body.additionalData, requireLogin: true } }, {})).toEqual({ prompt: "login", login_hint: "citoyen@idn.ga" })
    expect(idnSignInStartParams({ ...body, callbackURL: publicSite + "/entrer" }, {})).toBeNull()
    expect(idnSignInStartParams({ ...body, additionalData: { ...body.additionalData, loginHint: "a@example.org" } }, {})).toBeNull()
  })
  const adminEntry = `${origin("admin_diaspora_ga")}/entrer`
  const consoleEntry = `${origin("admin_antsia_ga")}/entrer`
  const nativePayload = { challenge: "c".repeat(43), state: "s".repeat(43), redirectUri: "antsia-fixture://auth/idn" }

  it("l'intention se lit d'un schéma strict : absente, elle ne change rien ; présente, elle vaut le seul littéral `sso`", () => {
    for (const absent of [undefined, null, {}, { autre: "valeur" }, "sso", ["sso"], 42]) expect(idnEntryIntentOf(absent), JSON.stringify(absent) ?? "undefined").toEqual({ valid: true, intent: null })
    expect(IDN_ENTRY_SSO).toBe("sso")
    expect(idnEntryIntentOf({ antsiaEntry: "sso" })).toEqual({ valid: true, intent: "sso" })
  })

  it.each([
    ["une casse différente", { antsiaEntry: "SSO" }],
    ["une autre valeur", { antsiaEntry: "login" }],
    ["une chaîne vide", { antsiaEntry: "" }],
    ["un espace", { antsiaEntry: " sso" }],
    ["un booléen", { antsiaEntry: true }],
    ["null", { antsiaEntry: null }],
    ["undefined", { antsiaEntry: undefined }],
    ["une liste", { antsiaEntry: ["sso"] }],
    ["un objet", { antsiaEntry: { mode: "sso" } }],
    ["une clé de plus", { antsiaEntry: "sso", maxAge: 0 }],
    ["un prompt glissé à côté", { antsiaEntry: "sso", prompt: "none" }],
    ["le parcours natif à côté", { antsiaEntry: "sso", antsiaNative: nativePayload }],
  ])("refuse l'intention mal formée (%s), jamais ignorée en silence", (_label, additionalData) => {
    expect(idnEntryIntentOf(additionalData)).toEqual({ valid: false })
  })

  it("règle pure : sans intention, `prompt=login` pour toute application, connue ou non", () => {
    for (const application of [null, "antsia_ga", "diaspora_ga", "admin_diaspora_ga", "admin_antsia_ga", "antsia_mobile", "inconnue"]) {
      expect(idnAuthorizationParams({ intent: null, application }), String(application)).toEqual({ prompt: "login" })
    }
  })

  it("règle pure : avec `sso`, ni `prompt` ni `max_age` pour une application des membres du catalogue", () => {
    for (const application of ["antsia_ga", "diaspora_ga"]) {
      const params = idnAuthorizationParams({ intent: "sso", application })
      expect(params, application).toEqual({})
      expect(Object.keys(params ?? { absent: true }), application).toEqual([])
    }
  })

  it("règle pure : avec `sso`, refus pour l'administration d'un réseau, la console, le natif, une clé inconnue ou aucune application", () => {
    for (const application of ["admin_diaspora_ga", "admin_antsia_ga", "antsia_mobile", "inconnue", "toString", "__proto__", "", null]) {
      expect(idnAuthorizationParams({ intent: "sso", application }), String(application)).toBeNull()
    }
  })

  it("chaque décision rend un objet neuf : le modifier ne change pas la suivante", () => {
    const first = idnAuthorizationParams({ intent: null, application: null })
    if (!first) throw new Error("Paramètres par défaut attendus")
    first.prompt = "none"
    expect(idnAuthorizationParams({ intent: null, application: null })).toEqual({ prompt: "login" })
  })

  it("l'application du départ : celle de l'adresse de retour, toutes les adresses données menant à la même", () => {
    expect(applicationOfSignInStart({ callbackURL: `${members}/bienvenue`, errorCallbackURL: `${members}/entrer` }, {})).toBe("diaspora_ga")
    expect(applicationOfSignInStart({ callbackURL: `${members}/bienvenue`, newUserCallbackURL: `${members}/bienvenue`, errorCallbackURL: "" }, {})).toBe("diaspora_ga")
    expect(applicationOfSignInStart({ callbackURL: publicSite }, {})).toBe("antsia_ga")
    // Les applications d'autorité restent NOMMÉES : c'est la règle qui les refuse, pas la lecture.
    expect(applicationOfSignInStart({ callbackURL: adminEntry, newUserCallbackURL: adminEntry, errorCallbackURL: adminEntry }, {})).toBe("admin_diaspora_ga")
    expect(applicationOfSignInStart({ callbackURL: consoleEntry, newUserCallbackURL: consoleEntry, errorCallbackURL: consoleEntry }, {})).toBe("admin_antsia_ga")
    for (const [label, body] of [
      ["aucun corps", undefined],
      ["une adresse absente", {}],
      ["une adresse relative", { callbackURL: "/bienvenue" }],
      ["une adresse hors des origines de confiance", { callbackURL: "https://foreign.example.test/bienvenue" }],
      ["une adresse de nouvel utilisateur vers l'administration", { callbackURL: `${members}/bienvenue`, newUserCallbackURL: adminEntry }],
      ["une adresse d'erreur vers la console", { callbackURL: `${members}/bienvenue`, errorCallbackURL: consoleEntry }],
      ["une adresse d'erreur illisible", { callbackURL: `${members}/bienvenue`, errorCallbackURL: 42 }],
    ] as const) expect(applicationOfSignInStart(body, {}), label).toBeNull()
  })

  it("le départ complet : intention lue, fournisseur `idn` seul, application des membres seule", () => {
    const start = (body: Record<string, unknown>) => idnSignInStartParams(body, {})
    const sso = { antsiaEntry: "sso" }
    expect(start({ providerId: "idn", callbackURL: `${members}/bienvenue` })).toEqual({ prompt: "login" })
    expect(start({ providerId: "idn", callbackURL: `${members}/bienvenue`, additionalData: { autre: "valeur" } })).toEqual({ prompt: "login" })
    expect(start({ providerId: "idn", callbackURL: `${members}/bienvenue`, errorCallbackURL: `${members}/entrer`, additionalData: sso })).toEqual({})
    for (const [label, body] of [
      ["un autre fournisseur", { providerId: "autre", callbackURL: `${members}/bienvenue`, additionalData: sso }],
      ["aucun fournisseur", { callbackURL: `${members}/bienvenue`, additionalData: sso }],
      ["l'administration d'un réseau", { providerId: "idn", callbackURL: adminEntry, newUserCallbackURL: adminEntry, errorCallbackURL: adminEntry, additionalData: sso }],
      ["la console", { providerId: "idn", callbackURL: consoleEntry, newUserCallbackURL: consoleEntry, errorCallbackURL: consoleEntry, additionalData: sso }],
      ["une application inconnue", { providerId: "idn", callbackURL: "https://foreign.example.test/bienvenue", additionalData: sso }],
      ["une valeur inconnue", { providerId: "idn", callbackURL: `${members}/bienvenue`, additionalData: { antsiaEntry: "toujours" } }],
      ["le parcours natif à côté", { providerId: "idn", callbackURL: `${members}/bienvenue`, additionalData: { ...sso, antsiaNative: nativePayload } }],
    ] as const) expect(start(body), label).toBeNull()
  })

  it("une origine de démonstration DÉCLARÉE pour l'application des membres est admise ; non déclarée, refusée (fermé par défaut)", () => {
    const demo = "https://membres.demo.example.test"
    const body = { providerId: "idn", callbackURL: `${demo}/bienvenue`, errorCallbackURL: `${demo}/entrer`, additionalData: { antsiaEntry: "sso" } }
    expect(idnSignInStartParams(body, { APPLICATION_EXTRA_ORIGINS_JSON: JSON.stringify({ diaspora_ga: [demo] }), TRUSTED_ORIGINS: demo })).toEqual({})
    expect(idnSignInStartParams(body, { TRUSTED_ORIGINS: demo })).toBeNull()
    // Sans intention, la même origine non déclarée garde la porte ordinaire.
    expect(idnSignInStartParams({ ...body, additionalData: undefined }, { TRUSTED_ORIGINS: demo })).toEqual({ prompt: "login" })
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

describe("pré-remplissage de l'accueil depuis userinfo (ADR-0044)", () => {
  const full = {
    sub: "idn-sub-fixture", email: "moussavounze.awa@idn.ga", email_verified: true, loa: 2, profile_type: "citizen",
    name: "Gaëlle Awa MOUSSAVOU-NZÉ", given_name: "Gaëlle Awa", family_name: "MOUSSAVOU-NZÉ",
    nationality: "GA", nip: "fictional-nip-0000", birthdate: "1990-01-01", gender: "M", birth_place: "Libreville",
    picture: "https://images.example.test/photo", access_token: "fictional-token",
  }

  it("ne retient que prénoms, nom de famille et identifiant IDN : jamais NIP, naissance, genre, lieu ni photo", () => {
    const prefill = idnEntryPrefill(full)
    expect(prefill).toEqual({ givenNames: "Gaëlle Awa", familyName: "MOUSSAVOU-NZÉ", idnIdentifier: "moussavounze.awa" })
    const serialized = JSON.stringify(prefill)
    for (const forbidden of ["fictional-nip-0000", "1990-01-01", "Libreville", "images.example.test", "fictional-token", "idn-sub-fixture", "citizen"]) expect(serialized).not.toContain(forbidden)
  })

  it("la preuve IDN reste inchangée : aucun nom civil n'y entre", () => {
    expect(idnProfileProof(full)).toEqual({ subject: "idn-sub-fixture", loa: 2, nationality: "GA", profileType: "citizen" })
  })

  it("l'identifiant IDN est la partie locale d'une adresse vérifiée du seul domaine idn.ga", () => {
    expect(idnEntryPrefill({ email: " Ndong.Paul@IDN.GA ", email_verified: true })).toEqual({ idnIdentifier: "ndong.paul" })
    for (const email of ["paul@example.test", "paul@idn.ga.example.test", "paul@sub.idn.ga", "paul@idn.gab", "@idn.ga", "pa@idn.ga", `${"a".repeat(33)}@idn.ga`, "nzé.paul@idn.ga", ".paul@idn.ga", "paul..ndong@idn.ga", "paul ndong@idn.ga"]) {
      expect(idnEntryPrefill({ email, email_verified: true })).toBeNull()
    }
    expect(idnEntryPrefill({ email: "paul@idn.ga", email_verified: false })).toBeNull()
    expect(idnEntryPrefill({ email: "paul@idn.ga", email_verified: "true" })).toBeNull()
  })

  it("normalise les espaces des noms reçus, sans en changer la casse (le nom affiché se compose au serveur)", () => {
    expect(idnEntryPrefill({ given_name: "  Jean-Rémy   Éloïse ", family_name: " ndong  mba " })).toEqual({ givenNames: "Jean-Rémy Éloïse", familyName: "ndong mba" })
  })

  it.each([
    ["nombre", 42], ["objet", { first: "Paul" }], ["vide", "   "], ["sans lettre", "1234"], ["trop long", "A".repeat(101)],
    ["caractère de contrôle", "Paul\u0000"], ["saut de ligne", "Paul\nNdong"],
  ])("ignore un nom invalide (%s) sans rien lever", (_label, value) => {
    expect(() => idnEntryPrefill({ given_name: value, family_name: value })).not.toThrow()
    expect(idnEntryPrefill({ given_name: value, family_name: value })).toBeNull()
    expect(idnEntryPrefill({ given_name: value, family_name: "NDONG" })).toEqual({ familyName: "NDONG" })
  })

  it("rend null quand IDN ne donne rien d'utilisable, sans jamais lever", () => {
    expect(idnEntryPrefill({})).toBeNull()
    expect(idnEntryPrefill({ sub: "idn-sub-fixture", email: "alice@example.test", email_verified: true, name: "Alice Nom" })).toBeNull()
  })
})
