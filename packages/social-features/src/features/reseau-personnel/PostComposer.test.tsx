// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/PostComposer.test.tsx @ ad2e7fdc2 — adaptations : composeur monté dans l'enveloppe du moteur (`renderWithEngine` : i18n française, réseau et personne de test) ; fonctions du moteur simulées (`posts.posts.publish`, `pages.pages.publishAsPage`, `media.media.generateUploadUrl`) — plus de lecture du profil : l'auteur du brouillon est la personne du réseau ; le brouillon « relu d'une session précédente » est écrit sous la clé du réseau ET de la personne (`configurePostDraftStorage`, `setScope`) ; les six cas du socle portés ; cas ajoutés : chaque appel porte le réseau et le dépôt l'usage `media_social`, publication au nom d'une page (audiences `public` / `followers`), publication dans un groupe, persistance sous la clé du réseau et de la personne ; FP-01 : les photos passent par la préparation (module `features/media-upload`, décodeur et canvas simulés), et cas ajoutés — l'octet téléversé est celui du module, jamais l'original ; un échec est dit et rien n'entre ; le poids est annoncé ; « Publier » attend la préparation ; une vidéo et un fichier refusé par les règles ne sont pas préparés ; une image non préparée est refusée par le brouillon.
// @vitest-environment jsdom

/**
 * PostComposer — le brouillon DURABLE (R-12), monté.
 *
 * Le défaut d'origine ne se voit qu'en montant puis DÉMONTANT le composant :
 * texte, médias, téléversements réussis et clé d'idempotence vivaient dans
 * quatre `useState` que la fermeture de la feuille, la bascule 959→960 ou une
 * navigation effaçaient. Ces quatre scénarios sont ceux de la réception du
 * lot :
 *
 *  1. saisie + deux médias → démontage/remontage → tout est là ;
 *  2. publication en échec → le second envoi porte la MÊME clé d'idempotence ;
 *  3. téléversement réussi puis publication en échec → `generateUploadUrl`
 *     n'est appelé qu'UNE fois au total (aucun blob orphelin de plus) ;
 *  4. succès → brouillon vidé, clé neuve, `onPublished` appelé.
 */

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { listImageMetadata } from "@antsia/social-domain/imageMetadata"

import { renderWithEngine, TEST_NETWORK_ID, TEST_PERSON_ID } from "../../tests/engine-wrapper"
import { TEST_PNG_BYTES, testPrepareImage } from "../../tests/image-runtime"
import { isPreparedImage, type PrepareImage } from "../media-upload"
import {
  prepareVideoForUpload,
  type PrepareVideo,
  type VideoPreparation,
  type VideoRuntime,
} from "../video-upload/video-preparation"

/** SD-03 : une vidéo déjà lisible partout — la préparation la rend telle quelle. */
const readyAsChosen: PrepareVideo = async (file) => ({ status: "ready", file, durationMs: 12_401, converted: false })

/** Le préfixe de stockage du réseau de test (`NetworkProvider`, slug `test`). */
const PREFIXE = "antsia:test:"

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  publishAsPage: vi.fn(),
  generateUploadUrl: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      posts: { posts: { publish: "publish" } },
      media: { media: { generateUploadUrl: "generateUploadUrl" } },
      pages: { pages: { publishAsPage: "publishAsPage" } },
    },
  },
}))

vi.mock("convex/react", () => ({
  useMutation: (reference: string) => {
    if (reference === "publish") return mocks.publish
    if (reference === "publishAsPage") return mocks.publishAsPage
    return mocks.generateUploadUrl
  },
}))

vi.mock("sonner", () => ({ toast: mocks.toast }))

