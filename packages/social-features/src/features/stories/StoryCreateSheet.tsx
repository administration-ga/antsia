// Dupliqué de socle/packages/agent-features/src/features/stories/StoryCreateSheet.tsx @ ad2e7fdc2 — adaptations : branché sur `stories.stories.publish` et `media.media.generateUploadUrl` (usage `story_media`) du moteur, réseau de `useNetwork()` ; champ « Où l'afficher », origine du composeur (propriété `origin`) et invite croisée retirés avec les surfaces (ADR-0079 du socle) — le moteur n'a qu'une surface et une seule borne vidéo ; audiences lues dans `AUDIENCE_OPTIONS` du réseau par leurs clés ; libellés, refus et toasts traduits (clés `stories:storyCreateSheet.*`), refus du moteur dits par leur code (`storyEngineErrorText`) ; pourcentage de conversion mis en forme par `Intl` dans la langue courante.
"use client"

/**
 * StoryCreateSheet — publier une story : une photo ou une vidéo, une légende
 * facultative, une audience.
 *
 * ⚠️ La vidéo a ses BORNES (`STORY_VIDEO_LIMITS`, domaine du moteur) : le
 * fichier est jugé au moment du choix (`storyDraftFrom` / `storyVideoPlan`),
 * et le serveur, qui relit le stockage, reste l'arbitre.
 *
 * ⚠️ `ImmersiveOverlay` et non un `Sheet`, pour la même raison que
 * `PostComposerSheet` : cet écran porte un champ de saisie, et le clavier
 * prend la moitié de la hauteur. Seule la surface immersive suit
 * `visualViewport` — une feuille calée sur `dvh` placerait « Publier » derrière
 * le clavier.
 *
 * ── DEUX entrées de fichier, et ce n'est pas un doublon ─────────────────────
 * `capture="user"` demande au système l'APPAREIL PHOTO ; sans l'attribut, le
 * même contrôle ouvre la GALERIE. Un seul bouton obligerait à choisir pour
 * tout le monde : au téléphone, une story se prend sur le moment ; au bureau,
 * `capture` est ignoré et l'entrée caméra retomberait sur un sélecteur de
 * fichiers — d'où les deux, la caméra en premier au téléphone.
 *
 * ── Une clé par INTENTION ─────────────────────────────────────────────────
 * Même fichier, légende et audience : un renvoi conserve la clé et le média
 * déjà téléversé. Changer ces éléments crée une nouvelle intention. La clé
 * et le brouillon restent en mémoire pour le seul acteur du réseau courant.
 *
 * ⚠️ L'aperçu passe par `URL.createObjectURL` sur le fichier LOCAL, et l'URL
 * est RÉVOQUÉE au remplacement comme au démontage : sans cela, une session de
 * composition fuit la mémoire du navigateur (même précaution que
 * `useMediaDraft`).
 */

import { api, type Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { STORY_CAPTION_MAX_LENGTH } from "@antsia/social-domain/stories"
import { Alert, Button, Field, Select, TextArea } from "@antsia/ui"
import { ImmersiveOverlay, useIsReseauMobile } from "@antsia/ui/overlay"
import { useMutation } from "convex/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
	AUDIENCE_OPTIONS,
	DEFAULT_AUDIENCE,
	type ReachAudience,
} from "../reseau-personnel/shared"
import { StoriesStyles } from "./stories-styles"
import { retainStorySubmissionIntent, type StorySubmissionIntent } from "./story-submission-intent"
import {
	canPublishStory,
	evaluateStoryCaption,
	isStoryDraftReady,
	STORY_ACCEPT,
	storyComposePose,
	storyDraftFrom,
	storyEngineErrorText,
	type StoryDraft,
} from "./story-create"
import {
	STORY_TRANSCODE_TARGETS,
	storyVideoPlan,
} from "./story-video-policy"
import {
	probeVideoFile,
	sniffFileMp4VideoCodecs,
	transcodeVideo,
} from "./story-video-probe"

/** Le marqueur d'un téléversement refusé par le stockage (jamais affiché). */
const UPLOAD_FAILED = "upload"

