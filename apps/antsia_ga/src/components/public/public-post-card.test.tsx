// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import type { PublicPost } from "@antsia/social-contracts/publicNetwork"
import type { PostMediaDto } from "@antsia/social-contracts/media"
import { createAppI18n, type Locale } from "@antsia/social-features/i18n"
import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { PUBLIC_INLINE_LINK_CLASS, PublicPostCard } from "./public-post-card"
import { PublicFeed } from "./public-feed"

const post: PublicPost = { id: "visible", body: "<script>forbidden()</script> #gabon @alice", publishedAt: 1_700_000_000_000, editedAt: null, tags: ["gabon"], province: null, author: { kind: "person", handle: null, displayName: null, badges: [], avatarUrl: null }, origin: { slug: "diasporale", name: "DIASPORALE" }, media: [{ kind: "image", mimeType: "image/png", url: "https://media.example/withheld", withheld: "fileQuarantined" }], shared: { available: false } }

/** Le fournisseur public réel, sans session, réseau ni client Convex. */
function renderPublic(children: ReactNode, locale: Locale = "fr") {
  const i18n = createAppI18n({ locale, appResources, defaultNS: "antsia" })
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>)
}

function renderCard(value: PublicPost, locale: Locale = "fr") {
  const html = renderPublic(<PublicPostCard post={value} locale={locale} />, locale)
  const container = document.createElement("div")
  container.innerHTML = html
  const article = container.querySelector("article")
  if (!article) throw new Error("La carte publique doit produire un article en HTML initial")
  return { html, article }
}

