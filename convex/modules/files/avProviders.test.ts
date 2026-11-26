// Dupliqué de socle/convex/modules/fileGuard/avProviders.test.ts @ ad2e7fdc2 — adaptations : sélection FAIL-CLOSED (fournisseur absent, inconnu, incomplet ou mock hors développement local → fournisseur indisponible, verdict `error`) ; M1 : transport, HTTP 5xx, 429 et file pleine marqués INDISPONIBLES (pas un verdict) ; le reste tel quel.
import { describe, expect, it, vi } from "vitest"

import {
  ClamAvRestProvider,
  EICAR_SIGNATURE,
  getFileScanProvider,
  MockFileScanProvider,
  parseClamAvResponse,
  UnavailableFileScanProvider,
} from "./avProviders"

const enc = new TextEncoder()
const LOCAL = { CONVEX_CLOUD_URL: "http://127.0.0.1:3210" }

describe("files/avProviders — mock", () => {
  it("reconnaît EICAR et rend sain le reste", async () => {
    const mock = new MockFileScanProvider()
    const infected = await mock.scan({ bytes: enc.encode(`x${EICAR_SIGNATURE}y`), filename: "e.txt", mimeType: "text/plain" })
    expect(infected).toMatchObject({ provider: "mock", verdict: "infected", signature: "Eicar-Test-Signature" })
    const clean = await mock.scan({ bytes: enc.encode("%PDF-1.4"), filename: "a.pdf", mimeType: "application/pdf" })
    expect(clean.verdict).toBe("clean")
  })
})

describe("files/avProviders — lecture des réponses ClamAV", () => {
  it("lit les deux dialectes JSON et le texte de clamdscan", () => {
    expect(parseClamAvResponse('[{"Status":"FOUND","Description":"Win.Test.EICAR_HDB-1","FileName":"x"}]')).toMatchObject({ verdict: "infected", signature: "Win.Test.EICAR_HDB-1" })
    expect(parseClamAvResponse('[{"Status":"OK","FileName":"x"}]')).toMatchObject({ verdict: "clean" })
    expect(parseClamAvResponse('{"success":true,"data":{"result":[{"name":"x","is_infected":true,"viruses":["Eicar-Test-Signature"]}]}}')).toMatchObject({ verdict: "infected", signature: "Eicar-Test-Signature" })
    expect(parseClamAvResponse('{"success":true,"data":{"result":[{"name":"x","is_infected":false,"viruses":[]}]}}')).toMatchObject({ verdict: "clean" })
    expect(parseClamAvResponse("stream: Eicar-Test-Signature FOUND")).toMatchObject({ verdict: "infected", signature: "Eicar-Test-Signature" })
    expect(parseClamAvResponse("stream: OK")).toMatchObject({ verdict: "clean" })
    expect(parseClamAvResponse("")).toMatchObject({ verdict: "error" })
    expect(parseClamAvResponse('{"weird":true}')).toMatchObject({ verdict: "error" })
  })
})

