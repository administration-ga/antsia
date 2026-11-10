// Réécrit d'après socle/packages/agent-features/src/features/reseau-personnel/ProfilPagePage.tsx @ ad2e7fdc2 — ce qui change : test NEUF (le socle, sans environnement de montage, ne vérifiait que `profil-page.ts`) : la fiche montée dans l'enveloppe du moteur (`renderWithEngine`), références simulées de `pages.*`, `PostCard` et `PostComposer` (autres lots) remplacés par des doublures, cadre `ProfilFrame` simplifié ; vérifie le refus indistinct, l'attente et la panne, l'identité et le badge calculé, le suivi, le composeur réservé au rôle vivant, le mur chaîné et ses adresses, l'invitation à signer, la revendication, la gestion par un administrateur et le retrait d'un signataire.
// @vitest-environment jsdom

/**
 * ProfilPagePage — ce que seule une fiche MONTÉE prouve :
 *
 *  1. le refus est indistinct, l'attente n'est jamais un refus, une panne se dit ;
 *  2. l'identité affichée est celle de la PAGE, avec le badge que le serveur a calculé ;
 *  3. publier au nom de la page n'est offert qu'à un rôle VIVANT ;
 *  4. le mur se pagine par un geste, et ses liens mènent aux bonnes adresses
 *     (une mention à une PERSONNE, un mot-clé au fil filtré) ;
 *  5. les gestes passent par le réseau courant : suivre, accepter une
 *     invitation, revendiquer, gérer l'identité et les signataires.
 */
import { act, fireEvent, screen, within } from "@testing-library/react"
import type * as AntsiaUi from "@antsia/ui"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reseauAgentHref, reseauAgentTagHref } from "../../shell/reseau-agent-nav"
import { memoryRouter, renderWithEngine, TEST_NETWORK_ID, TEST_PERSON_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

type QueryState = {
  data: unknown
  isPending: boolean
  isFetching: boolean
  isError: boolean
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => {
  const query = (data: unknown) => ({ data, isPending: false, isFetching: false, isError: false, refetch: vi.fn() })
  return {
    query,
    getPage: query(undefined),
    invitations: query([]),
    signatories: query([]),
    claims: query({ page: [], isDone: true, continueCursor: "" }),
    /** Le mur, fenêtre par fenêtre : la clé est le curseur (`first` pour la première). */
    wall: new Map<string, ReturnType<typeof query>>(),
    wallCalls: [] as unknown[],
    mutations: new Map<string, ReturnType<typeof vi.fn>>(),
  }
})

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      pages: {
        pages: { getPage: "getPage", follow: "follow", unfollow: "unfollow", pagePosts: "pagePosts" },
        signatories: {
          myPageInvitations: "myPageInvitations",
          respondToPageInvitation: "respondToPageInvitation",
          listPageSignatories: "listPageSignatories",
          grantPageRole: "grantPageRole",
          revokePageRole: "revokePageRole",
        },
        claims: {
          paginateMyPageClaims: "paginateMyPageClaims",
          generateClaimEvidenceUploadUrl: "generateClaimEvidenceUploadUrl",
          requestPageClaim: "requestPageClaim",
          withdrawPageClaim: "withdrawPageClaim",
        },
        identity: {
          updatePageIdentity: "updatePageIdentity",
          generatePageImageUploadUrl: "generatePageImageUploadUrl",
          setPageImage: "setPageImage",
        },
      },
    },
  },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (name: string, args: { cursor?: { postId: string } }) => {
    if (name === "getPage") return mocks.getPage
    if (name === "myPageInvitations") return mocks.invitations
    if (name === "listPageSignatories") return mocks.signatories
    if (name === "paginateMyPageClaims") return mocks.claims
    if (name === "pagePosts") {
      mocks.wallCalls.push(args)
      return mocks.wall.get(args.cursor?.postId ?? "first") ?? mocks.query({ items: [], nextCursor: null })
    }
    throw new Error(`requête inattendue : ${name}`)
  },
}))

