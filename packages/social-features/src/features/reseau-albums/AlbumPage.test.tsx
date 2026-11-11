// Dupliqué de socle/packages/agent-features/src/features/reseau-albums/AlbumPage.test.tsx @ ad2e7fdc2 — adaptations : rendu dans l'enveloppe du moteur (`renderWithEngine` : i18n français, réseau de test, routeur en mémoire au lieu d'un `useRouter` simulé) ; DTO du moteur (couverture `{ url, withheld, altText }`, champs absents en `null`, photo retenue `url: null` + `withheld`, propriétaire avec `personId` et nom éventuellement nul) ; lecture et retrait appelés avec le réseau courant ; retour au profil par l'adresse que sert l'application (table de routes de test) ; refus serveur à la forme du moteur (règle traduite) ; adresses d'images neutres ; les 12 cas sont gardés ; cas ajoutés : la photo retenue se dit à son propriétaire sans image, et un propriétaire sans nom publié est dit par le libellé neutre.
// @vitest-environment jsdom

/**
 * AlbumPage — la galerie d'un album (R-09, ADR-0145).
 *
 * Quatre garanties, et elles tiennent toutes à la même chose : le SERVEUR
 * décide, l'écran n'invente rien.
 *
 *  1. le refus est INDISTINCT — `null` rend une phrase unique, qui ne dit pas
 *     si l'album existe (inconnu, brouillon d'autrui, hors audience, blocage) ;
 *  2. une PANNE n'est pas un refus : bandeau + Réessayer, jamais la phrase ;
 *  3. l'audience et l'état ne s'affichent qu'au propriétaire ;
 *  4. le retrait ANNONCE qu'il ne rappelle rien (`albumWithdrawNotice`) — une
 *     interface qui laisse croire à une révocation ment.
 */
import type { EngineRoutes } from "@antsia/api/network"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EngineTestWrapper, memoryRouter, renderWithEngine, TEST_NETWORK_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

type QueryMock = {
  data: unknown
  isPending: boolean
  isFetching: boolean
  isError: boolean
  fetchStatus: "idle" | "fetching" | "paused"
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  result: null as QueryMock | null,
  query: vi.fn(),
  withdraw: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

function ok(data: unknown): QueryMock {
  return {
    data,
    isPending: false,
    isFetching: false,
    isError: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }
}

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (query: unknown, args: unknown) => {
    mocks.query(query, args)
    return mocks.result ?? ok(undefined)
  },
}))
vi.mock("convex/react", () => ({ useMutation: () => mocks.withdraw }))
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))
vi.mock("@antsia/ui", () => ({
  Alert: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="alert">
      <strong>{title}</strong>
      {children}
    </div>
  ),
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    variant: _variant,
    size: _size,
    icon: _icon,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
    icon?: string
  }) => <button {...props}>{children}</button>,
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Icon: () => null,
  SkeletonCard: () => <div data-testid="skeleton" />,
}))

import { AlbumPage } from "./AlbumPage"

const DETAIL = {
  album: {
    albumId: "al-1",
    title: "Mission de terrain à Oyem",
    description: "Trois jours d'inspection.",
    audience: "connections" as const,
    status: "published" as const,
    itemCount: 2,
    cover: null,
    updatedAt: 1,
    publishedAt: 1,
    isOwner: false,
  },
  owner: { personId: "persons_awa", handle: "awa", displayName: "Awa Ndong", avatarUrl: null },
  items: [
    {
      itemId: "it-1",
      url: "blob:photo-1",
      withheld: null,
      mimeType: "image/jpeg",
      width: null,
      height: null,
      altText: "La délégation à l'arrivée",
      caption: "Arrivée à Oyem",
      position: 0,
    },
    {
      itemId: "it-2",
      url: "blob:photo-2",
      withheld: null,
      mimeType: "image/jpeg",
      width: null,
      height: null,
      altText: null,
      caption: null,
      position: 1,
    },
  ],
  coverItemId: "it-1",
}

beforeEach(() => {
  mocks.result = null
  mocks.query.mockReset()
  mocks.withdraw.mockReset()
  mocks.withdraw.mockResolvedValue({ status: "withdrawn" })
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
})
afterEach(cleanup)

