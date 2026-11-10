// Dupliqué de socle/packages/agent-features/src/features/reseau-albums/AlbumComposer.test.tsx @ ad2e7fdc2 — adaptations : références TYPÉES du moteur reconnues par leur nom généré (`modules/albums/albums:*`, dépôt `modules/media/media:generateUploadUrl`) ; rendu dans l'enveloppe du moteur (`renderWithEngine` : i18n français, réseau de test) ; chaque appel porte le réseau courant, le dépôt l'usage `album_image` ; refus serveur à la forme du moteur (`error.data` porte une règle et ses bornes, traduite) ; barre de progression rendue sur place (plus de `Progress` à simuler) ; adresses de dépôt neutres ; les 15 cas sont gardés ; cas ajoutés : au-delà de douze photos l'enregistrement part par lots, et un refus à la publication se dit traduit sans publier ; SD-02 : le ré-encodage par défaut est celui du module partagé (`features/media-upload`) — refus sans canvas, jamais l'original — et, sous le plan d'album, garde son comportement (qualité 0,92, dimensions d'origine, PNG gardé, WebP en JPEG, GIF refusé), sortie sans métadonnées.
// Adaptations PD4 : lecture et garde propriétaire, reprise sans nouvel upload, sauvegarde vide/métadonnées/ordre/couverture/légendes, publication conditionnelle et concurrence, remise à zéro réseau/personne/album.
// @vitest-environment jsdom

/**
 * AlbumComposer — le parcours complet, monté (R-09, ADR-0145).
 *
 * Cinq choses que seul un test MONTÉ peut prouver — le module pur
 * (`album-model.test.ts`) décide, mais il ne branche rien :
 *
 *  1. le brouillon SERVEUR naît à l'envoi des photos ou à la sauvegarde
 *     explicite, jamais au seul montage du composeur ;
 *  2. les métadonnées EXIF partent AVANT le téléversement (ré-encodage), et un
 *     ré-encodage impossible REFUSE le fichier au lieu d'envoyer l'original ;
 *  3. la REPRISE : un renvoi après une coupure ne re-téléverse que le reste, et
 *     `addItems` ne redouble rien (deux idempotences, à deux niveaux) ;
 *  4. l'ordre et la couverture partent AVEC la publication, en une fois ;
 *  5. un refus serveur est lu dans `error.data` — jamais inventé.
 */
import { NetworkProvider } from "@antsia/api/network"
import type { Id } from "@antsia/api/engine"
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { listImageMetadata } from "@antsia/social-domain/imageMetadata"

import { createAppI18n } from "../../i18n"
import { renderWithEngine, TEST_NETWORK_ID, TEST_PERSON_ID, TEST_ROUTES } from "../../tests/engine-wrapper"
import { fakeImageRuntime, TEST_JPEG_WITH_GPS_BYTES, TEST_PNG_BYTES } from "../../tests/image-runtime"
import type { AlbumDetail, AlbumId, AlbumItemId, DeclaredAlbumItem } from "./albums-api"

const mocks = vi.hoisted(() => ({
  /** Tous les appels serveur, dans l'ordre : `[nom, arguments]`. */
  calls: [] as { name: string; args: unknown }[],
  /** Ce que chaque mutation rend, par NOM de fonction. */
  replies: {} as Record<string, (args: unknown) => unknown>,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  readData: undefined as AlbumDetail | null | undefined,
  readError: false,
  read: vi.fn(),
  refetch: vi.fn(),
  server: null as AlbumDetail | null,
  serverRead: vi.fn(),
  known: new Map<string, AlbumItemId>(),
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: unknown, args: unknown) => {
    mocks.read(reference, args)
    return { data: args === "skip" ? undefined : mocks.readData, isError: args !== "skip" && mocks.readError, refetch: mocks.refetch }
  },
}))

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server")
  return {
    useConvex: () => ({ query: mocks.serverRead }),
    useMutation: (reference: unknown) => (args: unknown) => {
      const name = getFunctionName(reference as never)
      mocks.calls.push({ name, args })
      const reply = mocks.replies[name]
      try {
        return Promise.resolve(reply ? reply(args) : { ok: true })
      } catch (error) {
        return Promise.reject(error)
      }
    },
  }
})
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
  }) => <button type="button" {...props}>{children}</button>,
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Icon: () => null,
  SkeletonCard: () => <div role="status" aria-label="Chargement de l'album" />,
  TextArea: (props: InputHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...(props as object)} />
  ),
  TextInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

import { AlbumComposer, createAlbumReencode } from "./AlbumComposer"

const ALBUMS = "modules/albums/albums"
const DEPOT = "modules/media/media:generateUploadUrl"

/** Un fichier acceptable — `image/jpeg`, sous la borne du fil. */
function photo(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" })
}

/** Le ré-encodage, injecté : `canvas` n'existe pas en `jsdom`. */
const reencodeOk = vi.fn(async (file: File) => ({ ok: true as const, file }))

function nomsAppeles(): string[] {
  return mocks.calls.map((call) => call.name.split(":").at(-1) ?? call.name)
}

