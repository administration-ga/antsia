import { describe, expect, it } from "vitest"

import { PERSONAL_POST_MAX_LENGTH, POST_IMAGE_MAX_BYTES, POST_MEDIA_ALT_MAX_LENGTH } from "./content"
import { FEDERATION_MAX_SKEW_MS } from "./federationProtocol"
import { parseReseauPublicEvent, parseReseauPublicPage } from "./reseauPublic"
import { UPLOAD_USAGES } from "./uploadPolicy"

const NOW = 1_792_281_600_000
const PAGE_REF = "page:administration-exemple"
const POST_REF = "post:communique-exemple"
const SHA256 = "a".repeat(64)
const image = { url: "https://cdn.example.org/photo.png", kind: "image", mimeType: "image/png", sizeBytes: 1200, sha256: SHA256 }
const video = { ...image, url: "https://cdn.example.org/video.mp4", kind: "video", mimeType: "video/mp4" }
const page = { type: "page.upserted", orgRef: PAGE_REF, revision: 1, name: "Administration exemple", country: "GA", verifiedAt: NOW }
const post = { type: "post.published", postRef: POST_REF, pageRef: PAGE_REF, revision: 1, body: "Communiqué public", audience: "public", publishToAntsia: true, media: [], publishedAt: NOW }
const removed = { type: "post.removed", postRef: POST_REF, revision: 2 }
const INVALID = { ok: false, reason: "invalid_payload" }
const parsePost = (value: unknown) => parseReseauPublicEvent(value, POST_REF, NOW)

describe("RESEAU-PUBLIC-V1 — compatibilité des pages PA9A", () => {
  it("préserve le parseur de page et la casse des organisations", () => {
    const payload = { ...page, name: "  Administration d'ÉTAT  ", shortName: "  AdE ", description: " Première ligne\nDeuxième ligne ", logoUrl: null }
    expect(parseReseauPublicPage(payload, PAGE_REF, NOW)).toEqual({ ok: true, event: { ...payload, name: "Administration d'ÉTAT", shortName: "AdE", description: "Première ligne\nDeuxième ligne" } })
    expect(parseReseauPublicEvent(payload, PAGE_REF, NOW)).toEqual(parseReseauPublicPage(payload, PAGE_REF, NOW))
  })
  it.each(["post.published", "post.removed", "person.optin", "person.optout"])("garde %s hors du parseur spécialisé page", (type) => {
    expect(parseReseauPublicPage({ type }, PAGE_REF, NOW)).toEqual({ ok: false, reason: "unsupported_event" })
  })
  it.each(["person.optin", "person.optout"])("refuse %s malformé dans le parseur général", (type) => {
    expect(parseReseauPublicEvent({ type, arbitrary: true }, PAGE_REF, NOW)).toEqual({ ok: false, reason: "invalid_payload" })
  })
  it("préserve le refus explicite des URLs de logo historiques", () => {
    expect(parseReseauPublicPage({ ...page, logoUrl: image.url }, PAGE_REF, NOW)).toEqual({ ok: false, reason: "unsupported_media" })
    expect(parseReseauPublicEvent({ ...page, logo: image, logoUrl: image.url }, PAGE_REF, NOW)).toEqual({ ok: false, reason: "unsupported_media" })
    for (const logoUrl of ["", "  ", "\nhttps://cdn.example.org/logo.png", undefined, 1]) expect(parseReseauPublicPage({ ...page, logoUrl }, PAGE_REF, NOW)).toEqual(INVALID)
  })
  it("accepte le retrait sans page locale et refuse les métadonnées étrangères", () => {
    expect(parseReseauPublicEvent({ ...page, verifiedAt: null }, PAGE_REF, NOW)).toEqual({ ok: true, event: { ...page, verifiedAt: null } })
    for (const payload of [{ ...page, audience: "public" }, { ...page, name: "x" }, { ...page, country: "ga" }, { ...page, verifiedAt: NOW + FEDERATION_MAX_SKEW_MS + 1 }, { ...page, description: "\u0000" }]) expect(parseReseauPublicPage(payload, PAGE_REF, NOW)).toEqual(INVALID)
    expect(parseReseauPublicPage(page, "page:autre", NOW)).toEqual(INVALID)
  })
})

