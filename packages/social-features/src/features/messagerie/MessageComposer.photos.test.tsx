// @vitest-environment jsdom
/**
 * MessageComposer — UNE PHOTO NE PART JAMAIS BRUTE (lot PF-03).
 *
 * Toute pièce image d'iCom passe par la préparation des photos à l'admission :
 * ce qui entre au message, ce qui monte et ce que le serveur reçoit est
 * l'image préparée — sans position GPS, 2 048 px au plus, HEIC/HEIF rendus en
 * JPEG. Un échec refuse la pièce (jamais l'original) ; une image restée brute
 * dans le brouillon n'est pas téléversée.
 *
 * La préparation est la VRAIE (`prepareImageForUpload`), sur un décodeur et un
 * canvas simulés : `jsdom` n'en a pas.
 */
import { jpegHasGpsMetadata, listImageMetadata } from "@antsia/social-domain/imageMetadata"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isPreparedImage, type ImagePreparation, type PrepareImageWith } from "../media-upload"
import { renderWithEngine } from "../../tests/engine-wrapper"
import { TEST_JPEG_WITH_GPS_BYTES, testPrepareImageWith, type FakeImageRuntimeOptions } from "../../tests/image-runtime"
import { MessageComposer, type ComposerMediaDraft, type UploadedAttachment } from "./MessageComposer"
import { newMediaItem } from "./messagerie-media-draft"

vi.mock("./VoiceRecorderButton", () => ({ VoiceRecorderButton: () => null }))

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ storageId: "storage-photo" }) })))
})
afterEach(() => vi.unstubAllGlobals())

function gpsPhoto(name = "IMG_0001.jpg", type = "image/jpeg"): File {
	return new File([TEST_JPEG_WITH_GPS_BYTES as Uint8Array<ArrayBuffer>], name, { type })
}

function poser(prepareImage: PrepareImageWith, extra: Partial<Parameters<typeof MessageComposer>[0]> = {}) {
	const onSend = vi.fn<(payload: { text: string; attachments: UploadedAttachment[] }) => Promise<void>>(async () => undefined)
	const onError = vi.fn()
	const view = renderWithEngine(
		<MessageComposer
			value=""
			onChange={vi.fn()}
			placeholder="Écrire"
			ariaLabel="Message à Nadia"
			onSend={onSend}
			onError={onError}
			generateUploadUrl={async () => "adresse-de-depot-factice"}
			allowVoice={false}
			prepareImage={prepareImage}
			{...extra}
		/>,
	)
	const choose = async (...files: File[]) => {
		const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!
		await act(async () => {
			fireEvent.change(input, { target: { files } })
			await Promise.resolve()
		})
	}
	return { onSend, onError, choose }
}

function prepared(options: FakeImageRuntimeOptions = {}) {
	return testPrepareImageWith({ width: 4032, height: 3024, ...options })
}