function argsDe(suffixe: string): unknown {
  return mocks.calls.find((call) => call.name.endsWith(suffixe))?.args
}

/** Mène le composeur jusqu'à l'étape « Photos », album titré. */
function ouvrirEtapePhotos(titre = "Mission de terrain") {
  fireEvent.change(screen.getByLabelText("Titre de l'album"), {
    target: { value: titre },
  })
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
}

/**
 * Attend l'étape « Ordre et couverture ».
 *
 * ⚠️ Ancré sur la CONSIGNE de l'étape, jamais sur son libellé : la puce
 * d'étape porte « 3. Ordre et couverture » et reste rendue à toutes les
 * étapes — un tel ancrage passerait au vert sans qu'on ait avancé d'un pas.
 */
async function attendreEtapeOrdre() {
  await waitFor(() =>
    expect(
      screen.getByText(/Rangez les photos et choisissez la couverture/),
    ).toBeTruthy(),
  )
}

/**
 * L'annonce `sr-only` du composeur. Deux `role="status"` coexistent — la
 * progression du téléversement et l'annonce des déplacements — et les
 * confondre ferait passer l'une pour l'autre.
 */
function annonce(): HTMLElement {
  return screen
    .getAllByRole("status")
    .find((element) => element.classList.contains("sr-only"))!
}

/** La ligne de progression, l'autre `role="status"`. */
function progression(): HTMLElement {
  return screen
    .getAllByRole("status")
    .find((element) => !element.classList.contains("sr-only"))!
}

/** Sélectionne des fichiers, puis attend que le ré-encodage soit consommé. */
async function choisir(...fichiers: File[]) {
  const input = screen.getByLabelText("Choisir des photos") as HTMLInputElement
  Object.defineProperty(input, "files", { value: fichiers, configurable: true })
  fireEvent.change(input)
  await waitFor(() =>
    expect(screen.getAllByText(/^En attente$|^Envoyée$|^À reprendre$/).length).toBe(
      fichiers.length,
    ),
  )
}

let compteurStorage = 0

function albumDetail(): AlbumDetail {
  return {
    album: { albumId: "al-1" as AlbumId, title: "Mission conservée", description: "Description existante", audience: "public", status: "draft", itemCount: 2, cover: null, updatedAt: 1, publishedAt: null, isOwner: true },
    owner: { personId: TEST_PERSON_ID, handle: "awa", displayName: "Awa", avatarUrl: null },
    items: [
      { itemId: "it-1" as AlbumItemId, url: "blob:photo-1", withheld: null, mimeType: "image/jpeg", width: null, height: null, altText: "Alternative conservée", caption: "Légende conservée", position: 0 },
      { itemId: "it-2" as AlbumItemId, url: "blob:photo-2", withheld: null, mimeType: "image/jpeg", width: null, height: null, altText: null, caption: null, position: 1 },
    ],
    coverItemId: "it-2" as AlbumItemId,
  }
}

function resume(detail = albumDetail()) {
  mocks.readData = detail
  mocks.server = detail
  return detail
}

beforeEach(() => {
  mocks.calls = []
  mocks.replies = {}
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
  reencodeOk.mockClear()
  compteurStorage = 0
  mocks.readData = undefined
  mocks.readError = false
  mocks.read.mockReset()
  mocks.refetch.mockReset()
  mocks.known.clear()
  const empty = albumDetail()
  mocks.server = { ...empty, album: { ...empty.album, itemCount: 0, description: null, audience: "connections" }, items: [], coverItemId: null }
  mocks.serverRead.mockReset()
  mocks.serverRead.mockImplementation(async () => mocks.server)

  // jsdom n'implémente ni les URL d'objet ni `fetch`.
  URL.createObjectURL = vi.fn(() => "blob:apercu")
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      compteurStorage += 1
      return {
        ok: true,
        json: async () => ({ storageId: `st-${compteurStorage}` }),
      } as unknown as Response
    }),
  )

  mocks.replies[`${ALBUMS}:create`] = (args) => {
    const fields = args as { title: string; description: string; audience: "public" | "connections" }
    if (mocks.server) mocks.server = { ...mocks.server, album: { ...mocks.server.album, ...fields } }
    return { albumId: "al-1", created: true }
  }
  mocks.replies[`${ALBUMS}:update`] = (args) => {
    const fields = args as { title: string; description: string; audience: "public" | "connections" }
    if (mocks.server) mocks.server = { ...mocks.server, album: { ...mocks.server.album, ...fields } }
    return { updated: true }
  }
  mocks.replies[DEPOT] = () => "blob:depot-album"
  mocks.replies[`${ALBUMS}:addItems`] = (args) => {
    const items = (args as { items: DeclaredAlbumItem[] }).items
    const fresh = items.filter((item) => !mocks.known.has(item.idempotencyKey))
    const next = fresh.map((item, index) => {
      const itemId = `it-${(mocks.server?.items.length ?? 0) + index + 1}` as AlbumItemId
      mocks.known.set(item.idempotencyKey, itemId)
      return { itemId, url: `blob:${itemId}`, withheld: null, mimeType: item.mimeType, width: null, height: null, caption: item.caption ?? null, altText: item.altText ?? null, position: (mocks.server?.items.length ?? 0) + index }
    })
    if (mocks.server) mocks.server = { ...mocks.server, album: { ...mocks.server.album, itemCount: mocks.server.items.length + next.length }, items: [...mocks.server.items, ...next], coverItemId: mocks.server.coverItemId ?? next[0]?.itemId ?? null }
    return { added: fresh.length, skipped: items.length - fresh.length, itemIds: next.length > 0 ? next.map((item) => item.itemId) : items.map((item) => mocks.known.get(item.idempotencyKey)) }
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ⚠️ Suite LENTE sous charge : un parcours monté complet (Testing Library +
// jsdom) par cas ; vu le 07/09 à 5,4 s pour « refuse d'avancer sans titre »
// quand 13 fichiers tournent en parallèle — vert seul en moins d'une seconde.
vi.setConfig({ testTimeout: 20_000 })

describe("AlbumComposer — l'identité d'abord, et rien n'est visible", () => {
  it("refuse d'avancer sans titre, et le DIT", () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)

    expect(screen.getByText("Donnez un titre à cet album.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Continuer" }).hasAttribute("disabled")).toBe(
      true,
    )
  })

  it("annonce que rien n'est publié tant qu'on n'a pas publié", () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    expect(screen.getByText(/Rien n'est visible tant que vous n'avez pas publié/)).toBeTruthy()
  })

  it("l'audience est un CHOIX explicite, dit en clair, et par défaut la plus fermée", () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    const connexions = screen.getByLabelText(/Mes connexions/) as HTMLInputElement
    expect(connexions.checked).toBe(true)
    // « Tout le réseau » n'est PAS « Internet » : la phrase doit le dire.
    expect(screen.getByText(/Cet album ne sort pas de la plateforme/)).toBeTruthy()
  })

  it("aucun album n'est créé au seul fait d'ouvrir le composeur", () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    expect(nomsAppeles()).toEqual([])
  })
})