vi.mock("@antsia/ui", () => ({
  Alert: ({ children }: { children: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
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
  Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} />
  ),
  TextArea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
  TextInput: (props: InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}))

import { postDraftKey } from "./post-draft"
import { NetworkProvider } from "@antsia/api/network"
import { TEST_ROUTES } from "../../tests/engine-wrapper"
import { configurePostDraftStorage, postDraftStorageKey, postDraftStore, usePostDraft } from "./post-draft-store"
import { PostComposer } from "./PostComposer"

const render = renderWithEngine

const FEED = postDraftKey({ kind: "feed" })

/** Un lecteur de brouillon monté à côté du composeur : il SURVIT au démontage
 *  du composeur, donc il prouve ce que le magasin retient. */
function DraftProbe() {
  const draft = usePostDraft(FEED, "sonde")
  return (
    <output data-testid="probe">
      {JSON.stringify({
        body: draft.body,
        key: draft.idempotencyKey,
        media: draft.media.map((m) => ({ id: m.localId, upload: m.upload.status })),
      })}
    </output>
  )
}

function lireSonde() {
  return JSON.parse(screen.getByTestId("probe").textContent ?? "{}") as {
    body: string
    key: string
    media: { id: string; upload: string }[]
  }
}

/** La zone de saisie du composeur — nommée par son étiquette `sr-only`. */
function zoneDeTexte(): HTMLTextAreaElement {
  const node = document.getElementById("reseau-composer")
  if (node === null) throw new Error("La zone de saisie du composeur est absente.")
  return node as HTMLTextAreaElement
}

function image(name: string): File {
  return { name, size: 1024, type: "image/png" } as File
}

/** La préparation réelle du module, sur un décodeur et un canvas simulés. */
let prepare = testPrepareImage()

function choisirMedias(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) throw new Error("Le sélecteur de fichiers est absent.")
  Object.defineProperty(input, "files", { value: files, configurable: true })
  fireEvent.change(input)
}

beforeEach(() => {
  prepare = testPrepareImage()
  postDraftStore.resetForTests()
  window.sessionStorage.clear()
  mocks.publish.mockReset().mockResolvedValue({ postId: "p1" })
  mocks.publishAsPage.mockReset().mockResolvedValue({ postId: "p1" })
  mocks.generateUploadUrl.mockReset().mockResolvedValue("adresse-de-depot-1")
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  let compteur = 0
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ storageId: `storage-${++compteur}` }),
  })))
  vi.stubGlobal("URL", {
    createObjectURL: (file: File) => `blob:${file.name}`,
    revokeObjectURL: () => undefined,
  })
})