describe("MessageComposer — les pièces image sont préparées à l'admission", () => {
	it("une photo GPS entre préparée et monte sans aucune métadonnée ; le serveur reçoit son type et son poids", async () => {
		const prepare = prepared({ output: { bytes: TEST_JPEG_WITH_GPS_BYTES, type: "image/jpeg" } })
		const original = gpsPhoto()
		const { onSend, choose } = poser(prepare)
		await choose(original)
		await waitFor(() => expect(screen.getByText("IMG_0001.jpg")).toBeDefined())
		expect(prepare.runtime.canvases).toEqual([{ width: 2048, height: 1536 }])

		fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))
		await waitFor(() => expect(onSend).toHaveBeenCalledOnce())
		const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
		const body = init.body as File
		expect(body).not.toBe(original)
		expect(isPreparedImage(body)).toBe(true)
		const sent = new Uint8Array(await body.arrayBuffer())
		expect(jpegHasGpsMetadata(sent)).toBe(false)
		expect(listImageMetadata(sent, "image/jpeg")).toEqual([])
		expect(onSend.mock.calls[0]?.[0].attachments).toEqual([
			{ storageId: "storage-photo", filename: "IMG_0001.jpg", mimeType: "image/jpeg", sizeBytes: body.size },
		])
	})

	it("une photo HEIC de l'iPhone part en JPEG nommé .jpg", async () => {
		const { onSend, choose } = poser(prepared())
		await choose(gpsPhoto("IMG_0002.HEIC", "image/heic"))
		await waitFor(() => expect(screen.getByText("IMG_0002.jpg")).toBeDefined())
		fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))
		await waitFor(() => expect(onSend).toHaveBeenCalledOnce())
		expect(onSend.mock.calls[0]?.[0].attachments[0]).toMatchObject({ filename: "IMG_0002.jpg", mimeType: "image/jpeg" })
	})

	it("un ré-encodage impossible refuse la pièce, avec sa phrase : rien n'entre, rien ne monte", async () => {
		const { onError, onSend, choose } = poser(prepared({ output: null }))
		await choose(gpsPhoto())
		await waitFor(() => expect(onError).toHaveBeenCalledWith("La préparation de « IMG_0001.jpg » a échoué : cette photo ne sera pas envoyée."))
		expect(screen.queryByText("IMG_0001.jpg")).toBeNull()
		expect(fetch).not.toHaveBeenCalled()
		expect(onSend).not.toHaveBeenCalled()
	})

	it("une photo HEIC que le navigateur ne sait pas lire est refusée, jamais envoyée brute", async () => {
		const { onError, choose } = poser(prepared({ decodeFails: true }))
		await choose(gpsPhoto("IMG_0003.heic", "image/heic"))
		await waitFor(() => expect(onError).toHaveBeenCalledWith("« IMG_0003.heic » n'a pas pu être lue : cette photo ne sera pas envoyée."))
		expect(screen.queryByText(/IMG_0003/)).toBeNull()
	})

	it("une image que le module ne sait pas préparer (SVG) est refusée à l'admission", async () => {
		const prepare = prepared()
		const { onError, choose } = poser(prepare)
		await choose(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }))
		await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("« logo.svg » n'est pas une photo que l'on peut préparer")))
		expect(prepare.runtime.decoded).toEqual([])
	})

	it("un document passe tel quel, sans préparation, et garde l'ordre du choix avec les photos", async () => {
		const prepare = prepared()
		const { onSend, choose } = poser(prepare)
		const pdf = new File(["%PDF-1.7"], "statuts.pdf", { type: "application/pdf" })
		await choose(pdf, gpsPhoto())
		await waitFor(() => expect(screen.getByText("IMG_0001.jpg")).toBeDefined())
		const chips = Array.from(document.querySelectorAll(".msg-pending-name"), (node) => node.textContent)
		expect(chips).toEqual(["statuts.pdf", "IMG_0001.jpg"])
		expect(prepare.runtime.decoded).toHaveLength(1)
		fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))
		await waitFor(() => expect(onSend).toHaveBeenCalledOnce())
		expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body).toBe(pdf)
	})

	it("pendant la préparation : l'envoi attend, la préparation est annoncée", async () => {
		let release: (value: ImagePreparation) => void = () => undefined
		const real = prepared()
		const slow: PrepareImageWith = async (file, options) => {
			const result = await real(file, options)
			return new Promise<ImagePreparation>((resolve) => {
				release = () => resolve(result)
			})
		}
		const { choose } = poser(slow, { value: "Voici la photo" })
		await choose(gpsPhoto())
		await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Préparation en cours/))
		expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(true)
		await act(async () => {
			release({ ok: false, refusal: "unreadable" })
			await Promise.resolve()
		})
		await waitFor(() => expect(screen.queryByText(/Préparation en cours/)).toBeNull())
		expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(false)
	})
})

describe("MessageComposer — une image restée brute ne monte pas", () => {
	it("une photo du brouillon qui n'est pas sortie de la préparation est refusée au téléversement", async () => {
		const brute = gpsPhoto()
		const piece = newMediaItem({ file: brute })
		const mediaDraft: ComposerMediaDraft = {
			items: [piece],
			fileOf: () => brute,
			add: vi.fn(),
			remove: vi.fn(),
			markUploaded: vi.fn(),
			markFailed: vi.fn(),
			clear: vi.fn(),
		}
		const { onError, onSend } = poser(prepared(), { mediaDraft })
		fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))
		await waitFor(() => expect(onError).toHaveBeenCalledWith("« IMG_0001.jpg » n'est pas passée par la préparation des photos : elle ne sera pas envoyée."))
		expect(fetch).not.toHaveBeenCalled()
		expect(onSend).not.toHaveBeenCalled()
		expect(mediaDraft.markFailed).toHaveBeenCalledWith(piece.localId)
	})
})