function expectBefore(first: Element | null, second: Element | null) {
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(first!.compareDocumentPosition(second!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
}

const image: PostMediaDto = { kind: "image", mimeType: "image/jpeg", url: "https://media.example/photo.jpg", withheld: null, width: 1080, height: 1350, altText: "Présentation de l’activité" }

describe("carte publique serveur", () => {
  it("rend texte, identité neutre et origine en HTML initial sans HTML usager ni URL retenue", () => {
    const html = renderPublic(<PublicPostCard post={post} locale="fr" />)
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("Profil non publié")
    expect(html).toContain("Origine : DIASPORALE")
    expect(html).toContain('href="/tags/gabon"')
    expect(html).not.toContain("media.example/withheld")
    expect(html).toContain("originale n’est plus disponible")
    expect(html).not.toContain("toggleReaction")
  })
  it("montre l'origine du partage original et conserve la continuation d'une fenêtre vide", () => {
    const shared: PublicPost = { ...post, shared: { available: true, id: "original", body: "Source publique", publishedAt: post.publishedAt, author: post.author, origin: { slug: "antsia", name: "ANTSIA" }, media: [] } }
    expect(renderPublic(<PublicPostCard post={shared} locale="en" />, "en")).toContain("Origin: ANTSIA")
    const html = renderPublic(<PublicFeed result={{ status: "ready", viewer: "anonymous", data: { page: [], isDone: false, continueCursor: "next=opaque" } }} locale="fr" base="/decouvrir" />)
    expect(html).toContain("fenêtre")
    expect(html).toContain("cursor=next%3Dopaque")
    expect(html).toContain("Page suivante")
  })

  it("suit l'ordre des chartes : identité, origine, légende, média posé, puis les actions (ADR-0028)", () => {
    const value: PublicPost = { ...post, author: { ...post.author, displayName: "Atelier partagé", handle: "atelier" }, body: "Une légende lisible", media: [image], shared: null }
    const { article } = renderCard(value)
    const identity = article.querySelector(`a[href="${routes.publicProfile("atelier")}"]`)
    const origin = Array.from(article.querySelectorAll("p")).find((node) => node.textContent === "Origine : DIASPORALE") ?? null
    const media = article.querySelector("img")
    const actions = article.querySelector('[role="group"][aria-label="Actions de la publication publique"]')
    const caption = Array.from(article.querySelectorAll("p")).find((node) => node.textContent === value.body) ?? null
    expectBefore(identity, origin)
    expectBefore(origin, caption)
    expectBefore(caption, media)
    expectBefore(media, actions)
    expect(article.getAttribute("data-post-presentation")).toBe("charte")
    expect(media?.getAttribute("alt")).toBe(image.altText)
    expect(article.querySelector("time")?.getAttribute("datetime")).toBe(new Date(value.publishedAt).toISOString())
  })

  it("livre toute une longue légende dans un details natif, avec les liens complets après l’aperçu", () => {
    const body = `${"Une présentation détaillée de notre activité et de son savoir-faire. ".repeat(8)}\nDernière ligne #gabon @alice <script>interdit()</script>`
    const { html, article } = renderCard({ ...post, body, media: [image], shared: null })
    const details = article.querySelector("details")
    const summary = details?.querySelector("summary")
    const complete = details?.querySelector("p")
    expect(details).not.toBeNull()
    expect(details?.hasAttribute("open")).toBe(false)
    expect(summary?.textContent).toContain("Lire la suite")
    expect(summary?.textContent).not.toContain("Dernière ligne")
    expect(summary?.querySelector("button")).toBeNull()
    expect(complete?.textContent).toBe(body)
    expect(complete?.querySelector(`a[href="${routes.tag("gabon")}"]`)?.textContent).toBe("#gabon")
    expect(complete?.querySelector(`a[href="${routes.publicProfile("alice")}"]`)?.textContent).toBe("@alice")
    expect(article.querySelector("script")).toBeNull()
    expect(html).toContain("&lt;script&gt;interdit()&lt;/script&gt;")
    expectBefore(details, article.querySelector("img"))
    expectBefore(details, article.querySelector('[role="group"][aria-label="Actions de la publication publique"]'))
  })

  it("présente un texte seul intégral avant les actions sans le réduire à un aperçu", () => {
    const body = `${"Un texte sans photo conserve toutes ses phrases. ".repeat(12)}\nFin du texte #gabon @alice`
    const { article } = renderCard({ ...post, body, media: [], shared: null })
    const complete = Array.from(article.querySelectorAll("p")).find((node) => node.textContent === body) ?? null
    expect(complete).not.toBeNull()
    expect(article.querySelector("details, img, video")).toBeNull()
    expectBefore(complete, article.querySelector('[role="group"][aria-label="Actions de la publication publique"]'))
    expect(complete?.querySelector(`a[href="${routes.tag("gabon")}"]`)).not.toBeNull()
  })

  it("P18b (A09) : mots-dièse et mentions lisent le jeton de soulignement du texte courant, pas la seule couleur", () => {
    const { article } = renderCard({ ...post, body: "Bonjour #gabon @alice", media: [], shared: null })
    for (const href of [routes.tag("gabon"), routes.publicProfile("alice")]) {
      const link = article.querySelector(`a[href="${href}"]`)
      expect(link?.getAttribute("class")).toBe(PUBLIC_INLINE_LINK_CLASS)
      expect(link?.getAttribute("class")).toContain("--esp-inline-link-decoration")
      expect(link?.getAttribute("class")).not.toContain("hover:underline")
    }
  })

  it.each(["image", "video"] as const)("ne délivre aucune URL pour un média %s retenu, même si le DTO en contient une", (kind) => {
    const withheld: PostMediaDto = { kind, mimeType: kind === "video" ? "video/mp4" : "image/jpeg", url: "https://media.example/forbidden-retained", withheld: "fileQuarantined" }
    const { html, article } = renderCard({ ...post, media: [withheld], shared: null })
    const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia" })
    expect(article.querySelector('[role="note"]')?.textContent).toBe(i18n.t("errors:fileQuarantined"))
    expect(article.querySelector("img, video, source")).toBeNull()
    expect(html).not.toContain("forbidden-retained")
  })

  it.each([
    { locale: "fr" as const, carousel: "Photos de la publication, 4 images", next: "Image suivante", actions: "Actions de la publication publique" },
    { locale: "en" as const, carousel: "Photos of the post, 4 images", next: "Next image", actions: "Public post actions" },
  ])("rend une galerie publique de quatre images traduite en $locale sans fournisseur membre", ({ locale, carousel, next, actions }) => {
    const media = Array.from({ length: 4 }, (_, index): PostMediaDto => ({ ...image, url: `https://media.example/photo-${index + 1}.jpg`, altText: `Vue ${index + 1}` }))
    const { article } = renderCard({ ...post, media, shared: null }, locale)
    const images = Array.from(article.querySelectorAll("img"))
    expect(images.map((element) => element.getAttribute("src"))).toEqual(media.map((item) => item.url))
    expect(images.map((element) => element.getAttribute("alt"))).toEqual(media.map((item) => item.altText))
    expect(article.querySelector('[role="region"]')?.getAttribute("aria-label")).toBe(carousel)
    expect(Array.from(article.querySelectorAll("button")).some((button) => button.getAttribute("aria-label") === next)).toBe(true)
    expect(article.querySelector('[aria-live="polite"]')?.textContent).toContain("1")
    expect(article.querySelector('[aria-live="polite"]')?.textContent).toContain("4")
    expect(article.querySelector(`[role="group"][aria-label="${actions}"]`)).not.toBeNull()
  })

  it.each([
    { locale: "fr" as const, label: "Vidéo de la publication" },
    { locale: "en" as const, label: "Video of the post" },
  ])("rend une vidéo publique en $locale avec commandes et sans lecture automatique", ({ locale, label }) => {
    const media: PostMediaDto = { kind: "video", mimeType: "video/mp4", url: "https://media.example/video.mp4", withheld: null, width: 1080, height: 1920 }
    const { article } = renderCard({ ...post, media: [media], shared: null }, locale)
    const video = article.querySelector("video")
    expect(video?.getAttribute("src")).toBe(media.url)
    expect(video?.getAttribute("aria-label")).toBe(label)
    expect(video?.hasAttribute("controls")).toBe(true)
    expect(video?.hasAttribute("playsinline")).toBe(true)
    expect(video?.getAttribute("preload")).toBe("metadata")
    expect(video?.hasAttribute("autoplay")).toBe(false)
  })

  it("sépare l’origine de la projection du texte usager et échappe identité, origine et légende", () => {
    const originName = 'Origine autorisée <img src="bad" onerror="injection()">'
    const authorName = '<svg onload="injection()">Atelier</svg>'
    const value: PublicPost = { ...post, origin: { slug: "antsia", name: originName }, author: { ...post.author, displayName: authorName }, body: "Origine : FAUSSE ORIGINE <script>injection()</script>", media: [], shared: null }
    const { html, article } = renderCard(value)
    const paragraphs = Array.from(article.querySelectorAll("p"))
    expect(paragraphs.some((node) => node.textContent === `Origine : ${originName}`)).toBe(true)
    expect(paragraphs.some((node) => node.textContent === value.body)).toBe(true)
    expect(article.textContent).toContain(authorName)
    expect(article.querySelector("script, img, svg, [onerror], [onload]")).toBeNull()
    expect(html).toContain("&lt;img")
    expect(html).toContain("&lt;script&gt;")
  })

  it("propose la participation avec une continuation vers cette publication, sans action membre anonyme", () => {
    const { article } = renderCard({ ...post, media: [], shared: null })
    const actions = article.querySelector('[role="group"][aria-label="Actions de la publication publique"]')
    const links = Array.from(actions?.querySelectorAll("a") ?? [])
    expect(links.find((link) => link.textContent === "Entrer pour participer")?.getAttribute("href")).toBe(routes.signIn(undefined, post.id))
    expect(links.find((link) => link.textContent === "Ouvrir la publication")?.getAttribute("href")).toBe(routes.publication(post.id))
    expect(actions?.querySelector("button, form")).toBeNull()
  })
})