describe("RESEAU-PUBLIC-V1 — publications publiques PA9B", () => {
  it("accepte un texte public avec consentement explicite sans auteur personne", () => {
    expect(parsePost({ ...post, body: "  Communiqué @agent.externe\nSuite  " })).toEqual({ ok: true, event: { ...post, body: "Communiqué @agent.externe\nSuite" } })
  })
  it("exige chacun des champs du contrat publié", () => {
    for (const key of Object.keys(post)) {
      const payload: Record<string, unknown> = { ...post }
      delete payload[key]
      expect(parsePost(payload)).toEqual(INVALID)
    }
  })
  it.each([
    { audience: "organisation" }, { audience: "followers" }, { audience: "connections" },
    { publishToAntsia: false }, { publishToAntsia: "true" }, { pageRef: "avec espace" },
    { postRef: "post:autre" }, { revision: 0 }, { revision: 1.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { body: "" }, { body: "  " }, { body: "Texte\u0000" }, { body: "x".repeat(PERSONAL_POST_MAX_LENGTH + 1) },
    { media: undefined }, { media: null }, { media: {} }, { publishedAt: 0 }, { publishedAt: 1.5 },
    { publishedAt: NOW + FEDERATION_MAX_SKEW_MS + 1 }, { authorPersonId: "person:inventee" },
    { networkId: "network:inventee" }, { tags: [] }, { unknown: true },
  ])("refuse une publication ouverte, privée ou mal typée (%j)", (patch) => {
    expect(parsePost({ ...post, ...patch })).toEqual(INVALID)
  })
  it("admet exactement la borne future et refuse une horloge invalide", () => {
    expect(parsePost({ ...post, publishedAt: NOW + FEDERATION_MAX_SKEW_MS }).ok).toBe(true)
    expect(parseReseauPublicEvent(post, POST_REF, Number.NaN)).toEqual(INVALID)
    expect(parseReseauPublicEvent(post, POST_REF, Number.POSITIVE_INFINITY)).toEqual(INVALID)
  })
  it("accepte une photo sans légende, quatre images ou une vidéo seule", () => {
    expect(parsePost({ ...post, body: "", media: [image] }).ok).toBe(true)
    expect(parsePost({ ...post, media: Array.from({ length: 4 }, (_, index) => ({ ...image, url: `https://cdn.example.org/${index}.png` })) }).ok).toBe(true)
    expect(parsePost({ ...post, media: [video] }).ok).toBe(true)
    for (const media of [[image, video], [video, video], Array(5).fill(image)]) expect(parsePost({ ...post, media })).toEqual(INVALID)
  })
  it("normalise l'ordre des clés sans interpréter les mentions", () => {
    const payload = { ...post, media: [{ ...image, altText: "  Une image publique  ", width: 640, height: 480 }] }
    const reversed = Object.fromEntries(Object.entries(payload).reverse())
    expect(parsePost(reversed)).toEqual(parsePost(payload))
    expect(parsePost(payload)).toMatchObject({ ok: true, event: { media: [{ altText: "Une image publique", width: 640, height: 480 }] } })
  })
})

describe("RESEAU-PUBLIC-V1 — descripteurs signés des médias", () => {
  it.each([
    { storageId: "interdit" }, { url: "http://cdn.example.org/a.png" }, { url: "//cdn.example.org/a.png" },
    { url: "https:cdn.example.org/a.png" }, { url: "https://user:password@cdn.example.org/a.png" },
    { url: "https://@cdn.example.org/a.png" }, { url: "https://cdn.example.org/a.png#" },
    { url: "https://cdn.example.org/a.png#fragment" }, { url: " https://cdn.example.org/a.png" },
    { url: "https://cdn.example.org/\na.png" }, { url: "https://cdn.example.org/\\a.png" },
    { url: `https://cdn.example.org/${"x".repeat(2048)}` },
    { kind: "audio" }, { mimeType: "image/svg+xml" }, { mimeType: "text/html" }, { mimeType: "image/png; charset=utf-8" },
    { sizeBytes: 0 }, { sizeBytes: -1 }, { sizeBytes: 1.5 }, { sizeBytes: Number.POSITIVE_INFINITY },
    { sha256: SHA256.toUpperCase() }, { sha256: "a".repeat(63) }, { sha256: "z".repeat(64) },
    { width: 0 }, { width: 1.5 }, { height: 32_769 }, { durationMs: 86_400_001 },
    { altText: "x".repeat(POST_MEDIA_ALT_MAX_LENGTH + 1) }, { altText: "Image\u007f" },
  ])("refuse un descripteur dangereux ou non borné (%j)", (patch) => {
    expect(parsePost({ ...post, media: [{ ...image, ...patch }] })).toEqual(INVALID)
  })
  it.each(["url", "kind", "mimeType", "sizeBytes", "sha256"])("exige le champ média %s", (key) => {
    const item: Record<string, unknown> = { ...image }
    delete item[key]
    expect(parsePost({ ...post, media: [item] })).toEqual(INVALID)
  })
  it.each(["width", "height", "durationMs", "altText"])("refuse une métadonnée %s présente mais indéfinie", (key) => {
    expect(parsePost({ ...post, media: [{ ...image, [key]: undefined }] })).toEqual(INVALID)
  })
  it.each([
    "localhost", "localhost.", "sub.localhost", "metadata.google.internal", "service.local", "service", "example.test",
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "127.1", "2130706433", "0x7f000001",
    "169.254.169.254", "172.16.0.1", "172.31.255.254", "192.168.0.1", "192.0.2.1",
    "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
    "[::1]", "[::ffff:127.0.0.1]", "[2001:db8::1]",
  ])("refuse l'hôte non public ou littéral non pris en charge %s", (host) => {
    expect(parsePost({ ...post, media: [{ ...image, url: `https://${host}/image.png` }] })).toEqual(INVALID)
  })
  it("préserve les limites fines du domaine et borne toute vidéo distante à 50 Mio", () => {
    expect(parsePost({ ...post, media: [{ ...image, sizeBytes: POST_IMAGE_MAX_BYTES }] }).ok).toBe(true)
    expect(parsePost({ ...post, media: [{ ...image, sizeBytes: POST_IMAGE_MAX_BYTES + 1 }] })).toEqual(INVALID)
    expect(parsePost({ ...post, media: [{ ...video, sizeBytes: 50 * 1024 * 1024, durationMs: 86_400_000, width: 32_768 }] }).ok).toBe(true)
    expect(parsePost({ ...post, media: [{ ...video, sizeBytes: 50 * 1024 * 1024 + 1 }] })).toEqual(INVALID)
    expect(parsePost({ ...post, media: [{ ...image, mimeType: "video/mp4" }] })).toEqual(INVALID)
  })
  it("SD-03 — la vidéo suit la liste blanche du domaine (MP4, WebM) ; sa durée garde la borne du contrat", () => {
    expect(parsePost({ ...post, media: [{ ...video, mimeType: "video/webm" }] }).ok).toBe(true)
    expect(parsePost({ ...post, media: [{ ...video, mimeType: "video/quicktime" }] })).toEqual(INVALID)
    expect(parsePost({ ...post, media: [{ ...video, durationMs: 6 * 60_000 }] }).ok).toBe(true)
  })
})

describe("RESEAU-PUBLIC-V1 — logos PA9B et tombes de publication", () => {
  it("admet un logo image signé ou son retrait sans changer le contrat historique", () => {
    expect(parseReseauPublicPage({ ...page, logo: image }, PAGE_REF, NOW)).toEqual({ ok: true, event: { ...page, logo: image } })
    expect(parseReseauPublicEvent({ ...page, logo: null }, PAGE_REF, NOW)).toEqual({ ok: true, event: { ...page, logo: null } })
    expect(parseReseauPublicEvent({ ...page, logoUrl: null, logo: image }, PAGE_REF, NOW).ok).toBe(true)
  })
  it("applique l'usage page_logo et sa limite de 5 Mio", () => {
    expect(parseReseauPublicEvent({ ...page, logo: { ...image, sizeBytes: UPLOAD_USAGES.page_logo.maxBytes } }, PAGE_REF, NOW).ok).toBe(true)
    for (const logo of [undefined, video, { ...image, mimeType: "image/gif" }, { ...image, sizeBytes: UPLOAD_USAGES.page_logo.maxBytes + 1 }, { ...image, unknown: true }]) expect(parseReseauPublicEvent({ ...page, logo }, PAGE_REF, NOW)).toEqual(INVALID)
  })
  it("admet une tombe sans page, contenu, média ni auteur personne", () => {
    expect(parsePost(removed)).toEqual({ ok: true, event: removed })
    expect(parsePost({ ...removed, revision: 1 })).toEqual({ ok: true, event: { ...removed, revision: 1 } })
  })
  it.each([{ pageRef: PAGE_REF }, { body: "ancien texte" }, { media: [] }, { postRef: "post:autre" }, { revision: 0 }, { revision: 1.1 }])("refuse une tombe ouverte ou incohérente (%j)", (patch) => {
    expect(parsePost({ ...removed, ...patch })).toEqual(INVALID)
  })
  it("exige chacun des champs du retrait et refuse les payloads étrangers", () => {
    for (const key of Object.keys(removed)) {
      const payload: Record<string, unknown> = { ...removed }
      delete payload[key]
      expect(parsePost(payload)).toEqual(INVALID)
    }
    for (const payload of [null, [], "post", {}, { type: "post.updated" }]) expect(parsePost(payload)).toEqual(INVALID)
  })
})
