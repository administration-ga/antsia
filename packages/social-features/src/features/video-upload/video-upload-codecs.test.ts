// Dupliqué de socle/packages/agent-features/src/features/stories/story-video-codecs.test.ts @ ad2e7fdc2 — adaptations : la politique reçoit la fonction de traduction du moteur (`t` français, mêmes fragments attendus) ; aucun cas retiré ; SD-03 : modules renommés (`video-upload-codecs`, `video-upload-policy` : `videoUploadPlan` avec les bornes d'une Story, `STORY_VIDEO_UPLOAD_LIMITS`), refus guidé sans nom de codec (« MP4 »).
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
	parseMoovVideoCodecs,
	sniffMp4VideoCodecs,
	type Mp4ByteReader,
} from "./video-upload-codecs"
import {
	MP4_UNIVERSAL_VIDEO_CODECS,
	mp4CodecsRequireTranscode,
	STORY_VIDEO_UPLOAD_LIMITS,
	videoUploadPlan,
} from "./video-upload-policy"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "stories" }).getFixedT("fr")

// ═══════════════════════════════════════════════════════════════════════════
// Fabrique de boîtes MP4 — juste assez d'ISO BMFF pour parler au parseur
// ═══════════════════════════════════════════════════════════════════════════

function u32(value: number): Uint8Array {
	return new Uint8Array([
		(value >>> 24) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 8) & 0xff,
		value & 0xff,
	])
}

function fourcc(type: string): Uint8Array {
	return new Uint8Array([...type].map((c) => c.charCodeAt(0)))
}

function concat(...parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, p) => sum + p.length, 0)
	const out = new Uint8Array(total)
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.length
	}
	return out
}

function box(type: string, ...children: Uint8Array[]): Uint8Array {
	const payload = concat(...children)
	return concat(u32(8 + payload.length), fourcc(type), payload)
}

/** `hdlr` : version/flags + pre_defined + handler_type + reserved. */
function hdlr(handler: string): Uint8Array {
	return box("hdlr", u32(0), u32(0), fourcc(handler), new Uint8Array(12))
}

/** `stsd` : version/flags + entry_count + une boîte par codec. */
function stsd(...codecs: string[]): Uint8Array {
	return box(
		"stsd",
		u32(0),
		u32(codecs.length),
		// Le corps réel d'une sample entry fait ~70 octets ; le parseur ne lit
		// que taille + fourcc, un remplissage arbitraire suffit.
		...codecs.map((codec) => box(codec, new Uint8Array(70))),
	)
}

function trak(handler: string, ...codecs: string[]): Uint8Array {
	return box(
		"trak",
		box("mdia", hdlr(handler), box("minf", box("stbl", stsd(...codecs)))),
	)
}

const FTYP = box("ftyp", fourcc("isom"), u32(512), fourcc("isom"), fourcc("mp42"))

function readerOn(bytes: Uint8Array): Mp4ByteReader {
	return (offset, length) =>
		Promise.resolve(
			bytes.slice(offset, offset + length).buffer as ArrayBuffer,
		)
}

// ═══════════════════════════════════════════════════════════════════════════

describe("parseMoovVideoCodecs — lire le codec sous le conteneur", () => {
	it("rend le fourcc de la piste vidéo (H.264)", () => {
		expect(parseMoovVideoCodecs(box("moov", trak("vide", "avc1")))).toEqual([
			"avc1",
		])
	})

	it("rend le HEVC d'un iPhone « Haute efficacité »", () => {
		expect(parseMoovVideoCodecs(box("moov", trak("vide", "hvc1")))).toEqual([
			"hvc1",
		])
	})

	it("ignore les pistes audio — seul `hdlr: vide` compte", () => {
		expect(
			parseMoovVideoCodecs(
				box("moov", trak("soun", "mp4a"), trak("vide", "avc1")),
			),
		).toEqual(["avc1"])
	})

	it("aucune piste vidéo → null (inconnu), jamais un jugement", () => {
		expect(parseMoovVideoCodecs(box("moov", trak("soun", "mp4a")))).toBe(null)
	})

	it("des octets quelconques → null, sans lever", () => {
		expect(parseMoovVideoCodecs(new Uint8Array(64))).toBe(null)
		expect(parseMoovVideoCodecs(new Uint8Array(3))).toBe(null)
		expect(parseMoovVideoCodecs(box("mdat", new Uint8Array(24)))).toBe(null)
	})
})

