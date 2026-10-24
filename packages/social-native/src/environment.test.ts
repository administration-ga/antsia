import { describe, expect, it } from "vitest"
import { nativeEnvironment } from "./environment"

const configured = { convexUrl: "https://engine.example", authUrl: "https://auth.example", webUrl: "https://site.example", development: false }
describe("native environment", () => {
  it("never infers a deployment or a native scheme", () => {
    expect(nativeEnvironment({ development: false })).toBe(null)
    expect(nativeEnvironment(configured)).toStrictEqual({ convexUrl: configured.convexUrl, authUrl: configured.authUrl, webUrl: configured.webUrl, scheme: null })
    expect(nativeEnvironment(configured)).not.toHaveProperty("webBasePath")
    expect(nativeEnvironment({ ...configured, webBasePath: "" })).toStrictEqual(nativeEnvironment(configured))
  })
  it("requires development and explicit consent for private HTTP", () => {
    const local = { ...configured, convexUrl: "http://127.0.0.1:3210", allowLocalHttp: "true" }
    expect(nativeEnvironment(local)).toBe(null)
    expect(nativeEnvironment({ ...local, development: true })?.convexUrl).toBe(local.convexUrl)
    expect(nativeEnvironment({ ...local, development: true, convexUrl: "http://untrusted.example" })).toBe(null)
    expect(nativeEnvironment({ ...local, development: true, convexUrl: "http://192.168.1.2:3210" })).toBe(null)
  })
  it("rejects credential URLs, paths and generic callback schemes", () => {
    expect(nativeEnvironment({ ...configured, authUrl: "https://a:b@auth.example" })).toBe(null)
    expect(nativeEnvironment({ ...configured, webUrl: "https://site.example/path" })).toBe(null)
    expect(nativeEnvironment({ ...configured, scheme: "exp" })).toBe(null)
    expect(nativeEnvironment({ ...configured, scheme: "antsia-owned" })?.scheme).toBe("antsia-owned")
  })
  it("keeps the demo web path separate from strict origins", () => {
    expect(nativeEnvironment({ ...configured, webBasePath: "/demo" })).toEqual({ ...nativeEnvironment(configured), webBasePath: "/demo" })
    expect(nativeEnvironment({ ...configured, webUrl: `${configured.webUrl}/demo`, webBasePath: "/demo" })).toBe(null)
  })
  it.each(["/", "/demo/", "//demo", "/demo/..", "/%64emo", "/demo?token=value", "/demo#fragment", " /demo"])("rejects an unrecognized web base path: %s", (webBasePath) => {
    expect(nativeEnvironment({ ...configured, webBasePath })).toBe(null)
  })
})
