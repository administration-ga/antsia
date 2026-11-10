// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useBusinessAnnouncement, type BusinessAnnouncementFacts } from "./use-business-announcement"

// K12/AC03 : scénarios écrits seulement, sans exécution.
const describeChange = vi.fn((changed: readonly string[]) => changed.join(" / "))
function Harness({ subject = "one", facts, enabled = true, format = describeChange }: {
  subject?: string; facts: BusinessAnnouncementFacts | null; enabled?: boolean; format?: (changed: readonly string[]) => string
}) {
  const announcement = useBusinessAnnouncement(subject, facts, format, enabled)
  return <p role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
}
let root: Root, container: HTMLDivElement
async function render(props: Parameters<typeof Harness>[0]) {
  await act(async () => root.render(<StrictMode><Harness {...props} /></StrictMode>))
}
const region = () => container.querySelector('[role="status"]')!
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  describeChange.mockClear()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("annonces de faits métier après observation initiale", () => {
  it("reste muet au montage, y compris avec les effets stricts de React", async () => {
    await render({ facts: { state: "pending" } })
    expect(region().textContent).toBe("")
    expect(describeChange).not.toHaveBeenCalled()
    expect(region().getAttribute("aria-live")).toBe("polite")
  })
  it("ne décrit que les catégories modifiées et garde le même hôte d'annonce", async () => {
    await render({ facts: { state: "pending", refund: "none" } })
    const host = region()
    await render({ facts: { state: "confirmed", refund: "none" } })
    expect(region()).toBe(host)
    expect(region().textContent).toBe("state")
    expect(describeChange).toHaveBeenCalledExactlyOnceWith(["state"])
  })
  it("un poll identique ne réécrit pas le texte ni ne rappelle le formateur", async () => {
    await render({ facts: { state: "pending" } })
    await render({ facts: { state: "confirmed" } })
    const node = region().firstChild
    await render({ facts: { state: "confirmed" } })
    expect(region().firstChild).toBe(node)
    expect(describeChange).toHaveBeenCalledTimes(1)
  })
  it("un changement de formateur ou de langue seul ne constitue pas une transition métier", async () => {
    await render({ facts: { state: "pending" } })
    const english = vi.fn(() => "Updated")
    await render({ facts: { state: "pending" }, format: english })
    expect(english).not.toHaveBeenCalled()
    expect(region().textContent).toBe("")
  })
  it("un nouveau dossier repart silencieusement et ne garde pas l'annonce du précédent", async () => {
    await render({ facts: { state: "pending" } })
    await render({ facts: { state: "confirmed" } })
    await render({ subject: "two", facts: { state: "failed" } })
    expect(region().textContent).toBe("")
    expect(describeChange).toHaveBeenCalledTimes(1)
  })
  it("une projection retirée puis relue est une nouvelle référence initiale, jamais une réussite", async () => {
    await render({ facts: { state: "pending" } })
    await render({ facts: { state: "confirmed" } })
    await render({ facts: null })
    expect(region().textContent).toBe("")
    await render({ facts: { state: "failed" } })
    expect(region().textContent).toBe("")
    expect(describeChange).toHaveBeenCalledTimes(1)
  })
  it("une présentation muette ne rejoue pas ses changements lorsqu'elle devient détaillée", async () => {
    await render({ facts: { state: "pending" }, enabled: false })
    await render({ facts: { state: "confirmed" }, enabled: false })
    await render({ facts: { state: "confirmed" } })
    expect(region().textContent).toBe("")
    expect(describeChange).not.toHaveBeenCalled()
  })
  it("un remontage ne rejoue pas un ancien changement", async () => {
    await render({ facts: { state: "pending" } })
    await render({ facts: { state: "confirmed" } })
    await act(async () => root.render(null))
    await render({ facts: { state: "confirmed" } })
    expect(region().textContent).toBe("")
    expect(describeChange).toHaveBeenCalledTimes(1)
  })
})
