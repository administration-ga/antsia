import { describe, expect, it } from "vitest"

import { buildContentSecurityPolicy, convexOrigins, livekitOrigins, securityHeaders } from "./csp.mjs"

describe("convexOrigins", () => {
  it("dérive les origines HTTP, WebSocket et .convex.site d'un déploiement cloud", () => {
    expect(convexOrigins("https://exemple-123.convex.cloud")).toEqual([
      "https://exemple-123.convex.cloud",
      "wss://exemple-123.convex.cloud",
      "https://exemple-123.convex.site",
    ])
  })

  it("dérive le port des actions HTTP d'un déploiement local", () => {
    expect(convexOrigins("http://127.0.0.1:3210")).toEqual([
      "http://127.0.0.1:3210",
      "ws://127.0.0.1:3210",
      "http://127.0.0.1:3211",
    ])
  })

  it("ne rend rien pour une URL absente ou invalide", () => {
    expect(convexOrigins(undefined)).toEqual([])
    expect(convexOrigins("pas une url")).toEqual([])
  })
})

describe("buildContentSecurityPolicy", () => {
  it("n'autorise eval qu'en développement", () => {
    expect(buildContentSecurityPolicy({ isDev: true })).toContain("'unsafe-eval'")
    expect(buildContentSecurityPolicy({ isDev: false })).not.toContain("'unsafe-eval'")
  })

  it("interdit l'encadrement et les objets", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, convexUrl: "https://x.convex.cloud" })
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("connect-src 'self' https://x.convex.cloud wss://x.convex.cloud")
  })

  it("pose HSTS hors développement seulement", () => {
    const keys = (isDev: boolean) => securityHeaders({ isDev }).map((h) => h.key)
    expect(keys(false)).toContain("Strict-Transport-Security")
    expect(keys(true)).not.toContain("Strict-Transport-Security")
  })
})

describe("permissions d'iframe explicites", () => {
  const iframeOrigin = "https://demo.example.test"
  const parentOrigin = "https://app.example.test"
  const directive = (csp: string, name: string) => csp.split("; ").find((value) => value.startsWith(`${name} `))

  it("garde la politique historique exacte et DENY sans permission", () => {
    expect(buildContentSecurityPolicy({ isDev: false })).toBe([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "))
    expect(securityHeaders({ isDev: false })).toContainEqual({ key: "X-Frame-Options", value: "DENY" })
    expect(securityHeaders({ isDev: false, iframeSources: [], frameAncestors: [] })).toEqual(securityHeaders({ isDev: false }))
  })

  it("autorise uniquement l'origine source exacte sans permettre l'encadrement de l'application", () => {
    const options = { isDev: false, iframeSources: [iframeOrigin, iframeOrigin] }
    const csp = buildContentSecurityPolicy(options)
    expect(directive(csp, "frame-src")).toBe(`frame-src ${iframeOrigin}`)
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(csp).not.toContain("*")
    expect(securityHeaders(options)).toContainEqual({ key: "X-Frame-Options", value: "DENY" })
  })

  it("retire XFO seulement pour un ancêtre admis et conserve toutes les autres directives et tous les autres en-têtes", () => {
    const base = { isDev: false, convexUrl: "https://x.convex.cloud", livekitUrl: "wss://media.example.test" }
    const options = { ...base, frameAncestors: [parentOrigin, parentOrigin] }
    const csp = buildContentSecurityPolicy(options)
    expect(directive(csp, "frame-ancestors")).toBe(`frame-ancestors ${parentOrigin}`)
    expect(directive(csp, "frame-src")).toBeUndefined()
    expect(csp).not.toContain("*")
    expect(csp.replace(`frame-ancestors ${parentOrigin}`, "frame-ancestors 'none'")).toBe(buildContentSecurityPolicy(base))
    const headers = securityHeaders(options)
    expect(headers.some(({ key }) => key === "X-Frame-Options")).toBe(false)
    expect(headers.filter(({ key }) => key !== "Content-Security-Policy")).toEqual(securityHeaders(base).filter(({ key }) => key !== "Content-Security-Policy" && key !== "X-Frame-Options"))
    expect(headers.some(({ value }) => value.includes("ALLOW-FROM"))).toBe(false)
  })

  it.each([
    "",
    "http://demo.example.test",
    "wss://demo.example.test",
    "//demo.example.test",
    "https://demo.example.test/",
    "https://demo.example.test/path",
    "https://demo.example.test?key=1",
    "https://demo.example.test#fragment",
    "https://demo.example.test:443",
    "https://demo.example.test:8443",
    "https://user:secret@demo.example.test",
    "https://@demo.example.test",
    " https://demo.example.test",
    "https://demo.example.test ",
    "https://demo.example.test\n",
    "https://demo.example.test\t",
    "https://*.example.test",
    "https://*",
    "*",
    "'self'",
    "https://demo.example.test; frame-ancestors *",
    "https://demo.example.test https://other.example.test",
    "https://demo.example.test\\path",
    "https://demo.example.test,other.example.test",
    "https://demo..example.test",
    "https://demo.example.test.",
    "HTTPS://demo.example.test",
  ])("refuse l'origine piégée %j sans ouvrir de permission", (invalid) => {
    const options = { isDev: false, iframeSources: [invalid], frameAncestors: [invalid] }
    expect(buildContentSecurityPolicy(options)).toBe(buildContentSecurityPolicy({ isDev: false }))
    expect(securityHeaders(options)).toEqual(securityHeaders({ isDev: false }))
  })

  it("ignore les entrées invalides d'une liste mixte sans élargir l'origine admise", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, iframeSources: ["https://*.example.test", iframeOrigin], frameAncestors: ["https://app.example.test:443", parentOrigin] })
    expect(directive(csp, "frame-src")).toBe(`frame-src ${iframeOrigin}`)
    expect(directive(csp, "frame-ancestors")).toBe(`frame-ancestors ${parentOrigin}`)
    expect(csp).not.toContain("*")
    expect(csp).not.toContain(":443")
  })
})

describe("livekitOrigins — le serveur média des appels", () => {
  it("dérive la signalisation (wss) et l'origine HTTPS d'un serveur sécurisé", () => {
    expect(livekitOrigins("wss://media.exemple.ga")).toEqual(["wss://media.exemple.ga", "https://media.exemple.ga"])
  })

  it("garde le port d'un serveur local", () => {
    expect(livekitOrigins("ws://127.0.0.1:7880")).toEqual(["ws://127.0.0.1:7880", "http://127.0.0.1:7880"])
  })

  it("n'ouvre rien sans variable, ni pour une URL invalide ou d'un autre protocole", () => {
    expect(livekitOrigins(undefined)).toEqual([])
    expect(livekitOrigins("")).toEqual([])
    expect(livekitOrigins("pas une url")).toEqual([])
    expect(livekitOrigins("ftp://media.exemple.ga")).toEqual([])
  })

  it("ajoute le serveur média à connect-src, et le stockage du déploiement à media-src", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, convexUrl: "https://x.convex.cloud", livekitUrl: "wss://media.exemple.ga" })
    expect(csp).toContain("wss://media.exemple.ga https://media.exemple.ga")
    expect(csp).toContain("media-src 'self' blob: https://x.convex.cloud")
  })
})
