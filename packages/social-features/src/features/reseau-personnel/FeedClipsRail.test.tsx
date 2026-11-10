// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { PostMediaDto } from "@antsia/social-contracts/media"

import { renderWithEngine, TEST_ROUTES } from "../../tests/engine-wrapper"
import { FeedClipsRail, feedClipPreviews } from "./FeedClipsRail"

type ClipPost = Parameters<typeof feedClipPreviews>[0][number]
const video: PostMediaDto = { kind: "video", url: "https://media.example.test/video.mp4", withheld: null, mimeType: "video/mp4" }
const post = (id: string, media: PostMediaDto[] = [video]): ClipPost => ({ _id: id, media, author: { displayName: "Awa MBA", handle: "awa.mba" }, page: null }) as ClipPost

describe("Clips du fil — sources réellement livrables", () => {
  it("exclut les images, toute retenue et les URL absentes, déduplique et borne la fenêtre", () => {
    const posts = [post("absent", [{ ...video, url: null }]), post("retenu", [{ ...video, withheld: "fileScanPending" }]), post("image", [{ ...video, kind: "image" }]), post("ok"), post("ok"), ...Array.from({ length: 6 }, (_, i) => post(`video-${i}`))]
    expect(feedClipPreviews(posts).map(({ post: value }) => value._id)).toEqual(["ok", "video-0", "video-1", "video-2"])
  })

  it("ouvre les vrais détails et le lecteur injecté sans lecture automatique", () => {
    const view = renderWithEngine(<FeedClipsRail posts={[post("posts_1")]} />, { routes: { ...TEST_ROUTES, post: (id) => `/publication/${id}`, clips: () => "/clips" } })
    expect(screen.getByRole("link", { name: "Voir la vidéo de Awa MBA" })).toHaveAttribute("href", "/publication/posts_1")
    expect(screen.getByRole("link", { name: "Voir tous les clips" })).toHaveAttribute("href", "/clips")
    const media = view.container.querySelector("video")!
    expect(media.autoplay).toBe(false)
    expect(media.preload).toBe("metadata")
    expect(media.muted).toBe(true)
  })

  it("le masquage retire seulement l’aperçu, sans mutation ni suppression des publications", () => {
    const posts = [post("posts_1")]
    renderWithEngine(<FeedClipsRail posts={posts} />, { routes: { ...TEST_ROUTES, post: (id) => `/publication/${id}`, clips: () => "/clips" } })
    fireEvent.click(screen.getByRole("button", { name: "Masquer les aperçus de clips" }))
    expect(screen.queryByRole("region", { name: "Clips du fil" })).toBeNull()
    expect(posts).toHaveLength(1)
  })

  it("sans vidéo livrable ou route fournie, n’invente aucune destination", () => {
    const view = renderWithEngine(<FeedClipsRail posts={[post("posts_1")]} />)
    expect(view.container.textContent).toBe("")
  })
})