vi.mock("convex/react", () => ({
  useMutation: (name: string) => {
    let fn = mocks.mutations.get(name)
    if (fn === undefined) {
      fn = vi.fn()
      mocks.mutations.set(name, fn)
    }
    return fn
  },
}))

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

vi.mock("@antsia/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof AntsiaUi>()),
  SkeletonCard: () => <div data-testid="skeleton" />,
}))

vi.mock("./ProfilFrame", () => ({ ProfilFrame: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

vi.mock("./PostCard", () => ({
  PostCard: ({ post, onTag, onMention }: { post: { _id: string; body: string }; onTag?: (tag: string) => void; onMention?: (handle: string) => void }) => (
    <article data-testid="post" data-post-id={post._id}>
      {post.body}
      <button type="button" data-testid={`tag-${post._id}`} onClick={() => onTag?.("santé")} />
      <button type="button" data-testid={`mention-${post._id}`} onClick={() => onMention?.("awa.ndong")} />
    </article>
  ),
}))

vi.mock("./PostComposer", () => ({
  PostComposer: ({ asPage }: { asPage?: { pageId: string; displayName: string; avatarUrl: string | null } }) => (
    <div data-testid="composer" data-page-id={asPage?.pageId} data-display-name={asPage?.displayName} />
  ),
}))

import { toast } from "sonner"

import { ProfilPagePage } from "./ProfilPagePage"

const PAGE_ID = "pages_ambassade"

function pageDto(overrides: Record<string, unknown> = {}, viewer: Record<string, unknown> = {}) {
  return {
    pageId: PAGE_ID,
    networkId: TEST_NETWORK_ID,
    handle: "ambassade-ga",
    name: "Ambassade du Gabon",
    shortName: null,
    logoUrl: null,
    badge: "community",
    ownerKind: "association",
    country: null,
    description: null,
    bannerUrl: null,
    visibility: "network",
    followerCount: 0,
    postCount: 0,
    createdAt: 1,
    viewer: { following: false, role: null, ...viewer },
    ...overrides,
  }
}

function post(id: string, body: string) {
  return { _id: id, body }
}

function mutation(name: string): ReturnType<typeof vi.fn> {
  let fn = mocks.mutations.get(name)
  if (fn === undefined) {
    fn = vi.fn()
    mocks.mutations.set(name, fn)
  }
  return fn
}

function reset(state: QueryState, data: unknown) {
  state.data = data
  state.isPending = false
  state.isFetching = false
  state.isError = false
  state.refetch.mockReset()
}

beforeEach(() => {
  reset(mocks.getPage, pageDto())
  reset(mocks.invitations, [])
  reset(mocks.signatories, [])
  reset(mocks.claims, { page: [], isDone: true, continueCursor: "" })
  mocks.wall.clear()
  mocks.wallCalls.length = 0
  mocks.mutations.clear()
  vi.mocked(toast).mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ProfilPagePage — refus, attente, panne", () => {
  it("dit le refus INDISTINCT, et ramène au volet Pages", () => {
    mocks.getPage.data = null
    const router = memoryRouter()
    renderWithEngine(<ProfilPagePage handle="inconnue" />, { router: router.implementation })

    expect(screen.getByRole("heading", { name: "Cette page n'est pas accessible." })).toBeTruthy()
    const text = document.body.textContent?.toLowerCase() ?? ""
    for (const word of ["désactivée", "retirée", "n'existe pas", "supprimée"]) expect(text).not.toContain(word)

    fireEvent.click(screen.getByRole("button", { name: "Revenir aux pages" }))
    expect(router.calls).toContainEqual({ method: "push", href: reseauAgentHref("pages", "/fil") })
  })

  it("en vraie attente, un squelette — jamais le refus", () => {
    mocks.getPage.data = undefined
    mocks.getPage.isPending = true
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0)
    expect(screen.queryByText("Cette page n'est pas accessible.")).toBeNull()
  })

  it("une panne de la fiche se dit, avec Réessayer", () => {
    mocks.getPage.data = undefined
    mocks.getPage.isError = true
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)
    expect(screen.getByRole("alert").textContent).toContain("Page indisponible")
    expect(screen.queryByText("Cette page n'est pas accessible.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.getPage.refetch).toHaveBeenCalledTimes(1)
  })
})

describe("ProfilPagePage — l'identité de la PAGE", () => {
  it("montre son nom, son adresse, son sigle, sa nature, son pays et son badge CALCULÉ", () => {
    mocks.getPage.data = pageDto({ badge: "official", ownerKind: "institution", country: "GA", shortName: "AMB", followerCount: 4812, postCount: 0 })
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    expect(screen.getByRole("heading", { level: 1, name: "Ambassade du Gabon" })).toBeTruthy()
    expect(screen.getByText("Officiel")).toBeTruthy()
    expect(screen.getByText("@ambassade-ga · AMB")).toBeTruthy()
    expect(screen.getByText("Institution · Gabon")).toBeTruthy()
    // La bibliothèque de test ramène toute espace (dont l'insécable fine du français) à une espace simple.
    expect(screen.getByText(`${new Intl.NumberFormat("fr").format(4812).replace(/\s/gu, " ")} abonnés`)).toBeTruthy()
    expect(screen.getByText("Aucune publication")).toBeTruthy()
  })

  it("une page de la communauté le dit — jamais « officielle »", () => {
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)
    expect(screen.getByText("Communauté")).toBeTruthy()
    expect(screen.queryByText("Officiel")).toBeNull()
  })
})

describe("ProfilPagePage — suivre", () => {
  it("suit par l'adresse et cesse de suivre par l'identifiant, dans le réseau courant", async () => {
    mutation("follow").mockResolvedValue({ pageId: PAGE_ID, following: true })
    const view = renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Suivre" }))
    })
    expect(mutation("follow")).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, handle: "ambassade-ga" })
    expect(toast.success).toHaveBeenCalledWith("Abonnement pris.")

    mocks.getPage.data = pageDto({}, { following: true })
    view.rerender(<ProfilPagePage handle="ambassade-ga" />)
    const followed = screen.getByRole("button", { name: "Suivi" })
    expect(followed.getAttribute("aria-pressed")).toBe("true")
    mutation("unfollow").mockResolvedValue({ following: false })
    await act(async () => {
      fireEvent.click(followed)
    })
    expect(mutation("unfollow")).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, pageId: PAGE_ID })
  })

  it("dit un refus par son CODE", async () => {
    mutation("follow").mockRejectedValue({ data: { code: "rateLimited" } })
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Suivre" }))
    })
    expect(toast.error).toHaveBeenCalledWith("Trop de tentatives. Réessayez dans quelques instants.")
  })
})