describe("files/avProviders — adaptateur REST", () => {
  const request = { bytes: enc.encode("%PDF-1.4"), filename: "a.pdf", mimeType: "application/pdf" }

  it("envoie le fichier en multipart avec le jeton, et lit le verdict", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST")
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer s3cret")
      expect(init?.body).toBeInstanceOf(FormData)
      return new Response('[{"Status":"OK"}]', { status: 200 })
    })
    const provider = new ClamAvRestProvider({ url: "https://av.local/scan", token: "s3cret", timeoutMs: 1000, maxBytes: 1024, fetchImpl: fetchImpl as unknown as typeof fetch })
    const out = await provider.scan(request)
    expect(out).toMatchObject({ provider: "clamav-rest", verdict: "clean" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("une réponse HTTP en erreur ou une exception réseau rend `error`, jamais `clean`", async () => {
    const failing = new ClamAvRestProvider({ url: "https://av.local/scan", timeoutMs: 1000, maxBytes: 1024, fetchImpl: (async () => new Response("boom", { status: 503 })) as unknown as typeof fetch })
    expect((await failing.scan(request)).verdict).toBe("error")
    const throwing = new ClamAvRestProvider({
      url: "https://av.local/scan",
      timeoutMs: 1000,
      maxBytes: 1024,
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED")
      }) as unknown as typeof fetch,
    })
    expect(await throwing.scan(request)).toMatchObject({ verdict: "error", detail: "ECONNREFUSED" })
  })

  it("M1 — transport, HTTP 5xx, 429 et file pleine : indisponible, jamais un verdict ni `clean`", async () => {
    const respond = (status: number, body: string) => new ClamAvRestProvider({ url: "https://av.local/scan", timeoutMs: 1000, maxBytes: 1024, fetchImpl: (async () => new Response(body, { status })) as unknown as typeof fetch })
    expect(await respond(503, '{"error":"queue_full"}').scan(request)).toMatchObject({ verdict: "error", detail: "HTTP 503 queue_full", unavailable: true })
    expect(await respond(503, '{"error":"queue_timeout"}').scan(request)).toMatchObject({ verdict: "error", detail: "HTTP 503 queue_timeout", unavailable: true })
    expect(await respond(503, '{"error":"busy"}').scan(request)).toMatchObject({ verdict: "error", detail: "HTTP 503 busy", unavailable: true })
    expect(await respond(502, "<html>Bad Gateway</html>").scan(request)).toMatchObject({ verdict: "error", detail: "HTTP 502", unavailable: true })
    expect(await respond(500, "").scan(request)).toMatchObject({ verdict: "error", detail: "HTTP 500", unavailable: true })
    expect(await respond(429, '{"error":"rate_limited"}').scan(request)).toMatchObject({ verdict: "error", detail: "HTTP 429 rate_limited", unavailable: true })
    const offline = new ClamAvRestProvider({ url: "https://av.local/scan", timeoutMs: 1000, maxBytes: 1024, fetchImpl: (async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch })
    expect(await offline.scan(request)).toMatchObject({ verdict: "error", detail: "fetch failed", unavailable: true })
  })

  it("M1 — un délai dépassé est une indisponibilité nommée `timeout`", async () => {
    const hanging = new ClamAvRestProvider({
      url: "https://av.local/scan",
      timeoutMs: 5,
      maxBytes: 1024,
      fetchImpl: ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")))
      })) as unknown as typeof fetch,
    })
    expect(await hanging.scan(request)).toMatchObject({ verdict: "error", detail: "timeout", unavailable: true })
  })

  it("M1 — un refus du fournisseur (4xx) ou une erreur de clamd reste un verdict d'erreur, qui entame les tentatives", async () => {
    for (const status of [400, 401, 403, 404, 413]) {
      const refused = new ClamAvRestProvider({ url: "https://av.local/scan", timeoutMs: 1000, maxBytes: 1024, fetchImpl: (async () => new Response('{"error":"x"}', { status })) as unknown as typeof fetch })
      const out = await refused.scan(request)
      expect(out.verdict).toBe("error")
      expect(out.unavailable).toBeUndefined()
    }
    const clamdError = new ClamAvRestProvider({ url: "https://av.local/scan", timeoutMs: 1000, maxBytes: 1024, fetchImpl: (async () => new Response('[{"Status":"ERROR","Description":"clamd_error"}]', { status: 200 })) as unknown as typeof fetch })
    const out = await clamdError.scan(request)
    expect(out.verdict).toBe("error")
    expect(out.unavailable).toBeUndefined()
    // Le fournisseur non configuré garde son chemin propre (réparation `requeueUnconfiguredScans`).
    expect((await new UnavailableFileScanProvider("provider_unconfigured").scan()).unavailable).toBeUndefined()
  })

  it("au-delà du plafond, l'antivirus est sauté (le reste de l'inspection tient)", async () => {
    const provider = new ClamAvRestProvider({ url: "https://av.local/scan", timeoutMs: 1000, maxBytes: 2, fetchImpl: (async () => new Response("[]")) as unknown as typeof fetch })
    expect(await provider.scan(request)).toMatchObject({ verdict: "skipped", detail: "too_large" })
  })
})

describe("files/avProviders — sélection par l'environnement (fail-closed)", () => {
  it("en développement local : mock par défaut, ClamAV quand l'URL est là", () => {
    expect(getFileScanProvider(LOCAL).id).toBe("mock")
    expect(getFileScanProvider({ ...LOCAL, FILE_SCAN_PROVIDER: "clamav-rest", FILE_SCAN_CLAMAV_URL: "https://av/scan" }).id).toBe("clamav-rest")
  })

  it("hors développement local : rien de configuré, mock, inconnu ou incomplet → indisponible, verdict `error`", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    for (const env of [{}, { FILE_SCAN_PROVIDER: "mock" }, { FILE_SCAN_PROVIDER: "inconnu" }, { FILE_SCAN_PROVIDER: "clamav-rest" }]) {
      const provider = getFileScanProvider(env)
      expect(provider).toBeInstanceOf(UnavailableFileScanProvider)
      expect((await provider.scan({ bytes: enc.encode("x"), filename: "a.txt", mimeType: "text/plain" })).verdict).toBe("error")
    }
    expect(getFileScanProvider({ FILE_SCAN_PROVIDER: "clamav-rest", FILE_SCAN_CLAMAV_URL: "https://av/scan" }).id).toBe("clamav-rest")
    expect(warn).toHaveBeenCalledTimes(4)
    warn.mockRestore()
  })
})
