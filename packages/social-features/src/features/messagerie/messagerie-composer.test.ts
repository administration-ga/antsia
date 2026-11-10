// Dupliqué de socle/packages/agent-features/src/features/messagerie/messagerie-composer.test.ts @ ad2e7fdc2 — adaptations : `formatBytes` et `attachmentRejection` reçoivent la langue (`locale`) et la traduction (`t`) — les cas les appellent comme l'écran français et attendent le texte exact du socle ; le plafond de « `use-chat-attachments` » cité comme le hook recopié du paquet ; un cas ajouté : poids et refus suivent la langue (anglais).
import { describe, expect, it } from "vitest"
import { createAppI18n } from "../../i18n"
import {
	attachmentNeedsPhotoPreparation,
	attachmentKind,
	attachmentRejection as attachmentRejectionT,
	ATTACHMENTS_MAX_PER_MESSAGE,
	ATTACHMENT_MAX_BYTES,
	canSend,
	composerMode,
	formatBytes as formatBytesT,
	MESSAGE_ATTACHMENT_ACCEPT,
	voiceDurationFor,
} from "./messagerie-composer"

const fr = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" }).getFixedT("fr")
const en = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" }).getFixedT("en")

/** Les deux fonctions telles que l'écran français les appelle. */
function formatBytes(bytes: number): string {
	return formatBytesT(bytes, "fr", fr)
}
function attachmentRejection(args: Parameters<typeof attachmentRejectionT>[0]): string | null {
	return attachmentRejectionT(args, "fr", fr)
}

describe("MESSAGE_ATTACHMENT_ACCEPT", () => {
	it("accepte les trois familles de média en LARGE", () => {
		expect(MESSAGE_ATTACHMENT_ACCEPT).toContain("image/*")
		expect(MESSAGE_ATTACHMENT_ACCEPT).toContain("video/*")
		expect(MESSAGE_ATTACHMENT_ACCEPT).toContain("audio/*")
	})

	it("n'ouvre PAS `application/*` — un exécutable n'est pas une pièce", () => {
		expect(MESSAGE_ATTACHMENT_ACCEPT).not.toContain("application/*")
	})

	it("énumère quand même le PDF et la bureautique", () => {
		expect(MESSAGE_ATTACHMENT_ACCEPT).toContain("application/pdf")
		expect(MESSAGE_ATTACHMENT_ACCEPT).toContain(".docx")
	})
})

describe("attachmentKind", () => {
	it("reconnaît une image par son préfixe, sous-type compris", () => {
		expect(attachmentKind("image/png")).toBe("image")
		expect(attachmentKind("image/heic")).toBe("image")
	})

	it("reconnaît une vidéo", () => {
		expect(attachmentKind("video/mp4")).toBe("video")
	})

	it("reconnaît un son, paramètres de codec compris", () => {
		expect(attachmentKind("audio/mp4")).toBe("audio")
		expect(attachmentKind("audio/webm;codecs=opus")).toBe("audio")
	})

	it("ignore la casse", () => {
		expect(attachmentKind("IMAGE/PNG")).toBe("image")
	})

	it("retombe sur « fichier » — le rendu qui ne peut pas échouer", () => {
		expect(attachmentKind("application/pdf")).toBe("file")
		expect(attachmentKind("")).toBe("file")
		expect(attachmentKind(null)).toBe("file")
		expect(attachmentKind(undefined)).toBe("file")
	})
})

describe("canSend", () => {
	it("s'allume sur du texte", () => {
		expect(canSend({ text: "bonjour", attachmentCount: 0, uploading: false })).toBe(
			true,
		)
	})

	it("s'allume sur une pièce SEULE — photo sans légende, vocal", () => {
		expect(canSend({ text: "", attachmentCount: 1, uploading: false })).toBe(true)
	})

	it("reste éteint sur du blanc seul", () => {
		expect(canSend({ text: "   \n ", attachmentCount: 0, uploading: false })).toBe(
			false,
		)
	})

	it("s'éteint pendant un téléversement, même avec du texte", () => {
		expect(canSend({ text: "bonjour", attachmentCount: 2, uploading: true })).toBe(
			false,
		)
	})

	it("ignore un décompte de pièces non fini", () => {
		expect(
			canSend({ text: "", attachmentCount: Number.NaN, uploading: false }),
		).toBe(false)
	})
})

describe("composerMode — l'idiome du micro", () => {
	it("propose le MICRO quand tout est vide", () => {
		expect(composerMode({ text: "", attachmentCount: 0 })).toBe("voice")
		expect(composerMode({ text: "  ", attachmentCount: 0 })).toBe("voice")
	})

	it("bascule sur l'ENVOI dès qu'on écrit", () => {
		expect(composerMode({ text: "a", attachmentCount: 0 })).toBe("send")
	})

	it("bascule sur l'ENVOI dès qu'une pièce est jointe, sans un mot", () => {
		expect(composerMode({ text: "", attachmentCount: 1 })).toBe("send")
	})
})