describe("ProfilPagePage — publier au nom de la page", () => {
  it("n'offre le composeur qu'à un rôle VIVANT, et dit le mur vide selon qui regarde", () => {
    const view = renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)
    expect(screen.queryByTestId("composer")).toBeNull()
    expect(screen.getByText("Cette page n'a encore rien publié.")).toBeTruthy()

    mocks.getPage.data = pageDto({}, { role: "signatory" })
    view.rerender(<ProfilPagePage handle="ambassade-ga" />)
    const composer = screen.getByTestId("composer")
    expect(composer.getAttribute("data-page-id")).toBe(PAGE_ID)
    expect(composer.getAttribute("data-display-name")).toBe("Ambassade du Gabon")
    expect(screen.getByText(/Vous pouvez publier en son nom ci-dessus/)).toBeTruthy()
    expect(screen.getByText("Vous signez pour cette page : vous publiez en son nom.")).toBeTruthy()
  })
})

describe("ProfilPagePage — le mur", () => {
  it("rend les publications par PostCard et charge la fenêtre suivante sur GESTE", () => {
    mocks.wall.set("first", mocks.query({ items: [post("p1", "Premier communiqué"), post("p2", "Deuxième communiqué")], nextCursor: { publishedAt: 2, postId: "p2" } }))
    mocks.wall.set("p2", mocks.query({ items: [post("p3", "Troisième communiqué")], nextCursor: null }))
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    expect(screen.getAllByTestId("post")).toHaveLength(2)
    expect(mocks.wallCalls[0]).toEqual({ networkId: TEST_NETWORK_ID, handle: "ambassade-ga" })
    fireEvent.click(screen.getByRole("button", { name: "Voir plus de publications" }))

    expect(screen.getAllByTestId("post")).toHaveLength(3)
    expect(mocks.wallCalls).toContainEqual({ networkId: TEST_NETWORK_ID, handle: "ambassade-ga", cursor: { publishedAt: 2, postId: "p2" } })
    expect(screen.queryByRole("button", { name: "Voir plus de publications" })).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("20 publications de plus.")
  })

  it("mène une mention au PROFIL d'une personne, un mot-clé au fil filtré", () => {
    mocks.wall.set("first", mocks.query({ items: [post("p1", "Avec @awa.ndong #santé")], nextCursor: null }))
    const router = memoryRouter()
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />, { router: router.implementation })

    fireEvent.click(screen.getByTestId("mention-p1"))
    fireEvent.click(screen.getByTestId("tag-p1"))
    expect(router.calls).toEqual([
      { method: "push", href: TEST_ROUTES.profile("awa.ndong") },
      { method: "push", href: reseauAgentTagHref("santé", "/fil") },
    ])
  })

  it("une panne du mur se dit — jamais « rien publié »", () => {
    const failed = mocks.query(undefined)
    failed.isError = true
    mocks.wall.set("first", failed)
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    expect(screen.getByRole("alert").textContent).toContain("Publications indisponibles")
    expect(screen.queryByText("Cette page n'a encore rien publié.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(failed.refetch).toHaveBeenCalledTimes(1)
  })
})

describe("ProfilPagePage — invitation à signer", () => {
  it("s'accepte depuis la fiche, dans le réseau courant", async () => {
    mocks.invitations.data = [{ page: { pageId: PAGE_ID, handle: "ambassade-ga", name: "Ambassade du Gabon" }, role: "signatory", invitedAt: 1 }]
    mutation("respondToPageInvitation").mockResolvedValue({ role: "signatory" })
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    const invitation = screen.getByRole("region", { name: "Invitation à signer pour cette page" })
    expect(within(invitation).getByText(/rôle : Signataire/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(invitation).getByRole("button", { name: "Accepter" }))
    })
    expect(mutation("respondToPageInvitation")).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, pageId: PAGE_ID, accept: true })
  })
})