describe("AlbumComposer — les métadonnées partent AVANT l'octet", () => {
  it("chaque photo passe par le ré-encodage", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"), photo("b.jpg"))
    expect(reencodeOk).toHaveBeenCalledTimes(2)
  })

  it("un ré-encodage impossible REFUSE le fichier — jamais l'original", async () => {
    const refus = vi.fn(async () => ({
      ok: false as const,
      reason: "« a.jpg » n'a pas pu être préparée : elle n'a pas été envoyée.",
    }))
    renderWithEngine(<AlbumComposer handle="awa" reencode={refus} />)
    ouvrirEtapePhotos()

    const input = screen.getByLabelText("Choisir des photos") as HTMLInputElement
    Object.defineProperty(input, "files", {
      value: [photo("a.jpg")],
      configurable: true,
    })
    fireEvent.change(input)

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "n'a pas pu être préparée",
      ),
    )
    // Rien n'est entré dans le brouillon, donc rien ne peut partir.
    expect(screen.getByText(/Aucune photo —/)).toBeTruthy()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe("AlbumComposer — le ré-encodage est celui du module partagé (SD-02)", () => {
  const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "albums" }).getFixedT("fr")
  const source = (bytes: Uint8Array, name: string, type: string) => new File([bytes as Uint8Array<ArrayBuffer>], name, { type })

  it("sans injection, une photo que ce navigateur ne sait pas préparer (jsdom, sans décodeur) est REFUSÉE — jamais l'original", async () => {
    renderWithEngine(<AlbumComposer handle="awa" />)
    ouvrirEtapePhotos()
    const input = screen.getByLabelText("Choisir des photos") as HTMLInputElement
    Object.defineProperty(input, "files", { value: [photo("a.jpg")], configurable: true })
    fireEvent.change(input)

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("n'a pas été envoyée"))
    expect(screen.getByText(/Aucune photo —/)).toBeTruthy()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("sous le plan d'album, comme avant : qualité 0,92, dimensions d'origine, et plus aucune métadonnée", async () => {
    const runtime = fakeImageRuntime({ width: 6000, height: 4000, output: { bytes: TEST_JPEG_WITH_GPS_BYTES, type: "image/jpeg" } })
    const result = await createAlbumReencode(runtime)(source(TEST_JPEG_WITH_GPS_BYTES, "terrain.jpg", "image/jpeg"), t)
    expect(result.ok).toBe(true)
    expect(runtime.canvases).toEqual([{ width: 6000, height: 4000 }])
    expect(runtime.encodings).toEqual([{ type: "image/jpeg", quality: 0.92 }])
    if (result.ok) expect(listImageMetadata(new Uint8Array(await result.file.arrayBuffer()), "image/jpeg")).toEqual([])
  })

  it("PNG reste PNG, WebP part en JPEG, le GIF est refusé en le disant, un échec dit la phrase de l'album", async () => {
    const png = fakeImageRuntime({ width: 10, height: 10 })
    expect(await createAlbumReencode(png)(source(TEST_PNG_BYTES, "a.png", "image/png"), t)).toMatchObject({ ok: true })
    expect(png.encodings[0]?.type).toBe("image/png")

    const webp = fakeImageRuntime({ width: 10, height: 10 })
    expect(await createAlbumReencode(webp)(source(TEST_PNG_BYTES, "a.webp", "image/webp"), t)).toMatchObject({ ok: true })
    expect(webp.encodings[0]?.type).toBe("image/jpeg")

    const gif = await createAlbumReencode(fakeImageRuntime())(source(TEST_PNG_BYTES, "a.gif", "image/gif"), t)
    expect(gif.ok).toBe(false)
    expect(!gif.ok && gif.reason).toBe(t("albums:albumModel.reencode.gifRefused"))

    const failed = await createAlbumReencode(fakeImageRuntime({ decodeFails: true }))(source(TEST_PNG_BYTES, "b.jpg", "image/jpeg"), t)
    expect(failed).toEqual({ ok: false, reason: t("albums:albumModel.reencode.failed", { name: "b.jpg" }) })
  })
})