describe("sniffMp4VideoCodecs — trouver `moov` où qu'il vive", () => {
	it("moov en tête (faststart)", async () => {
		const file = concat(FTYP, box("moov", trak("vide", "avc1")), box("mdat"))
		expect(await sniffMp4VideoCodecs(readerOn(file), file.length)).toEqual([
			"avc1",
		])
	})

	it("moov en QUEUE — l'ordinaire des exports", async () => {
		const file = concat(
			FTYP,
			box("mdat", new Uint8Array(4096)),
			box("moov", trak("vide", "hvc1")),
		)
		expect(await sniffMp4VideoCodecs(readerOn(file), file.length)).toEqual([
			"hvc1",
		])
	})

	it("saute une boîte à taille 64 bits (size=1 + largesize)", async () => {
		const mdatPayload = new Uint8Array(256)
		const bigMdat = concat(
			u32(1),
			fourcc("mdat"),
			u32(0),
			u32(16 + mdatPayload.length),
			mdatPayload,
		)
		const file = concat(FTYP, bigMdat, box("moov", trak("vide", "avc1")))
		expect(await sniffMp4VideoCodecs(readerOn(file), file.length)).toEqual([
			"avc1",
		])
	})

	it("un fichier qui n'est pas un mp4 → null, vite et sans erreur", async () => {
		// Du EBML (WebM) : la première « taille » lue est du bruit — les bornes
		// coupent court.
		const webm = concat(
			new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
			new Uint8Array(512),
		)
		expect(await sniffMp4VideoCodecs(readerOn(webm), webm.length)).toBe(null)
	})

	it("un lecteur qui lève → null (fail-open), jamais une exception", async () => {
		const broken: Mp4ByteReader = () => Promise.reject(new Error("io"))
		expect(await sniffMp4VideoCodecs(broken, 1024)).toBe(null)
	})
})

describe("mp4CodecsRequireTranscode — la frontière de l'universel", () => {
	it("H.264 part tel quel ; HEVC, AV1 et VP9-en-MP4 se convertissent", () => {
		expect(MP4_UNIVERSAL_VIDEO_CODECS).toEqual(["avc1", "avc3"])
		expect(mp4CodecsRequireTranscode(["avc1"])).toBe(false)
		expect(mp4CodecsRequireTranscode(["avc3"])).toBe(false)
		expect(mp4CodecsRequireTranscode(["hvc1"])).toBe(true)
		expect(mp4CodecsRequireTranscode(["hev1"])).toBe(true)
		expect(mp4CodecsRequireTranscode(["av01"])).toBe(true)
		expect(mp4CodecsRequireTranscode(["vp09"])).toBe(true)
		// Une seule piste non universelle suffit — elle sera l'écran noir.
		expect(mp4CodecsRequireTranscode(["avc1", "hvc1"])).toBe(true)
	})

	it("codecs inconnus → fail-open, le départ direct d'avant reste la règle", () => {
		expect(mp4CodecsRequireTranscode(null)).toBe(false)
		expect(mp4CodecsRequireTranscode(undefined)).toBe(false)
		expect(mp4CodecsRequireTranscode([])).toBe(false)
	})
})

describe("videoUploadPlan — le MP4 HEVC route vers la conversion", () => {
	const PROBE = { decodable: true, durationMs: 60_000 }
	const TARGETS = ["video/webm;codecs=vp9"]

	it("MP4 H.264 prouvé → départ tel quel", () => {
		const plan = videoUploadPlan({
			limits: STORY_VIDEO_UPLOAD_LIMITS,
			fileName: "visite.mp4",
			mimeType: "video/mp4",
			probe: PROBE,
			recorderTargets: TARGETS,
			containerCodecs: ["avc1"],
		}, t)
		expect(plan.action).toBe("upload")
	})

	it("MP4 HEVC prouvé → conversion, comme un .mov", () => {
		const plan = videoUploadPlan({
			limits: STORY_VIDEO_UPLOAD_LIMITS,
			fileName: "iphone-hevc.mp4",
			mimeType: "video/mp4",
			probe: PROBE,
			recorderTargets: TARGETS,
			containerCodecs: ["hvc1"],
		}, t)
		expect(plan.action).toBe("transcode")
	})

	it("MP4 aux codecs illisibles → fail-open, départ tel quel", () => {
		const plan = videoUploadPlan({
			limits: STORY_VIDEO_UPLOAD_LIMITS,
			fileName: "exotique.mp4",
			mimeType: "video/mp4",
			probe: PROBE,
			recorderTargets: TARGETS,
			containerCodecs: null,
		}, t)
		expect(plan.action).toBe("upload")
	})

	it("le WebM ignore les codecs — décision au mime, comme avant", () => {
		const plan = videoUploadPlan({
			limits: STORY_VIDEO_UPLOAD_LIMITS,
			fileName: "clip.webm",
			mimeType: "video/webm",
			probe: PROBE,
			recorderTargets: TARGETS,
			containerCodecs: ["hvc1"],
		}, t)
		expect(plan.action).toBe("upload")
	})

	it("HEVC trop long à convertir → refus qui dit quoi faire", () => {
		const plan = videoUploadPlan({
			limits: STORY_VIDEO_UPLOAD_LIMITS,
			fileName: "long-hevc.mp4",
			mimeType: "video/mp4",
			probe: { decodable: true, durationMs: 4 * 60_000 },
			recorderTargets: TARGETS,
			containerCodecs: ["hvc1"],
		}, t)
		expect(plan.action).toBe("refuse")
		if (plan.action === "refuse") {
			expect(plan.error).toContain("MP4")
		}
	})
})