describe("ProfilPagePage — revendiquer", () => {
  it("une page Officiel ou Vérifié ne se revendique pas", () => {
    mocks.getPage.data = pageDto({ badge: "official", ownerKind: "institution" })
    const view = renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)
    expect(screen.queryByRole("button", { name: "Revendiquer cette page" })).toBeNull()
    mocks.getPage.data = pageDto({ badge: "verified" })
    view.rerender(<ProfilPagePage handle="ambassade-ga" />)
    expect(screen.queryByRole("button", { name: "Revendiquer cette page" })).toBeNull()
  })

  it("exige des pièces avant tout envoi, puis dépose et envoie la demande", async () => {
    mutation("generateClaimEvidenceUploadUrl").mockResolvedValue("upload-url-1")
    mutation("requestPageClaim").mockResolvedValue({ claimId: "claims_1" })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ storageId: "storage_1" }) })
    vi.stubGlobal("fetch", fetchMock)
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    fireEvent.click(screen.getByRole("button", { name: "Revendiquer cette page" }))
    const section = screen.getByRole("region", { name: "Revendiquer cette page" })
    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: "Envoyer la demande" }))
    })
    expect(within(section).getByRole("alert").textContent).toContain("Joignez entre une et 5 pièces")
    expect(mutation("requestPageClaim")).not.toHaveBeenCalled()

    const file = new File(["statuts"], "statuts.pdf", { type: "application/pdf" })
    fireEvent.change(within(section).getByLabelText("Pièces justificatives"), { target: { files: [file] } })
    expect(within(section).getByText("1 pièce sélectionnée")).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: "Envoyer la demande" }))
    })
    expect(fetchMock).toHaveBeenCalledWith("upload-url-1", expect.objectContaining({ method: "POST", body: file }))
    expect(mutation("requestPageClaim")).toHaveBeenCalledWith({
      networkId: TEST_NETWORK_ID,
      pageId: PAGE_ID,
      evidence: [{ storageId: "storage_1", mimeType: "application/pdf" }],
    })
    expect(toast.success).toHaveBeenCalledWith("Demande envoyée à la modération du réseau.")
  })

  it("une demande EN ATTENTE ferme le formulaire et se retire", async () => {
    mocks.claims.data = {
      page: [{ claimId: "claims_1", page: { pageId: PAGE_ID }, status: "pending", createdAt: Date.UTC(2026, 9, 1), decisionReason: null }],
      isDone: true,
      continueCursor: "",
    }
    mutation("withdrawPageClaim").mockResolvedValue({ withdrawn: true })
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    fireEvent.click(screen.getByRole("button", { name: "Revendiquer cette page" }))
    const section = screen.getByRole("region", { name: "Revendiquer cette page" })
    expect(within(section).getByText(/en cours d'examen/)).toBeTruthy()
    expect(within(section).queryByRole("button", { name: "Envoyer la demande" })).toBeNull()
    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: "Retirer ma demande" }))
    })
    expect(mutation("withdrawPageClaim")).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, claimId: "claims_1" })
  })
})