describe("AlbumComposer — envoyer, reprendre, ordonner, publier", () => {
  it("l'envoi crée le brouillon, téléverse et enregistre le lot", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos("Mission à Oyem")
    await choisir(photo("a.jpg"), photo("b.jpg"))

    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await waitFor(() => expect(nomsAppeles()).toContain("addItems"))

    // L'ordre est le contrat : créer, puis une URL par fichier, puis le lot.
    expect(nomsAppeles()).toEqual([
      "create",
      "generateUploadUrl",
      "generateUploadUrl",
      "addItems",
    ])
    expect(argsDe(":create")).toMatchObject({
      networkId: TEST_NETWORK_ID,
      title: "Mission à Oyem",
      audience: "connections",
    })
    // Le dépôt se fait DANS le réseau courant, sous l'usage des albums.
    expect(argsDe(":generateUploadUrl")).toEqual({
      networkId: TEST_NETWORK_ID,
      usage: "album_image",
    })
    const ajout = argsDe(":addItems") as {
      networkId: string
      albumId: string
      items: { storageId: string; idempotencyKey: string }[]
    }
    expect(ajout.networkId).toBe(TEST_NETWORK_ID)
    expect(ajout.albumId).toBe("al-1")
    expect(ajout.items.map((item) => item.storageId)).toEqual(["st-1", "st-2"])
    // Une clé PAR FICHIER, distinctes — c'est ce qui rend la reprise exacte.
    expect(new Set(ajout.items.map((item) => item.idempotencyKey)).size).toBe(2)
  })

  it("un renvoi ne re-téléverse RIEN et ne crée pas un second album", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"))

    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()
    const apresPremier = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    // Revenir sur les photos : les photos confirmées sont devenues serveur.
    fireEvent.click(screen.getByRole("button", { name: "Retour" }))
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    await attendreEtapeOrdre()

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      apresPremier,
    )
    // Et la MÊME clé d'idempotence d'album : un seul `create`.
    expect(nomsAppeles().filter((nom) => nom === "create").length).toBe(1)
    expect(nomsAppeles().filter((nom) => nom === "addItems").length).toBe(1)
  })

  it("au-delà de douze photos, l'enregistrement part par LOTS — le moteur refuse un lot plus grand", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(...Array.from({ length: 13 }, (_, index) => photo(`p${index + 1}.jpg`)))

    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()

    const lots = mocks.calls
      .filter((call) => call.name.endsWith(":addItems"))
      .map((call) => (call.args as { items: { idempotencyKey: string }[] }).items)
    expect(lots.map((lot) => lot.length)).toEqual([12, 1])
    // Toutes les photos, chacune sa clé, dans l'ordre de la sélection.
    expect(new Set(lots.flat().map((item) => item.idempotencyKey)).size).toBe(13)
    expect(screen.getByText("Photo 13 sur 13")).toBeTruthy()
    expect(annonce().textContent).toContain("13 photos dans l'album.")
  })

  it("ce qui reste à envoyer est ANNONCÉ, sans laisser croire qu'on recommence", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"), photo("b.jpg"))

    const statut = progression()
    expect(statut.getAttribute("aria-live")).toBe("polite")
    expect(statut.textContent).toContain("Envoi en cours : 0 sur 2.")
  })

  it("l'ordre et la couverture partent AVEC la publication", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"), photo("b.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()

    // Descendre la première, prendre la seconde en couverture.
    fireEvent.click(screen.getByRole("button", { name: "Descendre la photo 1" }))
    fireEvent.click(
      screen.getByRole("button", { name: "Définir la photo 1 comme couverture" }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    fireEvent.click(screen.getByRole("button", { name: "Publier l'album" }))

    await waitFor(() => expect(nomsAppeles()).toContain("publish"))
    expect(argsDe(":reorder")).toEqual({
      networkId: TEST_NETWORK_ID,
      albumId: "al-1",
      itemIds: ["it-2", "it-1"],
    })
    expect(argsDe(":setCover")).toEqual({ networkId: TEST_NETWORK_ID, albumId: "al-1", itemId: "it-2" })
    expect(argsDe(":publish")).toEqual({ networkId: TEST_NETWORK_ID, albumId: "al-1" })
  })

  it("un déplacement au clavier s'ANNONCE — sinon la carte bouge en silence", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"), photo("b.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()

    fireEvent.click(screen.getByRole("button", { name: "Descendre la photo 1" }))
    expect(annonce().textContent).toContain("est en position 2 sur 2")
  })

  it("l'aperçu dit l'audience et ce que le retrait ne rappellera pas", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos("Mission à Oyem")
    await choisir(photo("a.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))

    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Mission à Oyem")
    expect(screen.getByText(/Seules les personnes avec qui vous êtes connecté/)).toBeTruthy()
    expect(
      screen.getByText(/une copie déjà téléchargée par un lecteur ne peut pas être rappelée/i),
    ).toBeTruthy()
  })

  it("prévient le parent une fois l'album publié", async () => {
    const publie = vi.fn()
    renderWithEngine(
      <AlbumComposer handle="awa" reencode={reencodeOk} onPublished={publie} />,
    )
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    fireEvent.click(screen.getByRole("button", { name: "Publier l'album" }))

    await waitFor(() => expect(publie).toHaveBeenCalledWith("al-1"))
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Album publié.")
  })
})

