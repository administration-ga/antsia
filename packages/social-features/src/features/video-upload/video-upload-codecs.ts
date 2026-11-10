// Dupliqué de socle/packages/agent-features/src/features/stories/story-video-codecs.ts @ ad2e7fdc2 — adaptations : aucune dans le code (module pur, aucun libellé) ; en-tête de provenance, commentaire du contrat de lecture rapporté au réseau ; SD-03 : module renommé `video-upload-codecs` et sorti des Stories (`features/video-upload`), il sert aussi le composeur de publication.
/**
 * video-upload-codecs — QUEL codec vidéo un MP4 embarque, lu dans ses boîtes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI LIRE LES BOÎTES : LE CONTENEUR NE DIT PAS LE CODEC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le contrat d'une vidéo, Story ou publication, est « lisible par TOUS » (ADR-0079 du socle), et la politique
 * l'assure en n'envoyant TELS QUELS que les MP4/WebM. Mais `video/mp4` est un
 * CONTENEUR : un iPhone en réglage « Haute efficacité » y range du HEVC
 * (`hvc1`), que Firefox et la plupart des Chrome sous Windows ne décodent
 * pas. La sonde locale ne le voit pas — Safari et Chrome macOS décodent le
 * HEVC en matériel, donc « décodable ICI » dit vrai — et le fichier partirait
 * illisible pour la moitié de la flotte : écran « cette vidéo ne peut pas
 * être lue » chez les autres membres, alors que l'auteur, lui, la voit très bien.
 *
 * D'où cette lecture : trouver `moov`, descendre `trak → mdia → minf → stbl →
 * stsd`, et rendre le fourcc des entrées d'échantillon des pistes VIDÉO
 * (celles dont le `hdlr` dit `vide`). La POLITIQUE décide ensuite ce qui est
 * universel (`mp4CodecsRequireTranscode`, video-upload-policy.ts) — ce module
 * EXTRAIT, il ne juge pas.
 *
 * ── Fail-open, délibérément ─────────────────────────────────────────────
 * Tout ce qui ne se lit pas — boîte malformée, `moov` introuvable ou énorme,
 * aucune piste vidéo identifiable — rend `null`, jamais une erreur. Un MP4
 * exotique mais valide ne doit pas se faire refuser par NOTRE parseur : le
 * comportement d'avant (départ tel quel) reste alors la règle, et la garde
 * réelle demeure la sonde de décodage + le serveur. Ce module ne peut donc
 * que RESSERRER vers la conversion, jamais bloquer davantage.
 *
 * Aucun import DOM : les octets arrivent par un lecteur INJECTÉ (`read`), ce
 * qui rend le tout testable en node sur des tampons fabriqués. `moov` peut
 * vivre en FIN de fichier (mp4 non « faststart », l'ordinaire des exports) :
 * le lecteur par tranches évite de charger cent mégaoctets pour lire quatre
 * fourcc.
 */

/** Lit `length` octets à `offset` — `File.slice(...).arrayBuffer()` en vrai. */
export type Mp4ByteReader = (
	offset: number,
	length: number,
) => Promise<ArrayBuffer>

/** Boîtes de premier niveau parcourues au plus — un mp4 réel en a < 10. */
const MP4_SCAN_MAX_BOXES = 64

/**
 * `moov` au-delà : on renonce (fail-open). Les index d'un film de dix minutes
 * pèsent quelques mégaoctets ; trente-deux est déjà une aberration.
 */
const MP4_MOOV_MAX_BYTES = 32 * 1024 * 1024

/** Les boîtes qu'on TRAVERSE — le chemin unique vers `stsd`, rien d'autre. */
const MP4_CONTAINER_BOXES: readonly string[] = ["trak", "mdia", "minf", "stbl"]

function fourccAt(bytes: Uint8Array, offset: number): string {
	return String.fromCharCode(
		bytes[offset] ?? 0,
		bytes[offset + 1] ?? 0,
		bytes[offset + 2] ?? 0,
		bytes[offset + 3] ?? 0,
	)
}

function u32At(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] ?? 0) << 24) |
		((bytes[offset + 1] ?? 0) << 16) |
		((bytes[offset + 2] ?? 0) << 8) |
		(bytes[offset + 3] ?? 0)
	) >>> 0
}

/** Taille 64 bits en Number — les fichiers réels tiennent bien en deçà de 2^53. */
function u64At(bytes: Uint8Array, offset: number): number {
	return u32At(bytes, offset) * 0x1_0000_0000 + u32At(bytes, offset + 4)
}