describe("ProfilPagePage — gérer la page (administrateur vivant)", () => {
  const signatories = [
    { personId: TEST_PERSON_ID, handle: "moi", displayName: "Moi", avatarUrl: null, role: "admin", accepted: true, since: 1 },
    { personId: "persons_awa", handle: "awa.ndong", displayName: "Awa Ndong", avatarUrl: null, role: "signatory", accepted: true, since: 2 },
  ]

  it("modifie l'identité (seuls les champs changés partent), invite, retire, et demande la vérification", async () => {
    mocks.getPage.data = pageDto({}, { role: "admin" })
    mocks.signatories.data = signatories
    mutation("updatePageIdentity").mockResolvedValue({ changed: true })
    mutation("grantPageRole").mockResolvedValue({ personId: "persons_eli", role: "signatory", invited: true })
    mutation("revokePageRole").mockResolvedValue({ revoked: true })
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    fireEvent.click(screen.getByRole("button", { name: "Gérer la page" }))
    const management = screen.getByRole("region", { name: "Gestion de la page" })

    const identity = within(management).getByRole("form", { name: "Identité de la page" })
    fireEvent.change(within(identity).getByLabelText(/^Nom/), { target: { value: "Ambassade de la République gabonaise" } })
    await act(async () => {
      fireEvent.click(within(identity).getByRole("button", { name: "Enregistrer" }))
    })
    expect(mutation("updatePageIdentity")).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, pageId: PAGE_ID, name: "Ambassade de la République gabonaise" })

    const team = within(management).getByRole("region", { name: "Signataires" })
    expect(within(team).getByText("Moi (Vous)")).toBeTruthy()
    const invite = within(team).getByRole("form", { name: "Inviter un signataire" })
    fireEvent.change(within(invite).getByLabelText("Identifiant de la personne"), { target: { value: " @eli.obame " } })
    await act(async () => {
      fireEvent.click(within(invite).getByRole("button", { name: "Inviter" }))
    })
    expect(mutation("grantPageRole")).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, pageId: PAGE_ID, handle: "eli.obame", role: "signatory" })
    expect(toast.success).toHaveBeenCalledWith("Invitation envoyée : la personne doit l'accepter.")

    await act(async () => {
      fireEvent.click(within(team).getByRole("button", { name: "Retirer Awa Ndong des signataires" }))
    })
    expect(mutation("revokePageRole")).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, pageId: PAGE_ID, personId: "persons_awa" })

    // Une page de la communauté : son administrateur en demande la vérification.
    expect(within(management).getByRole("region", { name: "Demander la vérification" })).toBeTruthy()
  })

  it("refuse une image hors de la liste blanche AVANT tout dépôt", () => {
    mocks.getPage.data = pageDto({}, { role: "admin" })
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)
    fireEvent.click(screen.getByRole("button", { name: "Gérer la page" }))

    const pdf = new File(["x"], "logo.pdf", { type: "application/pdf" })
    fireEvent.change(screen.getByLabelText("Choisir un logo"), { target: { files: [pdf] } })
    expect(screen.getByRole("alert").textContent).toContain("Ce type de fichier n'est pas accepté ici.")
    expect(mutation("generatePageImageUploadUrl")).not.toHaveBeenCalled()
  })

  it("un simple signataire voit l'équipe, sans la gérer, et peut se retirer", async () => {
    mocks.getPage.data = pageDto({}, { role: "signatory" })
    mocks.signatories.data = [
      { ...signatories[0], personId: "persons_chef", handle: "chef", displayName: "Chef" },
      { ...signatories[1], personId: TEST_PERSON_ID },
    ]
    mutation("revokePageRole").mockResolvedValue({ revoked: true })
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" />)

    expect(screen.queryByRole("button", { name: "Gérer la page" })).toBeNull()
    const team = screen.getByRole("region", { name: "Signataires" })
    expect(within(team).queryByRole("form", { name: "Inviter un signataire" })).toBeNull()
    expect(within(team).queryByRole("button", { name: /^Retirer / })).toBeNull()
    await act(async () => {
      fireEvent.click(within(team).getByRole("button", { name: "Ne plus signer pour cette page" }))
    })
    expect(mutation("revokePageRole")).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, pageId: PAGE_ID, personId: TEST_PERSON_ID })
    expect(toast.success).toHaveBeenCalledWith("Vous ne signez plus pour cette page.")
  })
})