describe("AlbumComposer — un refus se LIT", () => {
  it("le refus serveur vient de `error.data`, jamais d'une phrase inventée", async () => {
    mocks.replies[`${ALBUMS}:addItems`] = () => {
      throw Object.assign(new Error("Server Error"), {
        data: { code: "invalidArgument", rule: "ALBUM_FULL", params: { max: 60 } },
      })
    }
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Un album porte au plus 60 photos.",
      ),
    )
    expect(screen.queryByText(/Server Error/)).toBeNull()
  })

  it("un refus à la publication se dit traduit, et rien n'est publié", async () => {
    mocks.replies[`${ALBUMS}:reorder`] = () => {
      throw Object.assign(new Error("Server Error"), {
        data: { code: "invalidArgument", rule: "ALBUM_REORDER_MISMATCH" },
      })
    }
    const publie = vi.fn()
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} onPublished={publie} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    fireEvent.click(screen.getByRole("button", { name: "Publier l'album" }))

    // L'aperçu porte déjà son propre bandeau (« Avant de publier ») : le refus
    // est le bandeau « Action refusée », qui s'y ajoute.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("alert")
          .find((alerte) => alerte.textContent?.startsWith("Action refusée"))?.textContent,
      ).toContain("L'ordre demandé ne correspond plus à cet album."),
    )
    expect(nomsAppeles()).not.toContain("publish")
    expect(publie).not.toHaveBeenCalled()
    expect(screen.queryByText(/Server Error/)).toBeNull()
  })

  it("une image refusée par le brouillon le dit, sans faire tomber la sélection", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()

    const input = screen.getByLabelText("Choisir des photos") as HTMLInputElement
    Object.defineProperty(input, "files", {
      value: [new File(["x"], "note.txt", { type: "text/plain" })],
      configurable: true,
    })
    fireEvent.change(input)

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "n'est pas une image acceptée",
      ),
    )
  })
})

function allerAuxPhotosReprises() {
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
}

function allerALOrdreRepris() {
  allerAuxPhotosReprises()
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
}