function newIdempotencyKey(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `story-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface StoryCreateSheetProps {
	open: boolean
	onClose: () => void
	/** Appelé APRÈS une publication réussie, jamais sur échec ni annulation. */
	onPublished?: () => void
}

export function StoryCreateSheet({
	open,
	onClose,
	onPublished,
}: StoryCreateSheetProps) {
	const { t } = useTranslation("stories")
	const { networkId, personId } = useNetwork()
	// La POSE (décision pure `storyComposePose`) : plein écran au téléphone —
	// le clavier exige la surface immersive et son `--kb-inset` — et carte
	// flottante COMPACTE au bureau, sur le voile (`scrim`), comme le lecteur.
	const mobile = useIsReseauMobile()
	const pose = storyComposePose(mobile)
	const form = <StoryCreateForm key={`${networkId}:${personId}`} onClose={onClose} onPublished={onPublished} />
	return (
		<ImmersiveOverlay
			open={open}
			onClose={onClose}
			label={t("storyCreateSheet.title")}
			scrim={pose === "card"}
		>
			{/* La feuille se monte ICI et pas seulement dans le lecteur : le
			    composeur s'ouvre aussi depuis la barre du fil et les Actus
			    d'iCom, sans StoriesViewerPage — React 19 dédoublonne par href. */}
			<StoriesStyles />
			{pose === "card" ? (
				<div className="st-viewer">
					<div className="st-compose-frame">{form}</div>
				</div>
			) : (
				form
			)}
		</ImmersiveOverlay>
	)
}

function StoryCreateForm({
	onClose,
	onPublished,
}: {
	onClose: () => void
	onPublished?: () => void
}) {
	const { t, i18n } = useTranslation("stories")
	const { networkId } = useNetwork()
	const [file, setFile] = useState<File | null>(null)
	const [draft, setDraft] = useState<StoryDraft | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [caption, setCaption] = useState("")
	const [audience, setAudience] = useState<ReachAudience>(DEFAULT_AUDIENCE)
	const [submitting, setSubmitting] = useState(false)
	const submitLock = useRef(false)
	const alive = useRef(true)
	const uploadAbort = useRef<AbortController | null>(null)
	// Une intention précise, en mémoire seulement : retry = même clé et même
	// dépôt ; un autre fichier, texte ou audience crée une autre intention.
	const intent = useRef<StorySubmissionIntent<Id<"_storage">> | null>(null)
	/** La durée RÉELLE de la vidéo (sonde ou conversion) — part dans `publish`. */
	const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null)
	/** La préparation vidéo en cours — le brouillon reste nul tant qu'elle dure. */
	const [videoPrep, setVideoPrep] = useState<
		null | { phase: "sonde" } | { phase: "conversion"; progress: number }
	>(null)
	// La garde anti-course : choisir un AUTRE fichier pendant qu'une sonde ou
	// une conversion tourne rend le résultat de la première caduc.
	const prepToken = useRef(0)

	const cameraInput = useRef<HTMLInputElement>(null)
	const galleryInput = useRef<HTMLInputElement>(null)
	// Les URLs vivantes, pour les révoquer même si l'écran part sans passer par
	// le remplacement (navigation, erreur de rendu).
	const liveUrls = useRef(new Set<string>())

	useEffect(() => {
		alive.current = true
		const urls = liveUrls.current
		return () => {
			alive.current = false
			prepToken.current += 1
			uploadAbort.current?.abort()
			intent.current = null
			for (const url of urls) URL.revokeObjectURL(url)
			urls.clear()
		}
	}, [])

	const publish = useMutation(api.modules.stories.stories.publish)
	const generateUploadUrl = useMutation(api.modules.media.media.generateUploadUrl)

	const captionState = evaluateStoryCaption(caption)
	const canSubmit = canPublishStory(draft, audience, { caption, submitting })
	const audienceHintKey = AUDIENCE_OPTIONS.find(
		(option) => option.value === audience,
	)?.hintKey

	const releaseUrl = (url: string) => {
		URL.revokeObjectURL(url)
		liveUrls.current.delete(url)
	}

	/**
	 * La PRÉPARATION d'une vidéo — sonde, politique, conversion (« on doit
	 * pouvoir tout lire ») : le brouillon reste NUL tant qu'elle tourne (bouton
	 * éteint), et le fichier qui part au stockage est TOUJOURS un MP4/WebM —
	 * celui d'origine, ou le converti.
	 */
	const prepareVideo = async (chosen: File, token: number) => {
		const sourceUrl = URL.createObjectURL(chosen)
		liveUrls.current.add(sourceUrl)
		setVideoPrep({ phase: "sonde" })
		try {
			const probe = await probeVideoFile(sourceUrl)
			if (token !== prepToken.current) return
			// Un MP4 se regarde SOUS le conteneur : l'iPhone « Haute efficacité »
			// y range du HEVC, décodable ici (matériel Apple) et illisible chez
			// la moitié des membres. Le sniff lit quelques kilooctets ; la
			// politique route alors vers la conversion au lieu du départ direct.
			const containerCodecs =
				chosen.type.split(";")[0]?.trim() === "video/mp4"
					? await sniffFileMp4VideoCodecs(chosen)
					: null
			if (token !== prepToken.current) return
			const plan = storyVideoPlan(
				{
					fileName: chosen.name,
					mimeType: chosen.type,
					probe,
					containerCodecs,
					recorderTargets: STORY_TRANSCODE_TARGETS.filter(
						(target) =>
							typeof MediaRecorder !== "undefined" &&
							MediaRecorder.isTypeSupported(target),
					),
				},
				t,
			)
			if (plan.action === "refuse") {
				releaseUrl(sourceUrl)
				setVideoPrep(null)
				setDraft({ error: plan.error })
				return
			}
			if (plan.action === "upload") {
				setVideoPrep(null)
				setDraft({ kind: "video" })
				setFile(chosen)
				setPreviewUrl(sourceUrl)
				setVideoDurationMs(plan.durationMs ?? null)
				return
			}
			setVideoPrep({ phase: "conversion", progress: 0 })
			const result = await transcodeVideo(
				sourceUrl,
				{
					targetMime: plan.targetMime,
					videoBitsPerSecond: plan.videoBitsPerSecond,
					hardStopMs: plan.hardStopMs,
				},
				(fraction) => {
					if (token === prepToken.current) {
						setVideoPrep({ phase: "conversion", progress: fraction })
					}
				},
			)
			if (token !== prepToken.current) return
			releaseUrl(sourceUrl)
			const converted = new File(
				[result.blob],
				result.mimeType === "video/mp4" ? "actu.mp4" : "actu.webm",
				{ type: result.mimeType },
			)
			// Le débit visé n'est pas un débit TENU : `MediaRecorder` dépasse sur
			// les scènes chargées. Le converti repasse donc par le même contrôle
			// que le fichier d'origine — sans quoi le refus tomberait au
			// téléversement, après l'attente de la conversion.
			const convertedVerdict = storyDraftFrom(converted, t)
			if (!isStoryDraftReady(convertedVerdict)) {
				setVideoPrep(null)
				setDraft({
					error: t("storyCreateSheet.convertedTooLarge", {
						reason: convertedVerdict.error,
					}),
				})
				return
			}
			const url = URL.createObjectURL(converted)
			liveUrls.current.add(url)
			setVideoPrep(null)
			setDraft(convertedVerdict)
			setFile(converted)
			setPreviewUrl(url)
			setVideoDurationMs(result.durationMs)
		} catch {
			if (token !== prepToken.current) return
			releaseUrl(sourceUrl)
			setVideoPrep(null)
			setDraft({ error: t("storyCreateSheet.conversionFailed") })
		}
	}

	const accept = (chosen: File | undefined) => {
		if (chosen === undefined || submitLock.current || !alive.current) return
		const token = ++prepToken.current
		// L'aperçu précédent part AVANT que le suivant n'arrive : garder les deux
		// est exactement la fuite que `useMediaDraft` documente.
		if (previewUrl !== null) releaseUrl(previewUrl)
		setVideoDurationMs(null)
		setVideoPrep(null)
		const verdict = storyDraftFrom(chosen, t)
		if (!isStoryDraftReady(verdict)) {
			setDraft(verdict)
			setFile(null)
			setPreviewUrl(null)
			return
		}
		if (verdict.kind === "image") {
			setDraft(verdict)
			const url = URL.createObjectURL(chosen)
			liveUrls.current.add(url)
			setFile(chosen)
			setPreviewUrl(url)
			return
		}
		// Une VIDÉO passe par la préparation : brouillon nul en attendant.
		setDraft(null)
		setFile(null)
		setPreviewUrl(null)
		void prepareVideo(chosen, token)
	}

	const handleSubmit = async () => {
		if (submitLock.current || !alive.current || !canSubmit || file === null || !isStoryDraftReady(draft)) return
		submitLock.current = true
		intent.current = retainStorySubmissionIntent(intent.current, { file, caption, audience }, newIdempotencyKey)
		const submission = intent.current
		setSubmitting(true)
		try {
			if (submission.storageId === null) {
				const uploadUrl = await generateUploadUrl({ networkId, usage: "story_media" })
				if (!alive.current) return
				const controller = new AbortController()
				uploadAbort.current = controller
				const response = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": file.type },
					body: file,
					signal: controller.signal,
				})
				if (!response.ok) throw new Error(UPLOAD_FAILED)
				const result: unknown = await response.json()
				if (!alive.current) return
				if (!result || typeof result !== "object" || !("storageId" in result) || typeof result.storageId !== "string") throw new Error(UPLOAD_FAILED)
				submission.storageId = result.storageId as Id<"_storage">
			}
			if (!alive.current) return
			const storageId = submission.storageId
			if (storageId === null) return

			await publish({
				networkId,
				media: {
					storageId,
					kind: draft.kind,
					// DÉCLARÉS, puis recoupés par le serveur avec les métadonnées
					// réelles du stockage. On les envoie parce que la mutation les
					// attend, pas parce qu'ils font foi. La DURÉE, elle, fait foi :
					// le stockage ne la connaît pas — c'est la sonde ou la
					// conversion qui l'a mesurée, et sans elle toute vidéo serait
					// coupée à cinq secondes de lecture.
					mimeType: file.type,
					sizeBytes: file.size,
					...(draft.kind === "video" && videoDurationMs !== null
						? { durationMs: Math.round(videoDurationMs) }
						: {}),
				},
				...(caption.trim().length > 0 ? { caption: caption.trim() } : {}),
				audience,
				idempotencyKey: submission.key,
			})

			if (!alive.current) return
			intent.current = null
			toast.success(t("storyCreateSheet.published"))
			onPublished?.()
			onClose()
		} catch (error) {
			if (!alive.current) return
			// La clé n'est PAS renouvelée sur échec : c'est ce qui rend le renvoi
			// sûr — le serveur reconnaîtra le rejeu au lieu de publier deux fois.
			toast.error(
				error instanceof Error && error.message !== UPLOAD_FAILED
					? storyEngineErrorText(error, "stories:storyCreateSheet.publishFailed", t)
					: t("storyCreateSheet.uploadFailed"),
			)
		} finally {
			submitLock.current = false
			uploadAbort.current = null
			if (alive.current) setSubmitting(false)
		}
	}

	return (
		<>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
					padding: "10px 12px",
					borderBottom: "1px solid var(--border)",
				}}
			>
				<p
					style={{
						margin: 0,
						fontSize: 16,
						fontWeight: 700,
						color: "var(--foreground)",
					}}
				>
					{t("storyCreateSheet.title")}
				</p>
				{/* Une sortie VISIBLE en plus d'Échap : au téléphone il n'y a pas de
				    touche Échap, et le geste « retour » du système quitte la page. */}
				<Button variant="ghost" size="sm" icon="x" onClick={onClose}>
					{t("storyCreateSheet.close")}
				</Button>
			</div>

			<div
				style={{
					flex: "1 1 auto",
					minHeight: 0,
					overflowY: "auto",
					overscrollBehavior: "contain",
					display: "flex",
					flexDirection: "column",
					gap: 14,
					padding: 12,
					// La place que le clavier prend en bas, publiée par
					// `useVisualViewport` : sans elle, « Publier » reste dessous.
					paddingBottom: "calc(12px + var(--kb-inset, 0px))",
				}}
			>
				{draft !== null && !isStoryDraftReady(draft) ? (
					<Alert tone="danger" title={t("storyCreateSheet.refused")}>
						<p style={{ margin: 0 }}>{draft.error}</p>
					</Alert>
				) : null}

				{/* Les deux entrées. Elles sont HORS de l'écran mais jamais
				    `display:none` : un input masqué de cette façon n'est plus
				    déclenchable par `click()` dans certains moteurs. */}
				<input
					ref={cameraInput}
					type="file"
					accept={STORY_ACCEPT}
					capture="user"
					disabled={submitting}
					className="sr-only"
					onChange={(event) => accept(event.target.files?.[0])}
				/>
				<input
					ref={galleryInput}
					disabled={submitting}
					type="file"
					accept={STORY_ACCEPT}
					className="sr-only"
					onChange={(event) => accept(event.target.files?.[0])}
				/>

				<div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
					<Button
						variant="secondary"
						icon="camera"
						disabled={submitting}
						onClick={() => cameraInput.current?.click()}
					>
						{t("storyCreateSheet.takePhoto")}
					</Button>
					<Button
						variant="secondary"
						icon="image"
						disabled={submitting}
						onClick={() => galleryInput.current?.click()}
					>
						{t("storyCreateSheet.chooseFromGallery")}
					</Button>
				</div>

				{/* La préparation vidéo — sonde puis conversion éventuelle. Le
				    pourcentage se COMPTE : chasse fixe, signature de l'espace. */}
				{videoPrep !== null ? (
					<p
						role="status"
						style={{
							margin: 0,
							fontSize: 12.5,
							color: "var(--muted-foreground)",
						}}
					>
						{videoPrep.phase === "sonde" ? (
							t("storyCreateSheet.probing")
						) : (
							<>
								{t("storyCreateSheet.converting")}{" "}
								<span style={{ fontFamily: "var(--font-mono)" }}>
									{new Intl.NumberFormat(i18n.language, {
										style: "percent",
										maximumFractionDigits: 0,
									}).format(videoPrep.progress)}
								</span>
								<span style={{ display: "block" }}>
									{t("storyCreateSheet.keepTabVisible")}
								</span>
							</>
						)}
					</p>
				) : null}

				{previewUrl !== null && isStoryDraftReady(draft) ? (
					<div
						className="esp-story-stage"
						style={{
							position: "relative",
							overflow: "hidden",
							borderRadius: 14,
							aspectRatio: "9 / 16",
							maxHeight: "46dvh",
							margin: "0 auto",
						}}
					>
						{draft.kind === "video" ? (
							<video
								className="st-media"
								src={previewUrl}
								playsInline
								muted
								autoPlay
								loop
							/>
						) : (
							// eslint-disable-next-line @next/next/no-img-element -- aperçu local révocable : object URL du fichier, jamais un média distant à optimiser via Next.
							<img
								className="st-media"
								src={previewUrl}
								alt={t("storyCreateSheet.previewAlt")}
							/>
						)}
					</div>
				) : null}

				<Field label={t("storyCreateSheet.captionLabel")} htmlFor="story-caption">
					<TextArea
						id="story-caption"
						disabled={submitting}
						value={caption}
						onChange={(event) => setCaption(event.target.value)}
						rows={2}
						// Marge au-delà de la borne : couper la saisie à l'exact
						// empêche de voir son dépassement pour le corriger (même
						// règle que `PostComposer`).
						maxLength={STORY_CAPTION_MAX_LENGTH + 80}
						placeholder={t("storyCreateSheet.captionPlaceholder")}
					/>
					{/* Ce qui se COMPTE se lit en chasse fixe — signature
					    typographique de l'espace. */}
					<p
						style={{
							margin: "2px 2px 0",
							fontFamily: "var(--font-mono)",
							fontSize: 11.5,
							color: captionState.tooLong
								? "var(--destructive)"
								: "var(--muted-foreground)",
						}}
					>
						{t("storyCreateSheet.charactersLeft", {
							count: captionState.remaining,
						})}
					</p>
				</Field>

				<Field
					label={t("storyCreateSheet.audienceLabel")}
					htmlFor="story-audience"
					hint={audienceHintKey !== undefined ? t(audienceHintKey) : undefined}
				>
					<Select
						id="story-audience"
						disabled={submitting}
						value={audience}
						onChange={(event) =>
							setAudience(event.target.value as ReachAudience)
						}
					>
						{AUDIENCE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{t(option.labelKey)}
							</option>
						))}
					</Select>
				</Field>

				<Button
					onClick={() => void handleSubmit()}
					disabled={!canSubmit}
					icon="upload"
					aria-busy={submitting || undefined}
				>
					{submitting
						? t("storyCreateSheet.publishing")
						: t("storyCreateSheet.publish")}
				</Button>
			</div>
		</>
	)
}
