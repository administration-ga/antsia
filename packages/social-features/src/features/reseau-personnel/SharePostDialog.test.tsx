// @vitest-environment jsdom
// Écrit pour le moteur : copie du lien membre sans mutation sociale, refus honnête, focus et citation explicite.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n, type Locale } from "../../i18n"
import { EngineTestWrapper, TEST_NETWORK_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({ publish: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { posts: { posts: { publish: "publish" } } } } }))
vi.mock("convex/react", () => ({ useMutation: () => mocks.publish }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SharePostDialog } from "./SharePostDialog"

function Harness({ canQuote = true }: { canQuote?: boolean }) {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}>Ouvrir le partage</button>
    {open ? <SharePostDialog postId={"posts_1" as never} authorName="Awa" excerpt="Une publication" canQuote={canQuote} onClose={() => setOpen(false)} /> : null}
  </>
}

const postRoute = (id: string) => `/membres/fil?post=${encodeURIComponent(id)}&contexte=reseau`
const expectedLink = () => new URL(postRoute("posts_1"), window.location.origin).href

async function openDialog({ locale = "fr", canQuote = true, withRoute = true }: { locale?: Locale; canQuote?: boolean; withRoute?: boolean } = {}) {
  const i18n = createAppI18n({ locale, appResources: { fr: {}, en: {} }, defaultNS: "social" })
  render(
    <EngineTestWrapper routes={{ ...TEST_ROUTES, ...(withRoute ? { post: postRoute } : {}) }}>
      <I18nextProvider i18n={i18n}><Harness canQuote={canQuote} /></I18nextProvider>
    </EngineTestWrapper>,
  )
  const trigger = screen.getByRole("button", { name: "Ouvrir le partage" })
  trigger.focus()
  fireEvent.click(trigger)
  await screen.findByRole("dialog")
  return { trigger, i18n }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.publish.mockResolvedValue({ ok: true })
})
afterEach(() => vi.unstubAllGlobals())

describe("SharePostDialog", () => {
  it.each([
    { locale: "fr" as const, copy: "Copier le lien", label: "Lien de la publication", copied: "Lien copié." },
    { locale: "en" as const, copy: "Copy link", label: "Post link", copied: "Link copied." },
  ])("$locale : copie la route injectée, sans publier, puis restitue le focus", async ({ locale, copy, label, copied }) => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    const { trigger } = await openDialog({ locale, canQuote: false })
    const input = screen.getByRole("textbox", { name: label }) as HTMLInputElement
    expect(input).toHaveAttribute("readonly")
    expect(input.value).toBe(expectedLink())
    fireEvent.click(screen.getByRole("button", { name: copy }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(copied))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expectedLink())
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(screen.queryByRole("combobox")).toBeNull()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it.each(["refused", "unavailable"])("copie %s : annonce l'échec et sélectionne le lien pour une copie manuelle", async (failure) => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"))
    vi.stubGlobal("navigator", failure === "refused" ? { clipboard: { writeText } } : {})
    await openDialog({ canQuote: false })
    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }))
    await screen.findByText(/La copie automatique a échoué/)
    const input = screen.getByRole("textbox", { name: "Lien de la publication" }) as HTMLInputElement
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(input).toHaveAccessibleDescription(/copiez-le manuellement/)
    expect(toast.success).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("conserve le focus et borne une copie en attente à une seule écriture", async () => {
    let finishCopy!: () => void
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finishCopy = resolve }))
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    await openDialog({ canQuote: false })
    const copy = screen.getByRole("button", { name: "Copier le lien" })
    copy.focus()
    fireEvent.click(copy)
    expect(copy).toHaveAttribute("aria-busy", "true")
    expect(copy).toHaveAttribute("aria-disabled", "true")
    expect(copy).toHaveFocus()
    fireEvent.click(copy)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()
    await act(async () => finishCopy())
    expect(copy).toHaveAttribute("aria-busy", "false")
    expect(copy).toHaveFocus()
    expect(toast.success).toHaveBeenCalledWith("Lien copié.")
  })

  it("n'ouvre le formulaire et ne publie une citation que sur gestes explicites", async () => {
    await openDialog()
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(mocks.publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Partager dans mon fil" }))
    expect(screen.getByRole("button", { name: "Partager dans mon fil" })).toHaveAttribute("aria-expanded", "true")
    fireEvent.change(screen.getByRole("textbox", { name: "Ajouter un mot (facultatif)" }), { target: { value: "  À lire  " } })
    fireEvent.change(screen.getByRole("combobox", { name: "Qui voit votre partage" }), { target: { value: "connections" } })
    expect(mocks.publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Partager" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, sharedPostId: "posts_1", body: "À lire", audience: "connections" }))
    expect(toast.success).toHaveBeenCalledWith("Publication partagée.")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it.each([
    { locale: "fr" as const, quote: "Partager dans mon fil", share: "Partager", said: "Partage en relecture : visible de vous seul pour l'instant." },
    { locale: "en" as const, quote: "Share to my feed", share: "Share", said: "Share under review: only you can see it for now." },
  ])("FD-04 ($locale) : un partage retenu en relecture se dit tel quel, jamais « partagé »", async ({ locale, quote, share, said }) => {
    mocks.publish.mockResolvedValueOnce({ postId: "posts_2", created: true, moderation: "pending_review" })
    await openDialog({ locale })
    fireEvent.click(screen.getByRole("button", { name: quote }))
    fireEvent.click(screen.getByRole("button", { name: share }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledExactlyOnceWith(said))
  })

  it("une application sans route de publication conserve son formulaire de citation", async () => {
    await openDialog({ withRoute: false })
    expect(screen.queryByRole("button", { name: "Copier le lien" })).toBeNull()
    expect(screen.getByRole("combobox", { name: "Qui voit votre partage" })).toBeInTheDocument()
    expect(mocks.publish).not.toHaveBeenCalled()
  })
})