describe("les bornes viennent du SERVEUR, pas du hook partagé", () => {
	it("plafonne à 25 Mo, la borne du serveur (et non celle d'un hook local)", () => {
		expect(ATTACHMENT_MAX_BYTES).toBe(25 * 1024 * 1024)
	})

	it("plafonne à cinq pièces par message", () => {
		expect(ATTACHMENTS_MAX_PER_MESSAGE).toBe(5)
	})
})

describe("attachmentRejection — refuser AVANT de téléverser", () => {
	const fichier = (size: number, name = "photo.jpg", type = "image/jpeg") => ({
		name,
		size,
		type,
	})

	it("accepte un fichier sous la borne", () => {
		expect(
			attachmentRejection({ file: fichier(2_000_000), alreadyPending: 0 }),
		).toBeNull()
	})

	it("accepte un fichier À la borne exacte", () => {
		expect(
			attachmentRejection({
				file: fichier(ATTACHMENT_MAX_BYTES),
				alreadyPending: 0,
			}),
		).toBeNull()
	})

	it("refuse un fichier de 30 Mo, que le hook partagé aurait laissé passer", () => {
		const raison = attachmentRejection({
			file: fichier(30 * 1024 * 1024, "video.mp4", "video/mp4"),
			alreadyPending: 0,
		})
		expect(raison).not.toBeNull()
		expect(raison).toContain("video.mp4")
		expect(raison).toContain("25 Mo")
	})

	it("refuse un fichier vide", () => {
		expect(
			attachmentRejection({ file: fichier(0), alreadyPending: 0 }),
		).toContain("vide")
	})

	it("compte ce qui est DÉJÀ dans le composeur, pas seulement l'ajout", () => {
		expect(
			attachmentRejection({
				file: fichier(1_000),
				alreadyPending: ATTACHMENTS_MAX_PER_MESSAGE,
			}),
		).toContain("5 pièces jointes")
	})

	it("laisse passer la cinquième pièce, refuse la sixième", () => {
		expect(
			attachmentRejection({ file: fichier(1_000), alreadyPending: 4 }),
		).toBeNull()
		expect(
			attachmentRejection({ file: fichier(1_000), alreadyPending: 5 }),
		).not.toBeNull()
	})
})

describe("voiceDurationFor — ne joindre une durée que si le serveur l'accepte", () => {
	it("joint la durée sur un conteneur reconnu", () => {
		expect(voiceDurationFor("audio/mp4", 4_200)).toBe(4_200)
	})

	it("ignore les paramètres de codec, comme le serveur", () => {
		expect(voiceDurationFor("audio/webm;codecs=opus", 1_500)).toBe(1_500)
	})

	it("N'ENVOIE PAS de durée sur un conteneur hors liste — l'envoi échouerait", () => {
		expect(voiceDurationFor("audio/x-exotique", 4_200)).toBeUndefined()
		expect(voiceDurationFor("video/mp4", 4_200)).toBeUndefined()
	})

	it("ignore une durée nulle, négative ou non finie", () => {
		expect(voiceDurationFor("audio/mp4", 0)).toBeUndefined()
		expect(voiceDurationFor("audio/mp4", -1)).toBeUndefined()
		expect(voiceDurationFor("audio/mp4", Number.NaN)).toBeUndefined()
	})

	it("arrondit — le serveur attend un entier de millisecondes", () => {
		expect(voiceDurationFor("audio/mp4", 4_200.7)).toBe(4_201)
	})
})

describe("formatBytes", () => {
	it("nomme les octets, kilo-octets et méga-octets", () => {
		expect(formatBytes(512)).toBe("512 o")
		expect(formatBytes(310 * 1024)).toBe("310 ko")
		expect(formatBytes(ATTACHMENT_MAX_BYTES)).toBe("25 Mo")
	})

	it("utilise la virgule décimale française", () => {
		expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 Mo")
	})

	it("ne rend jamais un poids négatif", () => {
		expect(formatBytes(-10)).toBe("0 o")
		expect(formatBytes(Number.NaN)).toBe("0 o")
	})
})

describe("la langue de l'écran", () => {
	it("dit les poids et les refus dans la langue courante", () => {
		expect(formatBytesT(1.5 * 1024 * 1024, "en", en)).toBe("1.5 MB")
		expect(formatBytesT(310 * 1024, "en", en)).toBe("310 KB")
		expect(formatBytesT(512, "en", en)).toBe("512 B")
		const raison = attachmentRejectionT(
			{ file: { name: "video.mp4", size: 30 * 1024 * 1024, type: "video/mp4" }, alreadyPending: 0 },
			"en",
			en,
		)
		expect(raison).toContain("video.mp4")
		expect(raison).toContain("25 MB")
	})
})

describe("attachmentNeedsPhotoPreparation — toute pièce image passe par la préparation (PF-03)", () => {
	it("les photos, HEIC compris, et toute autre image ; ni les documents, ni les sons, ni les vidéos", () => {
		for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/svg+xml", " IMAGE/JPEG "]) {
			expect(attachmentNeedsPhotoPreparation(type)).toBe(true)
		}
		for (const type of ["application/pdf", "audio/webm", "video/mp4", "text/plain", ""]) {
			expect(attachmentNeedsPhotoPreparation(type)).toBe(false)
		}
	})
})