describe("AlbumComposer — reprendre et enregistrer le même album", () => {
  it("hydrate les champs, les photos, les légendes et la couverture sans recréer ni renvoyer un fichier", () => {
    resume()
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" reencode={reencodeOk} />)

    expect((screen.getByLabelText("Titre de l'album") as HTMLInputElement).value).toBe("Mission conservée")
    expect((screen.getByLabelText("Description (facultative)") as HTMLTextAreaElement).value).toBe("Description existante")
    expect((screen.getByLabelText(/Tout le réseau/) as HTMLInputElement).checked).toBe(true)
    allerAuxPhotosReprises()
    expect(screen.getByAltText("Alternative conservée").getAttribute("src")).toBe("blob:photo-1")
    expect(screen.getByText("Légende conservée")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    expect((screen.getByLabelText("Légende de la photo 1") as HTMLInputElement).value).toBe("Légende conservée")
    expect(screen.getByRole("button", { name: "Définir la photo 2 comme couverture" }).getAttribute("aria-pressed")).toBe("true")
    expect(nomsAppeles()).toEqual([])
    expect(reencodeOk).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), { networkId: TEST_NETWORK_ID, albumId: "al-1" })
  })

  it("enregistre titre, description vide et audience sur l'album repris sans republier", async () => {
    resume()
    const saved = vi.fn()
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" onSaved={saved} reencode={reencodeOk} />)
    fireEvent.change(screen.getByLabelText("Titre de l'album"), { target: { value: "Titre corrigé" } })
    fireEvent.change(screen.getByLabelText("Description (facultative)"), { target: { value: "" } })
    fireEvent.click(screen.getByLabelText(/Mes connexions/))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }))

    await waitFor(() => expect(saved).toHaveBeenCalledExactlyOnceWith("al-1"))
    expect(argsDe(":update")).toMatchObject({ networkId: TEST_NETWORK_ID, albumId: "al-1", title: "Titre corrigé", description: "", audience: "connections" })
    expect(argsDe(":reorder")).toEqual({ networkId: TEST_NETWORK_ID, albumId: "al-1", itemIds: ["it-1", "it-2"] })
    expect(argsDe(":setCover")).toEqual({ networkId: TEST_NETWORK_ID, albumId: "al-1", itemId: "it-2" })
    expect(nomsAppeles()).not.toContain("create")
    expect(nomsAppeles()).not.toContain("addItems")
    expect(nomsAppeles()).not.toContain("setCaption")
    expect(nomsAppeles()).not.toContain("publish")
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("corrige une légende sans effacer le texte alternatif existant", async () => {
    resume()
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" reencode={reencodeOk} />)
    allerALOrdreRepris()
    fireEvent.change(screen.getByLabelText("Légende de la photo 1"), { target: { value: "Légende corrigée" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }))

    await waitFor(() => expect(nomsAppeles()).toContain("setCaption"))
    expect(argsDe(":setCaption")).toEqual({ networkId: TEST_NETWORK_ID, itemId: "it-1", caption: "Légende corrigée", altText: "Alternative conservée" })
  })

  it("ajoute une nouvelle photo, conserve les identifiants, l'ordre choisi et l'ancienne couverture", async () => {
    resume()
    const published = vi.fn()
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" reencode={reencodeOk} onPublished={published} />)
    allerALOrdreRepris()
    fireEvent.click(screen.getByRole("button", { name: "Descendre la photo 1" }))
    fireEvent.click(screen.getByRole("button", { name: "Retour" }))
    await choisir(photo("nouvelle.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()
    expect(screen.getByText("Photo 3 sur 3")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    fireEvent.click(screen.getByRole("button", { name: "Publier l'album" }))

    await waitFor(() => expect(published).toHaveBeenCalledExactlyOnceWith("al-1"))
    expect(argsDe(":reorder")).toEqual({ networkId: TEST_NETWORK_ID, albumId: "al-1", itemIds: ["it-2", "it-1", "it-3"] })
    expect(argsDe(":setCover")).toEqual({ networkId: TEST_NETWORK_ID, albumId: "al-1", itemId: "it-2" })
    expect(nomsAppeles()).not.toContain("create")
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(reencodeOk).toHaveBeenCalledTimes(1)
  })

  it("compte les photos déjà serveur dans la limite de soixante", async () => {
    const detail = albumDetail()
    const items = Array.from({ length: 59 }, (_, index) => ({ ...detail.items[0]!, itemId: `it-${index + 1}` as AlbumItemId, position: index }))
    resume({ ...detail, album: { ...detail.album, itemCount: 59 }, items })
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" reencode={reencodeOk} />)
    allerAuxPhotosReprises()
    const input = screen.getByLabelText("Choisir des photos")
    fireEvent.change(input, { target: { files: [photo("a.jpg"), photo("b.jpg")] } })
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Un album porte au plus 60 photos."))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()

    expect(screen.getByText("Photo 60 sur 60")).toBeTruthy()
    expect((argsDe(":addItems") as { items: unknown[] }).items).toHaveLength(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("enregistre un nouveau brouillon titré sans aucune photo et ouvre sa galerie", async () => {
    const gallery = vi.fn()
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} onPublished={gallery} />)
    fireEvent.change(screen.getByLabelText("Titre de l'album"), { target: { value: "Brouillon retrouvé" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }))

    await waitFor(() => expect(gallery).toHaveBeenCalledExactlyOnceWith("al-1"))
    expect(nomsAppeles()).toEqual(["create"])
    expect(argsDe(":create")).toMatchObject({ title: "Brouillon retrouvé", audience: "connections", networkId: TEST_NETWORK_ID })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("persiste les corrections après la première création avant de publier", async () => {
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await attendreEtapeOrdre()
    fireEvent.click(screen.getByRole("button", { name: "Retour" }))
    fireEvent.click(screen.getByRole("button", { name: "Retour" }))
    fireEvent.change(screen.getByLabelText("Titre de l'album"), { target: { value: "Titre après création" } })
    fireEvent.change(screen.getByLabelText("Description (facultative)"), { target: { value: "Description corrigée" } })
    fireEvent.click(screen.getByLabelText(/Tout le réseau/))
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    fireEvent.click(screen.getByRole("button", { name: "Publier l'album" }))

    await waitFor(() => expect(nomsAppeles()).toContain("publish"))
    expect(nomsAppeles().filter((name) => name === "create")).toHaveLength(1)
    expect(argsDe(":update")).toMatchObject({ albumId: "al-1", title: "Titre après création", description: "Description corrigée", audience: "public" })
    expect(nomsAppeles().indexOf("update")).toBeLessThan(nomsAppeles().indexOf("publish"))
  })

  it("après une relecture échouée, réessaie le rattachement sans renvoyer les octets ni doubler les photos", async () => {
    mocks.serverRead.mockRejectedValueOnce(new Error("PRIVATE_READ_FAILURE"))
    renderWithEngine(<AlbumComposer handle="awa" reencode={reencodeOk} />)
    ouvrirEtapePhotos()
    await choisir(photo("a.jpg"))
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("L'envoi a échoué"))
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    await attendreEtapeOrdre()

    const additions = mocks.calls.filter((call) => call.name.endsWith(":addItems"))
    expect(additions).toHaveLength(2)
    expect(additions[1]?.args).toEqual(additions[0]?.args)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.server?.items).toHaveLength(1)
    expect(screen.queryByText("PRIVATE_READ_FAILURE")).toBeNull()
  })

  it("enregistre un album publié comme modifications visibles, sans commande de publication ni promesse de brouillon privé", async () => {
    const detail = albumDetail()
    resume({ ...detail, album: { ...detail.album, status: "published", publishedAt: 1 } })
    const saved = vi.fn()
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" onSaved={saved} />)
    expect(screen.queryByText(/Rien n'est visible/)).toBeNull()
    expect(screen.getByText(/Cet album est déjà publié/)).toBeTruthy()
    allerALOrdreRepris()
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    expect(screen.queryByRole("button", { name: "Publier l'album" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }))

    await waitFor(() => expect(saved).toHaveBeenCalledExactlyOnceWith("al-1"))
    expect(nomsAppeles()).not.toContain("publish")
    expect(nomsAppeles()).not.toContain("create")
  })

  it("reprend un album retiré sans changer son état à la sauvegarde", async () => {
    const detail = albumDetail()
    resume({ ...detail, album: { ...detail.album, status: "withdrawn" } })
    const saved = vi.fn()
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" onSaved={saved} />)
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }))

    await waitFor(() => expect(saved).toHaveBeenCalledWith("al-1"))
    expect(nomsAppeles()).not.toContain("publish")
    expect(mocks.server?.album.status).toBe("withdrawn")
  })

  it("une photo retenue est annoncée sans image ni nouvel envoi", () => {
    const detail = albumDetail()
    resume({ ...detail, items: [{ ...detail.items[0]!, url: null, withheld: "fileScanPending" }], coverItemId: "it-1" as AlbumItemId })
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" />)
    allerAuxPhotosReprises()

    expect(screen.queryByRole("img")).toBeNull()
    expect(screen.queryByAltText("Alternative conservée")).toBeNull()
    expect(screen.getByText(/analyse/i)).toBeTruthy()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("une retenue prime sur une URL présente dans un DTO incohérent", () => {
    const detail = albumDetail()
    resume({ ...detail, items: [{ ...detail.items[0]!, withheld: "fileQuarantined" }], coverItemId: "it-1" as AlbumItemId })
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" />)
    allerAuxPhotosReprises()

    expect(screen.queryByRole("img")).toBeNull()
    expect(screen.queryByAltText("Alternative conservée")).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("valide la description avant toute sauvegarde et ne crée rien pour une forme invalide", async () => {
    renderWithEngine(<AlbumComposer handle="awa" />)
    fireEvent.change(screen.getByLabelText("Titre de l'album"), { target: { value: "Titre" } })
    fireEvent.change(screen.getByLabelText("Description (facultative)"), { target: { value: "x".repeat(601) } })
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("600"))
    expect(screen.getByRole("button", { name: "Enregistrer le brouillon" }).hasAttribute("disabled")).toBe(true)
    expect(nomsAppeles()).toEqual([])
  })
})

describe("AlbumComposer — gardes de lecture, de session et de concurrence", () => {
  it.each(["inconnu", "autrui", "identifiant périmé", "autre propriétaire"])("ferme le composeur pour un détail %s", (kind) => {
    const detail = albumDetail()
    mocks.readData = kind === "inconnu" ? null : kind === "autrui" ? { ...detail, album: { ...detail.album, isOwner: false } } : kind === "identifiant périmé" ? { ...detail, album: { ...detail.album, albumId: "autre" as AlbumId } } : { ...detail, owner: { ...detail.owner, personId: "persons_autre" as Id<"persons"> } }
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" />)

    expect(screen.getByRole("alert").textContent).toContain("Cet album n'est pas accessible")
    expect(screen.queryByLabelText("Titre de l'album")).toBeNull()
    expect(nomsAppeles()).toEqual([])
  })

  it("distingue la lecture en cours d'une erreur et permet une reprise explicite", () => {
    const { rerender } = renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" />)
    expect(screen.getByRole("status", { name: "Chargement de l'album" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    mocks.readError = true
    rerender(<AlbumComposer handle="awa" albumId="al-1" />)
    expect(screen.queryByRole("status", { name: "Chargement de l'album" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText("Titre de l'album")).toBeNull()
    mocks.readError = false
    resume()
    rerender(<AlbumComposer handle="awa" albumId="al-1" />)
    expect((screen.getByLabelText("Titre de l'album") as HTMLInputElement).value).toBe("Mission conservée")
  })

  it("garde les corrections sur une panne de relecture, mais verrouille les commandes", () => {
    resume()
    const { rerender } = renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" />)
    fireEvent.change(screen.getByLabelText("Titre de l'album"), { target: { value: "Correction locale" } })
    mocks.readError = true
    rerender(<AlbumComposer handle="awa" albumId="al-1" />)

    expect(screen.getByRole("alert").textContent).toContain("Cet album n'a pas pu être chargé")
    expect((screen.getByLabelText("Titre de l'album") as HTMLInputElement).value).toBe("Correction locale")
    expect(screen.getByLabelText("Titre de l'album").hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Enregistrer le brouillon" }).hasAttribute("disabled")).toBe(true)
    expect(nomsAppeles()).toEqual([])
  })

  it.each(["réseau", "personne", "album"])("réinitialise les changements locaux au changement de %s", (scope) => {
    const detail = resume()
    const scoped = (changed: boolean) => (
      <NetworkProvider networkId={(changed && scope === "réseau" ? "networks_autre" : TEST_NETWORK_ID) as Id<"networks">} personId={(changed && scope === "personne" ? "persons_autre" : TEST_PERSON_ID) as Id<"persons">} slug="test" charte="antsia" routes={TEST_ROUTES}>
        <AlbumComposer handle="awa" albumId={changed && scope === "album" ? "al-2" : "al-1"} />
      </NetworkProvider>
    )
    const { rerender } = renderWithEngine(scoped(false))
    fireEvent.change(screen.getByLabelText("Titre de l'album"), { target: { value: "Changement non enregistré" } })
    mocks.readData = { ...detail, album: { ...detail.album, title: "Autre contexte", albumId: (scope === "album" ? "al-2" : "al-1") as AlbumId }, owner: { ...detail.owner, personId: (scope === "personne" ? "persons_autre" : TEST_PERSON_ID) as Id<"persons"> } }
    rerender(scoped(true))

    expect((screen.getByLabelText("Titre de l'album") as HTMLInputElement).value).toBe("Autre contexte")
    expect(nomsAppeles()).toEqual([])
  })

  it("masque la publication sans droit tout en permettant d'enregistrer son brouillon", async () => {
    resume()
    const saved = vi.fn()
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" canPublish={false} onSaved={saved} />)
    allerALOrdreRepris()
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    expect(screen.queryByRole("button", { name: "Publier l'album" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }))

    await waitFor(() => expect(saved).toHaveBeenCalledWith("al-1"))
    expect(nomsAppeles()).not.toContain("publish")
  })

  it("verrouille immédiatement une sauvegarde et ses champs contre le double clic", async () => {
    resume()
    let resolveUpdate: (() => void) | undefined
    mocks.replies[`${ALBUMS}:update`] = () => new Promise<void>((resolve) => { resolveUpdate = resolve })
    const saved = vi.fn()
    const published = vi.fn()
    renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" onSaved={saved} onPublished={published} />)
    const save = screen.getByRole("button", { name: "Enregistrer le brouillon" })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(nomsAppeles().filter((name) => name === "update")).toHaveLength(1)
    expect(screen.getByLabelText("Titre de l'album").hasAttribute("disabled")).toBe(true)
    fireEvent.change(screen.getByLabelText("Titre de l'album"), { target: { value: "Trop tard" } })
    expect((screen.getByLabelText("Titre de l'album") as HTMLInputElement).value).toBe("Mission conservée")
    await act(async () => { resolveUpdate?.() })

    await waitFor(() => expect(saved).toHaveBeenCalledExactlyOnceWith("al-1"))
    expect(published).not.toHaveBeenCalled()
  })

  it("recontrôle le droit de publier après les sauvegardes asynchrones", async () => {
    resume()
    let resolveUpdate: (() => void) | undefined
    mocks.replies[`${ALBUMS}:update`] = () => new Promise<void>((resolve) => { resolveUpdate = resolve })
    const published = vi.fn()
    const { rerender } = renderWithEngine(<AlbumComposer handle="awa" albumId="al-1" onPublished={published} />)
    allerALOrdreRepris()
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    const publish = screen.getByRole("button", { name: "Publier l'album" })
    fireEvent.click(publish)
    fireEvent.click(publish)
    rerender(<AlbumComposer handle="awa" albumId="al-1" canPublish={false} onPublished={published} />)
    await act(async () => { resolveUpdate?.() })

    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer le brouillon" }).hasAttribute("disabled")).toBe(false))
    expect(nomsAppeles().filter((name) => name === "update")).toHaveLength(1)
    expect(nomsAppeles()).not.toContain("publish")
    expect(published).not.toHaveBeenCalled()
  })

  it("ne rappelle pas un ancien écran après son démontage pendant la création", async () => {
    let resolveCreate: ((value: { albumId: string; created: boolean }) => void) | undefined
    mocks.replies[`${ALBUMS}:create`] = () => new Promise((resolve) => { resolveCreate = resolve })
    const saved = vi.fn()
    const { unmount } = renderWithEngine(<AlbumComposer handle="awa" onSaved={saved} />)
    fireEvent.change(screen.getByLabelText("Titre de l'album"), { target: { value: "Brouillon" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }))
    unmount()
    await act(async () => { resolveCreate?.({ albumId: "al-1", created: true }) })

    expect(saved).not.toHaveBeenCalled()
    expect(mocks.serverRead).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})