describe("PA8 — publication accessible sans compte par geste explicite", () => {
  it("le changement d'audience vers le public n'est pas un consentement, le geste seul est transmis", async () => {
    render(<PostComposer prepareImage={prepare} />)
    fireEvent.change(zoneDeTexte(), { target: { value: "Choix explicite" } })
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "public" } })
    const publicChoice = screen.getByRole("checkbox") as HTMLInputElement
    expect(publicChoice.checked).toBe(false)
    fireEvent.click(publicChoice)
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.publish.mock.calls[0]?.[0]).toMatchObject({ audience: "public", alsoOnRoot: true, body: "Choix explicite" })
  })
  it("un aller-retour par Connexions révoque le choix public du brouillon", async () => {
    render(<PostComposer prepareImage={prepare} />)
    const audience = screen.getByRole("combobox")
    fireEvent.change(audience, { target: { value: "public" } })
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.change(audience, { target: { value: "connections" } })
    expect(screen.queryByRole("checkbox")).toBeNull()
    fireEvent.change(audience, { target: { value: "public" } })
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
    fireEvent.change(zoneDeTexte(), { target: { value: "Réservé aux membres" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.publish.mock.calls[0]?.[0]).not.toHaveProperty("alsoOnRoot")
  })
  it("la province du contenu est facultative et volontaire, pas déduite du profil", async () => {
    render(<NetworkProvider networkId={TEST_NETWORK_ID} personId={TEST_PERSON_ID} slug="antsia" charte="antsia" routes={TEST_ROUTES}><PostComposer prepareImage={prepare} /></NetworkProvider>)
    const province = screen.getByRole("combobox", { name: /Province du contenu/ }) as HTMLSelectElement
    expect(province.value).toBe("")
    fireEvent.change(province, { target: { value: "nyanga" } })
    fireEvent.change(zoneDeTexte(), { target: { value: "Rencontre dans la Nyanga" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.publish.mock.calls[0]?.[0]).toMatchObject({ province: "nyanga", audience: "connections" })
    expect(mocks.publish.mock.calls[0]?.[0]).not.toHaveProperty("alsoOnRoot")
  })
  it("une page native racine possède son propre choix explicite, une page enfant conserve sa règle", async () => {
    const page = { pageId: "pages_public" as never, displayName: "Page de recette", avatarUrl: null }
    const { unmount } = render(<PostComposer asPage={page} />)
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.getByText("La diffusion suit les réglages de cette page.")).toBeTruthy()
    unmount()
    render(<NetworkProvider networkId={TEST_NETWORK_ID} personId={TEST_PERSON_ID} slug="antsia" charte="antsia" routes={TEST_ROUTES}><PostComposer asPage={page} /></NetworkProvider>)
    expect((screen.getByRole("checkbox", { name: "Accessible sans compte" }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole("checkbox", { name: "Accessible sans compte" }))
    fireEvent.change(zoneDeTexte(), { target: { value: "Communication publique choisie" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier en tant que Page de recette" }))
    await waitFor(() => expect(mocks.publishAsPage).toHaveBeenCalledTimes(1))
    expect(mocks.publishAsPage.mock.calls[0]?.[0]).toMatchObject({ pageId: "pages_public", audience: "public", alsoOnRoot: true })
  })
})

describe("FD-04 — le toast dit l'état de modération RENDU par le moteur", () => {
  it("retenue en relecture : « En relecture », jamais « Publication en ligne » ; publiée : « Publication en ligne »", async () => {
    mocks.publish.mockResolvedValueOnce({ postId: "p1", created: true, moderation: "pending_review" })
    render(<PostComposer prepareImage={prepare} />)
    fireEvent.change(zoneDeTexte(), { target: { value: "Un texte retenu" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledTimes(1))
    expect(mocks.toast.success).toHaveBeenCalledWith("En relecture : visible de vous seul pour l'instant.")
    mocks.publish.mockResolvedValueOnce({ postId: "p2", created: true, moderation: "published" })
    fireEvent.change(zoneDeTexte(), { target: { value: "Un texte publié" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledTimes(2))
    expect(mocks.toast.success).toHaveBeenLastCalledWith("Publication en ligne.")
  })

  it("au nom d'une page, l'état rendu par `publishAsPage` décide aussi du toast", async () => {
    mocks.publishAsPage.mockResolvedValueOnce({ postId: "p1", created: true, moderation: "pending_review" })
    render(<PostComposer asPage={{ pageId: "pages_public" as never, displayName: "Page de recette", avatarUrl: null }} />)
    fireEvent.change(zoneDeTexte(), { target: { value: "Annonce retenue" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier en tant que Page de recette" }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("En relecture : visible de vous seul pour l'instant."))
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  postDraftStore.resetForTests()
})

describe("le brouillon survit au démontage (R-12)", () => {
  it("garde texte ET médias d'un montage à l'autre", async () => {
    const premier = render(
      <>
        <PostComposer prepareImage={prepare} />
        <DraftProbe />
      </>,
    )

    fireEvent.change(zoneDeTexte(), {
      target: { value: "Revue des archives lundi" },
    })
    choisirMedias([image("a.png"), image("b.png")])

    await waitFor(() => expect(lireSonde().media).toHaveLength(2))
    const cleAvant = lireSonde().key

    // Le démontage EST le défaut : fermeture de la feuille, bascule 959→960,
    // navigation — tous produisent exactement ceci.
    premier.unmount()

    render(
      <>
        <PostComposer prepareImage={prepare} />
        <DraftProbe />
      </>,
    )

    const apres = lireSonde()
    expect(apres.body).toBe("Revue des archives lundi")
    expect(apres.media).toHaveLength(2)
    expect(apres.key).toBe(cleAvant)
    // Le texte est réellement à l'écran, pas seulement en mémoire.
    expect(
      screen.getByDisplayValue("Revue des archives lundi"),
    ).toBeTruthy()
  })

  it("sépare les brouillons par CIBLE", async () => {
    render(
      <>
        <PostComposer prepareImage={prepare} />
        <DraftProbe />
      </>,
    )
    fireEvent.change(zoneDeTexte(), {
      target: { value: "Pour le fil" },
    })
    await waitFor(() => expect(lireSonde().body).toBe("Pour le fil"))
    cleanup()

    render(
      <>
        <PostComposer
          group={{ groupId: "g1" as never, name: "Archivistes" }}
        />
        <DraftProbe />
      </>,
    )
    // Le composeur de groupe part VIERGE : le texte du fil n'y fuit pas.
    expect(screen.queryByDisplayValue("Pour le fil")).toBeNull()
    expect(lireSonde().body).toBe("Pour le fil")
  })
})

describe("l'envoi — idempotence et reprise sans doublon", () => {
  it("renvoie la MÊME clé après un échec de publication", async () => {
    mocks.publish.mockRejectedValueOnce(new Error("réseau"))
    render(<PostComposer prepareImage={prepare} />)
    fireEvent.change(zoneDeTexte(), {
      target: { value: "Essai" },
    })

    const publier = screen.getByRole("button", { name: "Publier" })
    fireEvent.click(publier)
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())

    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(2))

    const premiere = mocks.publish.mock.calls[0]?.[0] as { idempotencyKey: string }
    const seconde = mocks.publish.mock.calls[1]?.[0] as { idempotencyKey: string }
    expect(seconde.idempotencyKey).toBe(premiere.idempotencyKey)
  })

  it("ne re-téléverse PAS un média déjà au stockage", async () => {
    mocks.publish.mockRejectedValueOnce(new Error("réseau"))
    render(
      <>
        <PostComposer prepareImage={prepare} />
        <DraftProbe />
      </>,
    )
    fireEvent.change(zoneDeTexte(), {
      target: { value: "Avec média" },
    })
    choisirMedias([image("a.png")])
    await waitFor(() => expect(lireSonde().media).toHaveLength(1))

    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    // Le téléversement a réussi : il est MÉMORISÉ, même si la publication
    // vient d'échouer.
    await waitFor(() => expect(lireSonde().media[0]?.upload).toBe("uploaded"))
    expect(mocks.generateUploadUrl).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(2))

    // ⚠️ LE défaut d'origine : chaque renvoi refaisait l'octet, et laissait un
    // blob que rien ne purge.
    expect(mocks.generateUploadUrl).toHaveBeenCalledTimes(1)
    const seconde = mocks.publish.mock.calls[1]?.[0] as {
      media?: { storageId: string }[]
    }
    expect(seconde.media?.[0]?.storageId).toBe("storage-1")
  })

  it("vide le brouillon et renouvelle la clé au SEUL succès", async () => {
    const onPublished = vi.fn()
    render(
      <>
        <PostComposer onPublished={onPublished} prepareImage={prepare} />
        <DraftProbe />
      </>,
    )
    fireEvent.change(zoneDeTexte(), {
      target: { value: "Publiée" },
    })
    await waitFor(() => expect(lireSonde().body).toBe("Publiée"))
    const cleAvant = lireSonde().key

    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1))

    const apres = lireSonde()
    expect(apres.body).toBe("")
    expect(apres.media).toEqual([])
    expect(apres.key).not.toBe(cleAvant)
    expect(mocks.toast.success).toHaveBeenCalled()
  })
})

describe("un média irrécupérable est ANNONCÉ, jamais présenté comme sauvegardé", () => {
  it("le nomme, et refuse l'envoi tant qu'il est là", async () => {
    // Un brouillon écrit, PERSISTÉ, puis relu dans une nouvelle session : ses
    // métadonnées reviennent du stockage, son `File` non — c'est exactement ce
    // que produit un rechargement de page.
    configurePostDraftStorage(PREFIXE)
    postDraftStore.setScope(TEST_PERSON_ID)
    postDraftStore.setBody(FEED, "Texte repris")
    postDraftStore.addMedia(FEED, [
      {
        meta: {
          localId: "perdu",
          kind: "image",
          altText: "",
          fileName: "chantier.png",
          mimeType: "image/png",
          sizeBytes: 2048,
          upload: { status: "pending" },
        },
        file: image("chantier.png"),
        previewUrl: "blob:chantier",
      },
    ])
    postDraftStore.resetForTests() // mémoire ET registre vidés, stockage gardé
    configurePostDraftStorage(PREFIXE)
    postDraftStore.setScope(TEST_PERSON_ID)

    render(<PostComposer prepareImage={prepare} />)

    expect(screen.getByDisplayValue("Texte repris")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("chantier.png")
    expect(screen.getByRole("alert").textContent).toContain("resélectionner")
    // Pas d'aperçu mort : une PLACE, et le nom.
    expect(document.querySelector("img")).toBeNull()
    // Et surtout : on ne publie pas une pièce qu'on n'a plus.
    expect(
      screen.getByRole("button", { name: "Publier" }).hasAttribute("disabled"),
    ).toBe(true)

    // Retirer la pièce perdue rend l'envoi possible.
    fireEvent.click(screen.getByRole("button", { name: "Retirer chantier.png" }))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Publier" }).hasAttribute("disabled"),
      ).toBe(false),
    )
  })
})

describe("le moteur — réseau, garde des fichiers, lieux de publication", () => {
  it("publie DANS le réseau courant, et dépose par la garde des fichiers", async () => {
    render(<PostComposer prepareImage={prepare} />)
    fireEvent.change(zoneDeTexte(), { target: { value: "  Bonjour le réseau  " } })
    choisirMedias([image("a.png")])
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer a.png" })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.generateUploadUrl).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, usage: "media_social" })
    const appel = mocks.publish.mock.calls[0]?.[0] as Record<string, unknown>
    expect(appel).toMatchObject({
      networkId: TEST_NETWORK_ID,
      body: "Bonjour le réseau",
      audience: "connections",
      // Le fichier PRÉPARÉ, tel que le module l'a rendu (PNG gardé PNG).
      media: [{ storageId: "storage-1", kind: "image", mimeType: "image/png", sizeBytes: TEST_PNG_BYTES.length }],
    })
    expect(typeof appel.idempotencyKey).toBe("string")
  })

  it("persiste le brouillon sous la clé du réseau ET de la personne", async () => {
    render(<PostComposer prepareImage={prepare} />)
    fireEvent.change(zoneDeTexte(), { target: { value: "À reprendre" } })
    await waitFor(() =>
      expect(window.sessionStorage.getItem(postDraftStorageKey(PREFIXE, TEST_PERSON_ID))).toContain("À reprendre")
    )
  })

  it("publie AU NOM d'une page, avec ses deux audiences", async () => {
    render(
      <PostComposer asPage={{ pageId: "pages_1" as never, displayName: "Association X", avatarUrl: null }} />
    )
    expect(screen.getByText("Publier en tant que Association X", { selector: "label" })).toBeTruthy()
    const audiences = screen.getByRole("combobox")
    expect([...(audiences as HTMLSelectElement).options].map((option) => option.textContent)).toEqual([
      "Tout le réseau",
      "Abonnés de la page",
    ])
    fireEvent.change(audiences, { target: { value: "followers" } })
    fireEvent.change(zoneDeTexte(), { target: { value: "Note aux abonnés" } })

    fireEvent.click(screen.getByRole("button", { name: "Publier en tant que Association X" }))
    await waitFor(() => expect(mocks.publishAsPage).toHaveBeenCalledTimes(1))
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.publishAsPage.mock.calls[0]?.[0]).toMatchObject({
      networkId: TEST_NETWORK_ID,
      pageId: "pages_1",
      body: "Note aux abonnés",
      audience: "followers",
    })
  })

  it("publie DANS un groupe, l'audience venant du lieu", async () => {
    render(<PostComposer group={{ groupId: "groups_1" as never, name: "Archivistes" }} />)
    expect(screen.getByText("Visible des membres du groupe uniquement.")).toBeTruthy()
    expect(screen.queryByRole("combobox")).toBeNull()
    fireEvent.change(zoneDeTexte(), { target: { value: "Au groupe" } })

    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.publish.mock.calls[0]?.[0]).toMatchObject({
      networkId: TEST_NETWORK_ID,
      body: "Au groupe",
      audience: "group",
      groupId: "groups_1",
    })
  })

  it("dit le refus du moteur par son code, jamais par le message brut", async () => {
    mocks.publish.mockRejectedValueOnce({ data: { code: "rateLimited" } })
    render(<PostComposer prepareImage={prepare} />)
    fireEvent.change(zoneDeTexte(), { target: { value: "Trop vite" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Trop de tentatives. Réessayez dans quelques instants.")
    )
  })
})

describe("FP-01 — chaque photo est préparée avant le téléversement", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => { resolve = done })
    return { promise, resolve }
  }

  it("l'octet téléversé est celui du module — réduit, sans métadonnées —, jamais le fichier choisi", async () => {
    const original = image("chantier.png")
    render(<PostComposer prepareImage={prepare} />)
    choisirMedias([original])
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer chantier.png" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))

    const [, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit]
    const sent = init.body as File
    expect(sent).not.toBe(original)
    expect(isPreparedImage(sent)).toBe(true)
    expect(init.headers).toEqual({ "Content-Type": "image/png" })
    expect(listImageMetadata(new Uint8Array(await sent.arrayBuffer()), "image/png")).toEqual([])
    expect(prepare.runtime.canvases).toEqual([{ width: 2048, height: 1536 }])
  })

  it("annonce le poids envoyé, accordé au nombre de photos", async () => {
    render(<PostComposer prepareImage={prepare} />)
    choisirMedias([image("a.png"), image("b.png")])
    const notice = await screen.findByText(/^2 photos prêtes à l'envoi/)
    expect(notice.textContent).toMatch(/2[\s\u00a0\u202f]ko → \d+[\s\u00a0\u202f]ko, sans leurs informations cachées \(lieu, appareil\)\.$/)
  })

  it("un échec de préparation est DIT, la photo n'entre pas au brouillon, et rien n'est téléversé", async () => {
    render(
      <>
        <PostComposer prepareImage={testPrepareImage({ canvas: "absent" })} />
        <DraftProbe />
      </>,
    )
    fireEvent.change(zoneDeTexte(), { target: { value: "Texte seul" } })
    choisirMedias([image("a.png")])
    expect(await screen.findByText(/Ce navigateur ne peut pas préparer « a\.png »/)).toBeTruthy()
    expect(lireSonde().media).toEqual([])
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.publish.mock.calls[0]?.[0]).not.toHaveProperty("media")
  })

  it("« Publier » et le choix de fichiers attendent la fin de la préparation", async () => {
    const pending = deferred<Awaited<ReturnType<PrepareImage>>>()
    const slow = vi.fn(() => pending.promise)
    render(<PostComposer prepareImage={slow} />)
    fireEvent.change(zoneDeTexte(), { target: { value: "Avec une photo" } })
    choisirMedias([image("a.png")])
    expect(await screen.findByText(/^Préparation en cours/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Publier" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Photo ou vidéo" })).toHaveProperty("disabled", true)
    pending.resolve(await prepare(image("a.png")))
    await waitFor(() => expect(screen.getByRole("button", { name: "Publier" })).toHaveProperty("disabled", false))
    expect(screen.getByRole("button", { name: "Retirer a.png" })).toBeTruthy()
  })

  it("une vidéo n'est pas préparée comme une photo ; un fichier refusé par les règles non plus", async () => {
    const spy = vi.fn(prepare)
    render(
      <>
        <PostComposer prepareImage={spy} prepareVideo={readyAsChosen} />
        <DraftProbe />
      </>,
    )
    choisirMedias([{ name: "clip.mp4", size: 1024, type: "video/mp4" } as File])
    await waitFor(() => expect(lireSonde().media).toHaveLength(1))
    expect(spy).not.toHaveBeenCalled()
    // Une photo à côté d'une vidéo : refusée par la règle, jamais préparée.
    choisirMedias([image("a.png")])
    expect(await screen.findByText("Une vidéo est seule dans sa publication.")).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
  })

  it("le brouillon refuse une image qui ne sort pas du module, même rendue « prête » par une autre préparation", async () => {
    const rogue = vi.fn(async (file: File) => ({ ok: true as const, file, width: 2, height: 2, originalBytes: file.size, preparedBytes: file.size }))
    render(
      <>
        <PostComposer prepareImage={rogue} />
        <DraftProbe />
      </>,
    )
    choisirMedias([image("brute.png")])
    expect(await screen.findByText(/« brute\.png » n'est pas passée par la préparation des photos/)).toBeTruthy()
    expect(lireSonde().media).toEqual([])
  })
})

describe("SD-03 — une vidéo de publication se lit partout, bornée, et part avec sa durée", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => { resolve = done })
    return { promise, resolve }
  }

  /** Le .mov d'un iPhone : plus lourd que la borne, ce qui n'empêche pas de le convertir. */
  const mov = (name = "IMG_0412.MOV", size = 80 * 1024 * 1024) => ({ name, size, type: "video/quicktime" }) as File
  const mp4 = (name = "visite.mp4", size = 1024) => ({ name, size, type: "video/mp4" }) as File

  /**
   * La VRAIE préparation (politique comprise), sur un navigateur simulé : ce
   * qu'il sait lire, la durée qu'il mesure, et ce que rend sa conversion.
   */
  function browser(options: { decodable: boolean; durationMs: number | null }): PrepareVideo {
    const runtime: VideoRuntime = {
      createObjectUrl: () => "blob:source",
      revokeObjectUrl: () => undefined,
      probe: async () => ({ decodable: options.decodable, durationMs: options.durationMs }),
      sniffMp4Codecs: async () => ["avc1"],
      recorderTargets: () => ["video/mp4"],
      transcode: async (_url, _options, onProgress) => {
        onProgress?.(1)
        return { blob: new Blob([new Uint8Array(2_048)], { type: "video/mp4" }), mimeType: "video/mp4", durationMs: 9_000 }
      },
    }
    return (file, prepareOptions) => prepareVideoForUpload(file, prepareOptions, runtime)
  }

  it("le sélecteur propose toute vidéo : le .mov doit pouvoir être choisi pour être converti", () => {
    render(<PostComposer prepareImage={prepare} />)
    const accept = document.querySelector('input[type="file"]')?.getAttribute("accept") ?? ""
    expect(accept.split(",")).toEqual(["image/jpeg", "image/png", "image/webp", "image/gif", "video/*"])
  })

  it("un MP4 lisible part tel quel, avec sa durée DÉCLARÉE au serveur", async () => {
    const chosen = mp4()
    render(<PostComposer prepareImage={prepare} prepareVideo={browser({ decodable: true, durationMs: 12_400.6 })} />)
    choisirMedias([chosen])
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer visite.mp4" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    const [, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit]
    expect(init.body).toBe(chosen)
    expect(init.headers).toEqual({ "Content-Type": "video/mp4" })
    expect(mocks.publish.mock.calls[0]?.[0]).toMatchObject({
      media: [{ storageId: "storage-1", kind: "video", mimeType: "video/mp4", sizeBytes: 1024, durationMs: 12_401 }],
    })
  })

  it("un .mov de 80 Mo lu par ce navigateur (Safari) est CONVERTI puis entre au brouillon en MP4", async () => {
    render(<PostComposer prepareImage={prepare} prepareVideo={browser({ decodable: true, durationMs: 9_000 })} />)
    choisirMedias([mov()])
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer IMG_0412.mp4" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    const [, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit]
    expect((init.body as File).name).toBe("IMG_0412.mp4")
    expect(init.headers).toEqual({ "Content-Type": "video/mp4" })
    expect(mocks.publish.mock.calls[0]?.[0]).toMatchObject({ media: [{ kind: "video", mimeType: "video/mp4", sizeBytes: 2_048, durationMs: 9_000 }] })
  })

  it("pendant la conversion : progression, onglet à garder visible, « Annuler », et « Publier » attend", async () => {
    const pending = deferred<VideoPreparation>()
    const converting: PrepareVideo = async (_file, options) => {
      options.onPhase?.({ phase: "converting", progress: 0.42 })
      return pending.promise
    }
    render(<PostComposer prepareImage={prepare} prepareVideo={converting} />)
    fireEvent.change(zoneDeTexte(), { target: { value: "Souvenir" } })
    choisirMedias([mov()])
    const status = await screen.findByText(/Conversion de la vidéo en cours…/)
    expect(status.textContent).toMatch(/42/)
    expect(status.textContent).toContain("Elle se fait ici, en temps réel : gardez cet onglet visible jusqu'au bout.")
    expect(screen.getByRole("button", { name: "Annuler la conversion" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Publier" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Photo ou vidéo" })).toHaveProperty("disabled", true)
    pending.resolve({ status: "ready", file: new File([new Uint8Array(2_048)], "IMG_0412.mp4", { type: "video/mp4" }), durationMs: 8_960, converted: true })
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer IMG_0412.mp4" })).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Annuler la conversion" })).toBeNull()
    expect(screen.getByRole("button", { name: "Publier" })).toHaveProperty("disabled", false)
  })

  it("« Annuler la conversion » arrête tout : la vidéo n'entre pas et rien n'est téléversé", async () => {
    const cancellable: PrepareVideo = (_file, options) =>
      new Promise((resolve) => {
        options.onPhase?.({ phase: "converting", progress: 0.1 })
        options.signal?.addEventListener("abort", () => resolve({ status: "cancelled" }), { once: true })
      })
    render(
      <>
        <PostComposer prepareImage={prepare} prepareVideo={cancellable} />
        <DraftProbe />
      </>,
    )
    fireEvent.change(zoneDeTexte(), { target: { value: "Texte seul" } })
    choisirMedias([mov()])
    fireEvent.click(await screen.findByRole("button", { name: "Annuler la conversion" }))
    expect(await screen.findByText("Conversion annulée : la vidéo n'a pas été ajoutée.")).toBeTruthy()
    expect(lireSonde().media).toEqual([])
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.publish.mock.calls[0]?.[0]).not.toHaveProperty("media")
  })

  it("quitter l'écran pendant la conversion l'annule", async () => {
    let signal: AbortSignal | undefined
    const endless: PrepareVideo = (_file, options) => {
      signal = options.signal
      options.onPhase?.({ phase: "converting", progress: 0 })
      return new Promise(() => undefined)
    }
    const view = render(<PostComposer prepareImage={prepare} prepareVideo={endless} />)
    choisirMedias([mov()])
    await screen.findByRole("button", { name: "Annuler la conversion" })
    view.unmount()
    expect(signal?.aborted).toBe(true)
  })

  it("un .mov que ce navigateur ne lit pas (Chrome) est refusé avec la marche à suivre, et n'entre pas", async () => {
    render(
      <>
        <PostComposer prepareImage={prepare} prepareVideo={browser({ decodable: false, durationMs: null })} />
        <DraftProbe />
      </>,
    )
    choisirMedias([mov()])
    expect(
      await screen.findByText(
        "« IMG_0412.MOV » ne peut pas être lue par ce navigateur. Choisissez-la depuis Safari (iPhone, iPad ou Mac), qui la convertit, ou enregistrez-la d'abord au format MP4, puis réessayez.",
      ),
    ).toBeTruthy()
    expect(lireSonde().media).toEqual([])
  })

  it("une vidéo de plus de cinq minutes est refusée avant tout envoi, en nommant la borne", async () => {
    render(<PostComposer prepareImage={prepare} prepareVideo={browser({ decodable: true, durationMs: 6 * 60_000 })} />)
    choisirMedias([mp4("conference.mp4")])
    expect(await screen.findByText("« conference.mp4 » est trop longue. Une vidéo dure au plus 5 minutes.")).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("un MP4 de plus de 60 Mo est refusé AVANT la sonde ; une vidéo à côté d'une photo aussi", async () => {
    const spy = vi.fn(readyAsChosen)
    render(<PostComposer prepareImage={prepare} prepareVideo={spy} />)
    choisirMedias([mp4("lourde.mp4", 61 * 1024 * 1024)])
    expect(await screen.findByText("« lourde.mp4 » dépasse 60 Mo.")).toBeTruthy()
    choisirMedias([image("a.png")])
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer a.png" })).toBeTruthy())
    choisirMedias([mov()])
    expect(await screen.findByText("Une vidéo est seule dans sa publication.")).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
  })

  it("une vidéo convertie encore trop lourde est refusée en le disant", async () => {
    const tooHeavy: PrepareVideo = async () => ({
      status: "ready",
      file: { name: "IMG_0412.mp4", size: 61 * 1024 * 1024, type: "video/mp4" } as File,
      durationMs: 9_000,
      converted: true,
    })
    render(
      <>
        <PostComposer prepareImage={prepare} prepareVideo={tooHeavy} />
        <DraftProbe />
      </>,
    )
    choisirMedias([mov()])
    expect(
      await screen.findByText(
        "La vidéo convertie reste trop lourde. « IMG_0412.mp4 » dépasse 60 Mo. Raccourcissez-la, ou enregistrez-la au format MP4 avant de la publier.",
      ),
    ).toBeTruthy()
    expect(lireSonde().media).toEqual([])
  })

  it("la durée mesurée survit au démontage du composeur et part avec le média", async () => {
    const first = render(<PostComposer prepareImage={prepare} prepareVideo={readyAsChosen} />)
    choisirMedias([mp4()])
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer visite.mp4" })).toBeTruthy())
    first.unmount()
    render(<PostComposer prepareImage={prepare} prepareVideo={readyAsChosen} />)
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.publish.mock.calls[0]?.[0]).toMatchObject({ media: [{ kind: "video", mimeType: "video/mp4", durationMs: 12_401 }] })
  })

  it("le refus de durée du SERVEUR est dit dans la langue de l'écran, jamais par le message brut", async () => {
    mocks.publish.mockRejectedValueOnce({ data: { code: "invalidArgument", rule: "POST_VIDEO_TOO_LONG", params: { maxMinutes: 5 } } })
    render(<PostComposer prepareImage={prepare} prepareVideo={readyAsChosen} />)
    choisirMedias([mp4()])
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer visite.mp4" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Une vidéo de publication dure au plus 5 minutes."))
  })
})