describe("AlbumPage — la galerie", () => {
  it("rend le titre, l'auteur, le décompte et les photos servies", () => {
    mocks.result = ok(DETAIL)
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Mission de terrain à Oyem",
    )
    expect(screen.getByText(/Awa Ndong/)).toBeTruthy()
    expect(screen.getByText(/2 photos/)).toBeTruthy()
    expect(screen.getByAltText("La délégation à l'arrivée")).toBeTruthy()
    expect(screen.getByText("Arrivée à Oyem")).toBeTruthy()
    // L'album se lit DANS le réseau courant.
    expect(getFunctionName(mocks.query.mock.calls[0]![0] as never)).toBe("modules/albums/albums:getAlbum")
    expect(mocks.query.mock.calls[0]![1]).toEqual({ networkId: TEST_NETWORK_ID, albumId: "al-1" })
  })

  it("une photo SANS description se déclare vide, jamais « photo 2 »", () => {
    mocks.result = ok(DETAIL)
    const { container } = renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    const images = Array.from(container.querySelectorAll("img"))
    expect(images.map((img) => img.getAttribute("alt"))).toEqual([
      "La délégation à l'arrivée",
      "",
    ])
  })

  it("un album vide le dit — sans prétendre qu'il est inaccessible", () => {
    mocks.result = ok({
      ...DETAIL,
      album: { ...DETAIL.album, itemCount: 0 },
      items: [],
    })
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    expect(screen.getByText("Cet album ne contient aucune photo.")).toBeTruthy()
    expect(screen.queryByText(/n'est pas accessible/)).toBeNull()
  })

  it("le retour ramène au profil qui porte l'album", () => {
    mocks.result = ok(DETAIL)
    const router = memoryRouter()
    // L'adresse du profil est celle que SERT l'application (`useRoutes().profile`),
    // qui échappe le handle — comme la table de routes d'antsia.ga.
    const routes: EngineRoutes = { ...TEST_ROUTES, profile: (handle) => `/profil/${encodeURIComponent(handle)}` }
    render(<AlbumPage handle="a wa" albumId="al-1" />, {
      wrapper: ({ children }) => (
        <EngineTestWrapper router={router.implementation} routes={routes}>
          {children}
        </EngineTestWrapper>
      ),
    })
    fireEvent.click(screen.getByRole("button", { name: "Retour au profil" }))
    expect(router.calls.map((call) => call.method)).toEqual(["push"])
    expect(router.calls[0]?.href).toBe("/profil/a%20wa")
  })

  it.each([null, "blob:retenu"])("une photo RETENUE par la garde se dit à son propriétaire, sans image (%s)", (url) => {
    mocks.result = ok({
      ...DETAIL,
      album: { ...DETAIL.album, isOwner: true },
      items: [
        DETAIL.items[0],
        { ...DETAIL.items[1], url, withheld: "fileScanPending" as const },
      ],
    })
    const { container } = renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(screen.getByText(/Analyse de sécurité en cours/)).toBeTruthy()
  })

  it("un propriétaire sans nom publié est dit par le libellé neutre", () => {
    mocks.result = ok({ ...DETAIL, owner: { ...DETAIL.owner, displayName: null, handle: null } })
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    expect(screen.getByText(/Membre du réseau/)).toBeTruthy()
    expect(screen.queryByText(/@awa/)).toBeNull()
  })
})

describe("AlbumPage — refus indistinct et panne (R-08)", () => {
  it("le refus du serveur (null) garde sa phrase unique, et sa sortie", () => {
    mocks.result = ok(null)
    const router = memoryRouter()
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />, { router: router.implementation })

    expect(screen.getByText("Cet album n'est pas accessible")).toBeTruthy()
    expect(
      screen.getByText(/Il n'existe pas, il n'est plus publié, ou il ne vous est pas ouvert/),
    ).toBeTruthy()
    // Une phrase qui ne distingue pas : ni « brouillon », ni « bloqué ».
    expect(screen.queryByText(/brouillon|bloqué|inconnu/i)).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Revenir au profil" }))
    expect(router.calls.map((call) => call.method)).toEqual(["push"])
    expect(router.calls[0]?.href).toBe("/profil/awa")
  })

  it("la panne se dit avec Réessayer — jamais la phrase du refus", () => {
    mocks.result = { ...ok(undefined), isError: true }
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)

    expect(screen.getByRole("alert").textContent).toContain("Album indisponible")
    expect(screen.queryByText(/n'est pas accessible/)).toBeNull()
    expect(screen.queryByTestId("skeleton")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.result.refetch).toHaveBeenCalledTimes(1)
  })

  it("le squelette reste réservé à la vraie attente", () => {
    mocks.result = ok(undefined)
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    expect(screen.getByTestId("skeleton")).toBeTruthy()
  })
})

describe("AlbumPage — ce que seul le propriétaire voit", () => {
  const MIEN = {
    ...DETAIL,
    album: { ...DETAIL.album, isOwner: true },
  }

  it("un lecteur autorisé ne voit ni l'audience ni l'état", () => {
    mocks.result = ok(DETAIL)
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    expect(screen.queryByText("Mes connexions")).toBeNull()
    expect(screen.queryByText("Publié")).toBeNull()
    expect(screen.queryByRole("button", { name: /Retirer cet album/ })).toBeNull()
  })

  it("le propriétaire voit l'audience, l'état, et l'AVERTISSEMENT de retrait", () => {
    mocks.result = ok(MIEN)
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)

    expect(screen.getByText("Mes connexions")).toBeTruthy()
    expect(screen.getByText("Publié")).toBeTruthy()
    expect(
      screen.getByText(/Une copie déjà téléchargée ne peut pas être rappelée/),
    ).toBeTruthy()
  })

  it("retirer appelle le serveur et l'annonce", async () => {
    mocks.result = ok(MIEN)
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)

    fireEvent.click(screen.getByRole("button", { name: "Retirer cet album" }))
    expect(mocks.withdraw).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmer le retrait" }))
    expect(mocks.withdraw).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, albumId: "al-1" })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Album retiré."))
  })

  it("un refus est lu dans `error.data` — jamais inventé", async () => {
    // En production Convex caviarde `err.message` : composer une phrase à sa
    // place afficherait « Server Error » là où le serveur avait une raison.
    mocks.result = ok(MIEN)
    mocks.withdraw.mockRejectedValue({ data: { code: "invalidArgument", rule: "ALBUM_NOT_PUBLISHED" } })
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)

    fireEvent.click(screen.getByRole("button", { name: "Retirer cet album" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmer le retrait" }))
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Cet album n'est pas publié."),
    )
  })

  it("un album RETIRÉ n'offre plus de retrait", () => {
    mocks.result = ok({
      ...MIEN,
      album: { ...MIEN.album, status: "withdrawn" as const },
    })
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    expect(screen.getByText("Retiré")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Retirer cet album" })).toBeNull()
  })

  it("annuler le retrait conserve l’album et n’appelle aucune mutation", () => {
    mocks.result = ok(MIEN)
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    fireEvent.click(screen.getByRole("button", { name: "Retirer cet album" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.withdraw).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: MIEN.album.title })).toBeTruthy()
  })

  it.each(["draft", "published", "withdrawn"] as const)("ouvre le même album propriétaire pour édition (%s)", (status) => {
    mocks.result = ok({ ...MIEN, album: { ...MIEN.album, status } })
    const onEdit = vi.fn()
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" onEdit={onEdit} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier l’album" }))
    expect(onEdit).toHaveBeenCalledExactlyOnceWith("al-1")
    expect(mocks.withdraw).not.toHaveBeenCalled()
  })

  it.each([false, true])("aucune édition sans propriété ou capacité (%s)", (isOwner) => {
    mocks.result = ok({ ...MIEN, album: { ...MIEN.album, isOwner } })
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" canEdit={false} onEdit={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Modifier l’album" })).toBeNull()
  })

  it("empêche deux confirmations pendant le retrait et permet de reprendre après erreur", async () => {
    mocks.result = ok(MIEN)
    let reject!: (reason: unknown) => void
    mocks.withdraw.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    fireEvent.click(screen.getByRole("button", { name: "Retirer cet album" }))
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmer le retrait" })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(mocks.withdraw).toHaveBeenCalledOnce()
    reject(new Error("private server detail"))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Le retrait n'a pas abouti."))
    expect(screen.queryByText("private server detail")).toBeNull()
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmer le retrait" }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Album retiré."))
    expect(mocks.withdraw).toHaveBeenCalledTimes(2)
  })
})

describe("AlbumPage — signaler (MC-01)", () => {
  it("propose « Signaler » sur l'album publié d'autrui", () => {
    mocks.result = ok(DETAIL)
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    expect(screen.getByRole("button", { name: "Signaler" })).toBeTruthy()
  })

  it("ne le propose jamais à son propriétaire", () => {
    mocks.result = ok({ ...DETAIL, album: { ...DETAIL.album, isOwner: true } })
    renderWithEngine(<AlbumPage handle="awa" albumId="al-1" />)
    expect(screen.queryByRole("button", { name: "Signaler" })).toBeNull()
  })
})