describe("ProfilPagePage — la présentation marchande que l'application lui donne", () => {
  it("présentée comme sa boutique : l'en-tête de l'application remplace l'identité, gérer reste, la vitrine précède le mur", () => {
    mocks.getPage.data = pageDto({ ownerKind: "company" }, { role: "admin" })
    mocks.wall.set("first", mocks.query({ items: [post("p1", "Arrivage du jour")], nextCursor: null }))
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" commerce={{ presentation: "shop", hero: <h1>Boutique des rives</h1>, lead: <section data-testid="vitrine" /> }} />)

    expect(screen.getAllByRole("heading", { level: 1 }).map((node) => node.textContent)).toEqual(["Boutique des rives"])
    // L'abonnement est celui de l'en-tête de la boutique : la fiche n'en ajoute pas un second.
    expect(screen.queryByRole("button", { name: "Suivre" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Gérer la page" }))
    expect(screen.getByRole("button", { name: "Fermer la gestion" })).toBeTruthy()
    expect(screen.getByTestId("vitrine").compareDocumentPosition(screen.getByTestId("post")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("ses produits en tête : l'identité de la page reste, l'application s'insère toutes les trois publications", () => {
    mocks.wall.set("first", mocks.query({ items: ["1", "2", "3", "4", "5", "6", "7"].map((id) => post(`p${id}`, `Publication ${id}`)), nextCursor: null }))
    renderWithEngine(<ProfilPagePage handle="ambassade-ga" commerce={{ presentation: "products", lead: <section data-testid="produits" />, interleave: (rank) => <aside data-testid="insertion" data-rank={rank} /> }} />)

    expect(screen.getAllByRole("heading", { level: 1 }).map((node) => node.textContent)).toEqual(["Ambassade du Gabon"])
    expect(screen.getByRole("button", { name: "Suivre" })).toBeTruthy()
    expect(screen.getByTestId("produits").compareDocumentPosition(screen.getAllByTestId("post")[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const insertions = screen.getAllByTestId("insertion")
    expect(insertions.map((node) => node.getAttribute("data-rank"))).toEqual(["1", "2"])
    // Chaque insertion suit la troisième publication de son groupe.
    expect(insertions.map((node) => node.previousElementSibling?.getAttribute("data-post-id"))).toEqual(["p3", "p6"])
  })
})
