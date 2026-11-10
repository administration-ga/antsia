// @vitest-environment jsdom
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"
import { ProfilePublicationCard } from "./ProfilePublicationCard"

const mocks = vi.hoisted(() => ({
  withheld: "fileScanUnavailable" as MediaWithheld | null,
  profileWithheld: null as MediaWithheld | null,
  success: vi.fn(),
  error: vi.fn(),
  place: vi.fn(),
}))

vi.mock("@antsia/api/engine", () => ({
  api: { modules: { people: {
    persons: { getMyPerson: "getMyPerson" },
    profile: { publishMyProfile: "publishMyProfile", withdrawMyProfile: "withdrawMyProfile", setMyProfilePrivacy: "setMyProfilePrivacy", setMyAvatar: "setMyAvatar", setMyCover: "setMyCover", generateProfileUploadUrl: "generateProfileUploadUrl" },
  } } },
}))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: () => ({ isLoading: false, isError: false, data: {
    published: true, private: false, handle: "asted", displayName: "Asted",
    avatar: { url: null, withheld: mocks.profileWithheld }, cover: { url: null, withheld: mocks.profileWithheld },
  } }),
}))
vi.mock("./use-profile-onboarding", () => ({ useProfileOnboardingAccount: () => ({}) }))
vi.mock("convex/react", () => ({
  useMutation: (reference: string) => reference === "generateProfileUploadUrl"
    ? vi.fn(async () => "https://upload.example/profile")
    : reference === "setMyAvatar" || reference === "setMyCover"
      ? mocks.place
      : vi.fn(async () => undefined),
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withheld = "fileScanUnavailable"
  mocks.profileWithheld = null
  mocks.place.mockImplementation(async () => ({ url: null, withheld: mocks.withheld }))
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ storageId: "storage_profile" }) })))
})
afterEach(() => vi.unstubAllGlobals())

describe("analyse des images du profil", () => {
  it.each([0, 1])("ne présente pas une analyse indisponible comme une image mise à jour (entrée %s)", async (inputIndex) => {
    const view = renderWithEngine(<ProfilePublicationCard />)
    const input = view.container.querySelectorAll<HTMLInputElement>('input[type="file"]')[inputIndex]!
    fireEvent.change(input, { target: { files: [new File(["image"], "photo.png", { type: "image/png" })] } })
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("L'analyse de sécurité n'a pas pu être terminée. Le fichier reste indisponible jusqu'à sa vérification."))
    expect(mocks.place).toHaveBeenCalledOnce()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("distingue une analyse indisponible d'une photo ou couverture bloquée dans le profil", () => {
    mocks.profileWithheld = "fileScanUnavailable"
    renderWithEngine(<ProfilePublicationCard />)
    expect(screen.getAllByText("L'analyse de sécurité n'a pas pu être terminée. Le fichier reste indisponible jusqu'à sa vérification.")).toHaveLength(2)
    expect(screen.queryByText(/a été bloquée par l'analyse de sécurité/)).toBeNull()
  })
})