interface Mp4TrackDraft {
	handler: string | null
	codecs: string[]
}

/**
 * Descend une région de `moov` et remplit les pistes rencontrées.
 *
 * `stsd` est une FullBox : version/flags (4) puis entry_count (4), puis les
 * entrées — chacune une boîte dont le TYPE est le fourcc du codec (`avc1`,
 * `hvc1`, `mp4a`…). `hdlr` aussi : version/flags (4), pre_defined (4), puis
 * handler_type (4) — `vide` désigne une piste vidéo.
 */
function walkMoovChildren(
	bytes: Uint8Array,
	start: number,
	end: number,
	track: Mp4TrackDraft | null,
	tracks: Mp4TrackDraft[],
): void {
	let offset = start
	while (offset + 8 <= end) {
		const declared = u32At(bytes, offset)
		const type = fourccAt(bytes, offset + 4)
		let headerSize = 8
		let size = declared
		if (declared === 1) {
			if (offset + 16 > end) return
			size = u64At(bytes, offset + 8)
			headerSize = 16
		} else if (declared === 0) {
			// « Jusqu'à la fin de la boîte englobante » — légal en fin de liste.
			size = end - offset
		}
		if (size < headerSize || offset + size > end) return

		if (type === "trak") {
			const draft: Mp4TrackDraft = { handler: null, codecs: [] }
			tracks.push(draft)
			walkMoovChildren(bytes, offset + headerSize, offset + size, draft, tracks)
		} else if (MP4_CONTAINER_BOXES.includes(type)) {
			walkMoovChildren(bytes, offset + headerSize, offset + size, track, tracks)
		} else if (type === "hdlr" && track !== null) {
			// version/flags (4) + pre_defined (4) → handler_type.
			if (offset + headerSize + 12 <= end) {
				track.handler = fourccAt(bytes, offset + headerSize + 8)
			}
		} else if (type === "stsd" && track !== null) {
			const payload = offset + headerSize
			if (payload + 8 <= offset + size) {
				const count = u32At(bytes, payload + 4)
				let entry = payload + 8
				for (let i = 0; i < count && entry + 8 <= offset + size; i += 1) {
					const entrySize = u32At(bytes, entry)
					if (entrySize < 8 || entry + entrySize > offset + size) break
					track.codecs.push(fourccAt(bytes, entry + 4))
					entry += entrySize
				}
			}
		}
		offset += size
	}
}

/**
 * Les fourcc des pistes VIDÉO d'une boîte `moov` complète — `null` si la
 * région ne se lit pas comme un `moov` ou n'a aucune piste vidéo identifiée
 * (l'appelant traite `null` comme « inconnu », jamais comme un refus).
 */
export function parseMoovVideoCodecs(moov: Uint8Array): readonly string[] | null {
	if (moov.length < 8) return null
	const declared = u32At(moov, 0)
	if (fourccAt(moov, 4) !== "moov") return null
	const headerSize = declared === 1 ? 16 : 8
	const tracks: Mp4TrackDraft[] = []
	walkMoovChildren(moov, headerSize, moov.length, null, tracks)
	const codecs = tracks
		.filter((track) => track.handler === "vide")
		.flatMap((track) => track.codecs)
	return codecs.length === 0 ? null : codecs
}

/**
 * Cherche `moov` dans le fichier (tête OU queue — les exports ordinaires le
 * mettent à la fin) et en tire les codecs vidéo. `null` = inconnu, fail-open.
 */
export async function sniffMp4VideoCodecs(
	read: Mp4ByteReader,
	fileSize: number,
): Promise<readonly string[] | null> {
	try {
		let offset = 0
		for (let i = 0; i < MP4_SCAN_MAX_BOXES && offset + 8 <= fileSize; i += 1) {
			const header = new Uint8Array(
				await read(offset, Math.min(16, fileSize - offset)),
			)
			if (header.length < 8) return null
			const declared = u32At(header, 0)
			const type = fourccAt(header, 4)
			let size = declared
			if (declared === 1) {
				if (header.length < 16) return null
				size = u64At(header, 8)
			} else if (declared === 0) {
				size = fileSize - offset
			}
			if (size < 8 || offset + size > fileSize) return null

			if (type === "moov") {
				if (size > MP4_MOOV_MAX_BYTES) return null
				return parseMoovVideoCodecs(new Uint8Array(await read(offset, size)))
			}
			offset += size
		}
		return null
	} catch {
		return null
	}
}
