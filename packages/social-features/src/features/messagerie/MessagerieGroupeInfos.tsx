// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieGroupeInfos.tsx @ ad2e7fdc2 — adaptations : fonctions du moteur `groups.threads.*`, `groups.invites.*`, `groups.cascade.deleteGroup` (réseau courant, membre visé par sa PERSONNE `memberPersonId`) ; la fiche (`getGroupThread`) ne porte plus les membres : membres et invitations en attente lus par `paginateGroupMembers` et `paginateGroupPendingInvites`, chargés jusqu'au bout (borné par le plafond de structure) et places comptées sur l'effectif du serveur ; noms par le contrat `counterpartLabel` (nom nul = libellé neutre) ; photo déposée par `generateGroupAvatarUploadUrl` et posée avec son type, refusée par `refusPhotoDeGroupe` ; ressources lues dans le DTO des messages du moteur (`content`, `attachmentFiles`) ; lien d'invitation sur la base `useRoutes().messages()` ; recherche de relations sans langue écrite en dur (`normaliseRecherche`) ; échec de copie du lien dit tel quel (le socle le noyait dans le refus générique) ; dates dans la langue courante ; textes traduits (i18n `messagerie`, clés `messagerieGroupeInfos.…`) ; « Groupe iCom » et « espace agent » deviennent « réseau » ; code QR sans couleur littérale (encre héritée, fond transparent). ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil).
"use client"

/**
 * Fiche d'un groupe iCom.
 *
 * L'identité collective précède les réglages : photo, nom, membres et origine
 * du groupe. Les actions qui changent le collectif restent réservées au rôle
 * que le serveur rend ; l'écran ne réécrit aucune règle d'autorité.
 *
 * ⚠️ La fiche du serveur (`getGroupThread`) ne porte plus la liste des membres
 * (le socle rendait jusqu'à mille profils d'un coup) : membres et invitations
 * en attente se lisent PAGINÉS, et la fiche les charge jusqu'au bout — ils
 * restent bornés par le plafond de structure d'un groupe. Les places restantes
 * se comptent sur l'EFFECTIF rendu par le serveur, exact dès le premier rendu.
 */

import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import {
	useAuthenticatedConvexQuery,
	useAuthenticatedPaginatedQuery,
	useConvexMutationQuery,
} from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { GROUP_DESCRIPTION_MAX_LENGTH } from "@antsia/social-contracts/groupCapacity"
import {
	ArrowLeft,
	Camera,
	ChevronRight,
	Check,
	Copy,
	FileText,
	ImageMinus,
	Link2,
	LogOut,
	MessagesSquare,
	Pencil,
	Phone,
	QrCode,
	RefreshCw,
	Search,
	Share2,
	ShieldCheck,
	Trash2,
	UserMinus,
	UserPlus,
	Video,
	X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import QRCode from "react-qr-code"
import { Avatar } from "../reseau-personnel/Avatar"
import {
	GROUPE_PHOTO_ACCEPT,
	GROUPE_TITRE_MAX,
	refusPhotoDeGroupe,
} from "./groupe-composeur"
import {
	convieDuGroupe,
	dateDuGroupe,
	filtrerMembres,
	membreDuGroupe,
	phraseDeDepart,
	phraseDEffacement,
	phraseDeRetrait,
	phraseDeSuppression,
	vueDeGestion,
} from "./groupe-gestion"
import { GroupeAvatar } from "./GroupeAvatar"
import { invitationGroupeHref } from "./groupe-invitation-link"
import { ressourcesDuGroupe } from "./groupe-ressources"
import { MessageAttachment } from "./MessageAttachment"
import { messageErreurLisible } from "./messagerie-erreur"
import { normaliseRecherche } from "./messagerie-liste"
import { MessagerieStyles } from "./messagerie-styles"
import type { MessagerieVariant } from "./messagerie-views"

/** Membres, invitations et messages lus par page : le plafond d'une page du serveur. */
const PAGE = 50

export interface MessagerieGroupeInfosProps {
	threadId: string
	variant: MessagerieVariant
	onClose: () => void
	onLeft: () => void
	onStartAudio?: () => void
	onStartVideo?: () => void
	callPending?: boolean
}

type Confirmation = null | "effacer" | "quitter" | "supprimer"

/**
 * Copie un texte dans le presse-papiers : l'API asynchrone d'abord, la
 * sélection d'un champ caché sinon. Rend `false` quand rien n'a été copié.
 */
async function copierTexte(texte: string): Promise<boolean> {
	try {
		if (navigator.clipboard !== undefined) {
			await navigator.clipboard.writeText(texte)
			return true
		}
	} catch {
		// Permission refusée ou contexte non sûr : le repli ci-dessous.
	}
	const textarea = document.createElement("textarea")
	textarea.value = texte
	textarea.style.position = "fixed"
	textarea.style.opacity = "0"
	document.body.append(textarea)
	textarea.select()
	const copied = document.execCommand("copy")
	textarea.remove()
	return copied
}

export function MessagerieGroupeInfos({
	threadId,
	variant,
	onClose,
	onLeft,
	onStartAudio,
	onStartVideo,
	callPending = false,
}: MessagerieGroupeInfosProps) {
	const { t, i18n } = useTranslation("messagerie")
	const timeZone = useViewerTimeZone()
	const { networkId } = useNetwork()
	const routes = useRoutes()
	const locale = i18n.language
	// Posé AVANT une mutation qui retire l'accès : la requête ne doit pas se
	// relancer entre la mutation et la navigation.
	const [parti, setParti] = useState(false)
	const [erreur, setErreur] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)
	const [confirmation, setConfirmation] = useState<Confirmation>(null)
	const [retraitAConfirmer, setRetraitAConfirmer] = useState<string | null>(null)
	const [titreEnCours, setTitreEnCours] = useState<string | null>(null)
	const [descriptionEnCours, setDescriptionEnCours] = useState<string | null>(null)
	const [rechercheMembre, setRechercheMembre] = useState("")
	const [rechercheInvite, setRechercheInvite] = useState("")
	const [ajoutOuvert, setAjoutOuvert] = useState(false)
	const [inviteOuverte, setInviteOuverte] = useState(false)
	const [mediasOuverts, setMediasOuverts] = useState(false)
	const [permissionsOuvertes, setPermissionsOuvertes] = useState(false)
	const [inviteToken, setInviteToken] = useState<string | null>(null)
	const [shareOrigin, setShareOrigin] = useState("")
	const [photoPending, setPhotoPending] = useState(false)
	const photoInputRef = useRef<HTMLInputElement>(null)
	const memberSearchRef = useRef<HTMLInputElement>(null)
	const membersSectionRef = useRef<HTMLElement>(null)

	useEffect(() => {
		setShareOrigin(window.location.origin)
	}, [])

	// Une confirmation utile ne doit pas devenir un bandeau permanent qui
	// repousse les réglages du groupe. Elle reste assez longtemps pour être lue
	// et annoncée, puis libère seule l'espace.
	useEffect(() => {
		if (notice === null) return
		const timer = window.setTimeout(() => setNotice(null), 4_000)
		return () => window.clearTimeout(timer)
	}, [notice])

	const id = threadId as Id<"groupThreads">
	const groupe = useAuthenticatedConvexQuery(
		api.modules.groups.threads.getGroupThread,
		parti ? "skip" : { networkId, threadId: id },
	)
	const data = groupe.data
	// Les listes paginées ne s'ouvrent que sur une fiche LISIBLE : une
	// pagination lève sur un refus, la fiche, elle, le dit.
	const ficheLisible = !parti && data !== undefined && !groupe.isError
	const membresPages = useAuthenticatedPaginatedQuery(
		api.modules.groups.threads.paginateGroupMembers,
		ficheLisible ? { networkId, threadId: id } : "skip",
		{ initialNumItems: PAGE },
	)
	const conviesPages = useAuthenticatedPaginatedQuery(
		api.modules.groups.threads.paginateGroupPendingInvites,
		ficheLisible ? { networkId, threadId: id } : "skip",
		{ initialNumItems: PAGE },
	)
	// La fiche administre CHAQUE membre : elle charge les pages jusqu'au bout
	// (un groupe est borné par son plafond de structure).
	const chargerMembres = membresPages.loadMore
	const chargerConvies = conviesPages.loadMore
	useEffect(() => {
		if (membresPages.status === "CanLoadMore") chargerMembres(PAGE)
	}, [membresPages.status, chargerMembres])
	useEffect(() => {
		if (conviesPages.status === "CanLoadMore") chargerConvies(PAGE)
	}, [conviesPages.status, chargerConvies])

	const connexions = useAuthenticatedConvexQuery(
		api.modules.groups.invites.listMyConnectionsForGroup,
		parti ? "skip" : { networkId },
	)
	const mediaPagination = useAuthenticatedPaginatedQuery(
		api.modules.groups.messages.paginateGroupMessages,
		mediasOuverts && ficheLisible ? { networkId, threadId: id } : "skip",
		{ initialNumItems: PAGE },
	)
	const ressources = useMemo(
		() =>
			ressourcesDuGroupe(
				mediaPagination.results.map((message) => ({
					messageId: String(message.messageId),
					text: message.content,
					createdAt: message.createdAt,
					attachments: message.attachmentFiles,
				})),
			),
		[mediaPagination.results],
	)

	const renommer = useConvexMutationQuery(api.modules.groups.threads.renameGroup)
	const inviter = useConvexMutationQuery(api.modules.groups.invites.inviteToGroup)
	const retirer = useConvexMutationQuery(api.modules.groups.threads.removeGroupMember)
	const changerRole = useConvexMutationQuery(api.modules.groups.threads.setGroupMemberRole)
	const quitter = useConvexMutationQuery(api.modules.groups.threads.leaveGroup)
	const supprimer = useConvexMutationQuery(api.modules.groups.cascade.deleteGroup)
	const effacer = useConvexMutationQuery(api.modules.groups.threads.clearGroupConversation)
	const changerPhoto = useConvexMutationQuery(api.modules.groups.threads.setGroupAvatar)
	const changerDescription = useConvexMutationQuery(api.modules.groups.threads.setGroupDescription)
	const obtenirLienInvitation = useConvexMutationQuery(api.modules.groups.invites.getOrCreateGroupInviteLink)
	const reinitialiserLienInvitation = useConvexMutationQuery(api.modules.groups.invites.resetGroupInviteLink)
	const generateUploadUrl = useConvexMutationQuery(api.modules.groups.threads.generateGroupAvatarUploadUrl)
	const inviteUrl = inviteToken === null || shareOrigin.length === 0
		? null
		: invitationGroupeHref(inviteToken, routes.sharePath?.(routes.messages()) ?? routes.messages(), shareOrigin)

	const membres = useMemo(
		() => membresPages.results.map((membre) => membreDuGroupe(membre, t)),
		[membresPages.results, t],
	)
	const convies = useMemo(
		() => conviesPages.results.map((convie) => convieDuGroupe(convie, t)),
		[conviesPages.results, t],
	)
	const vue = useMemo(
		() =>
			data === undefined
				? null
				: vueDeGestion(
						{
							monRole: data.myRole,
							membres,
							convies,
							ferme: data.closed,
							effectif: data.memberCount,
							locale,
						},
						t,
					),
		[convies, data, locale, membres, t],
	)

	const membresFiltres = useMemo(
		() => (vue === null ? [] : filtrerMembres(vue.membres, rechercheMembre)),
		[rechercheMembre, vue],
	)

	const invitables = useMemo(() => {
		if (data === undefined) return []
		const deja = new Set<string>([
			...membres.map((membre) => membre.userId),
			...convies.map((convie) => convie.userId),
		])
		const filtre = normaliseRecherche(rechercheInvite)
		return (connexions.data ?? [])
			.filter((personne) => !deja.has(String(personne.personId)))
			.filter(
				(personne) =>
					filtre.length === 0 ||
					normaliseRecherche(personne.displayName).includes(filtre) ||
					normaliseRecherche(personne.handle).includes(filtre),
			)
			.slice(0, 8)
	}, [connexions.data, convies, data, membres, rechercheInvite])

	async function agir(action: () => Promise<unknown>, succes?: string) {
		setErreur(null)
		setNotice(null)
		try {
			await action()
			if (succes !== undefined) setNotice(succes)
			return true
		} catch (err) {
			setErreur(messageErreurLisible(err, t))
			return false
		}
	}

	async function televerserPhoto(file: File) {
		const refus = refusPhotoDeGroupe(file, t)
		if (refus !== null) {
			setErreur(refus)
			return
		}
		setPhotoPending(true)
		setErreur(null)
		setNotice(null)
		try {
			const uploadUrl = await generateUploadUrl.mutateAsync({ networkId })
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			})
			if (!response.ok) {
				setErreur(t("messagerieGroupeInfos.photoUploadFailed"))
				return
			}
			const { storageId } = (await response.json()) as { storageId: string }
			await changerPhoto.mutateAsync({
				networkId,
				threadId: id,
				storageId: storageId as Id<"_storage">,
				mimeType: file.type,
			})
			setNotice(t("messagerieGroupeInfos.photoUpdated"))
		} catch (err) {
			setErreur(messageErreurLisible(err, t))
		} finally {
			setPhotoPending(false)
		}
	}

	async function ouvrirInvitation() {
		setInviteOuverte(true)
		if (inviteToken !== null) return
		await agir(async () => {
			const result = await obtenirLienInvitation.mutateAsync({ networkId, threadId: id })
			setInviteToken(result.token)
		})
	}

	async function copierInvitation() {
		if (inviteUrl === null) return
		setErreur(null)
		setNotice(null)
		if (await copierTexte(inviteUrl)) {
			setNotice(t("messagerieGroupeInfos.linkCopied"))
		} else {
			setErreur(t("messagerieGroupeInfos.linkCopyFailed"))
		}
	}

	async function partagerInvitation() {
		if (inviteUrl === null || data === undefined) return
		if (typeof navigator.share !== "function") {
			await copierInvitation()
			return
		}
		try {
			await navigator.share({
				title: data.title,
				text: t("messagerieGroupeInfos.shareText", { titre: data.title }),
				url: inviteUrl,
			})
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") return
			setErreur(messageErreurLisible(err, t))
		}
	}

	function chercherUnMembre() {
		membersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
		window.setTimeout(() => memberSearchRef.current?.focus(), 200)
	}

	function ouvrirAjoutMembre() {
		setAjoutOuvert(true)
		membersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
		window.setTimeout(() => document.getElementById("msg-infos-invite")?.focus(), 200)
	}

	if (parti) {
		return (
			<>
				<MessagerieStyles />
				<div className="msg-infos" data-variant={variant}>
					<p className="msg-empty">{t("messagerieGroupeInfos.left")}</p>
				</div>
			</>
		)
	}

	return (
		<>
			<MessagerieStyles />
			<div className="msg-head-row">
				<button
					type="button"
					className="msg-icon-btn"
					aria-label={
						inviteOuverte || mediasOuverts
							? t("messagerieGroupeInfos.backToInfos")
							: t("messagerieGroupeInfos.backToConversation")
					}
					onClick={inviteOuverte || mediasOuverts ? () => { setInviteOuverte(false); setMediasOuverts(false) } : onClose}
				>
					<ArrowLeft aria-hidden="true" size={variant === "page" ? 20 : 16} />
				</button>
				<span className="msg-head" style={{ cursor: "default" }}>
					{!inviteOuverte && !mediasOuverts && data !== undefined ? (
						<GroupeAvatar title={data.title} avatarUrl={data.avatarUrl} size={30} />
					) : (
						<span aria-hidden="true" className="msg-row-emblem">{inviteOuverte ? <QrCode size={15} /> : mediasOuverts ? <FileText size={15} /> : <MessagesSquare size={15} />}</span>
					)}
					<span className="msg-row-main">
						<span className="msg-head-title">
							{inviteOuverte
								? t("messagerieGroupeInfos.inviteHeading")
								: mediasOuverts
									? t("messagerieGroupeInfos.resourcesHeading")
									: data?.title ?? t("messagerieGroupeInfos.defaultTitle")}
						</span>
					</span>
				</span>
				{!inviteOuverte && !mediasOuverts && vue?.inviter ? (
					<button type="button" className="msg-icon-btn" aria-label={t("messagerieGroupeInfos.shareGroup")} disabled={obtenirLienInvitation.isPending} onClick={() => void ouvrirInvitation()}><QrCode aria-hidden="true" size={18} /></button>
				) : null}
			</div>

			<div
				className="msg-scroller msg-infos-scroller"
				role="region"
				aria-label={t("messagerieGroupeInfos.regionLabel")}
				tabIndex={0}
			>
				<div className="msg-infos" data-variant={variant}>
					{groupe.isError ? (
						<p className="msg-empty" role="alert">{t("messagerieGroupeInfos.inaccessible")}</p>
					) : data === undefined ? (
						<p className="msg-empty">{t("messagerieGroupeInfos.loading")}</p>
					) : vue === null ? null : inviteOuverte ? (
						<section className="msg-infos-qr" aria-labelledby="msg-invite-title">
							<div className="msg-infos-qr-card">
								<GroupeAvatar title={data.title} avatarUrl={data.avatarUrl} size={64} />
								<h2 id="msg-invite-title" className="msg-infos-titre">{data.title}</h2>
								<p className="msg-infos-meta">{t("messagerieGroupeInfos.qrMeta", { count: data.memberCount })}</p>
								{inviteUrl === null ? (
									<p className="msg-empty" role="status">{t("messagerieGroupeInfos.linkCreating")}</p>
								) : (
									<div className="msg-infos-qr-code" aria-label={t("messagerieGroupeInfos.qrLabel", { titre: data.title })}>
										{/* Encre héritée (`currentColor`) sur fond transparent : le
										    contraste vient des jetons de la feuille, jamais d'une
										    couleur écrite ici. */}
										<QRCode value={inviteUrl} size={208} bgColor="transparent" fgColor="currentColor" />
									</div>
								)}
							</div>

							<p className="msg-infos-qr-help">{t("messagerieGroupeInfos.qrHelp")}</p>
							<div className="msg-infos-qr-actions">
								<button type="button" className="msg-infos-mini" disabled={inviteUrl === null} onClick={() => void copierInvitation()}><Copy aria-hidden="true" size={15} /> {t("messagerieGroupeInfos.copyLink")}</button>
								<button type="button" className="msg-infos-mini" disabled={inviteUrl === null} onClick={() => void partagerInvitation()}><Share2 aria-hidden="true" size={15} /> {t("messagerieGroupeInfos.share")}</button>
								<button type="button" className="msg-infos-mini" disabled={reinitialiserLienInvitation.isPending} onClick={() => void agir(async () => {
									const result = await reinitialiserLienInvitation.mutateAsync({ networkId, threadId: id })
									setInviteToken(result.token)
								}, t("messagerieGroupeInfos.linkReset"))}><RefreshCw aria-hidden="true" size={15} /> {t("messagerieGroupeInfos.reset")}</button>
							</div>
							{erreur !== null ? <p className="msg-error" role="alert">{erreur}</p> : null}
							{notice !== null ? <p className="msg-success" role="status">{notice}</p> : null}
						</section>
					) : mediasOuverts ? (
						<section className="msg-infos-resources" aria-labelledby="msg-resources-title">
							<h2 id="msg-resources-title" className="msg-infos-soustitre">{t("messagerieGroupeInfos.sharedResources")}</h2>
							{mediaPagination.status === "LoadingFirstPage" ? (
								<p className="msg-empty" role="status">{t("messagerieGroupeInfos.resourcesLoading")}</p>
							) : ressources.attachments.length === 0 && ressources.links.length === 0 ? (
								<p className="msg-empty">{t("messagerieGroupeInfos.resourcesEmpty")}</p>
							) : (
								<>
									{ressources.attachments.length > 0 ? (
										<div className="msg-infos-resource-block">
											<h3 className="msg-infos-soustitre">{t("messagerieGroupeInfos.mediaAndDocuments")}</h3>
											<ul className="msg-infos-resource-list">
												{ressources.attachments.map((attachment) => (
													<li key={attachment.key}><MessageAttachment attachment={attachment} /></li>
												))}
											</ul>
										</div>
									) : null}
									{ressources.links.length > 0 ? (
										<div className="msg-infos-resource-block">
											<h3 className="msg-infos-soustitre">{t("messagerieGroupeInfos.links")}</h3>
											<ul className="msg-infos-link-list">
												{ressources.links.map((link) => <li key={link.url}><Link2 aria-hidden="true" size={15} /><a href={link.url} target="_blank" rel="noreferrer noopener">{link.url}</a></li>)}
											</ul>
										</div>
									) : null}
								</>
							)}
							{mediaPagination.status === "CanLoadMore" || mediaPagination.status === "LoadingMore" ? (
								<button type="button" className="msg-infos-mini" disabled={mediaPagination.status === "LoadingMore"} onClick={() => mediaPagination.loadMore(PAGE)}>{mediaPagination.status === "LoadingMore" ? t("messagerieGroupeInfos.loading") : t("messagerieGroupeInfos.olderResources")}</button>
							) : null}
						</section>
					) : (
						<>
							<section className="msg-infos-hero" aria-labelledby="msg-group-title">
								<div className="msg-infos-avatar">
									<GroupeAvatar title={data.title} avatarUrl={data.avatarUrl} size={72} />
									{vue.renommer ? (
										<button type="button" className="msg-infos-avatar-edit" aria-label={t("messagerieGroupeInfos.photoEdit")} disabled={photoPending || changerPhoto.isPending} onClick={() => photoInputRef.current?.click()}>
											<Camera aria-hidden="true" size={17} />
										</button>
									) : null}
								</div>
								<input
									ref={photoInputRef}
									className="sr-only"
									type="file"
									accept={GROUPE_PHOTO_ACCEPT}
									onChange={(event) => {
										const file = event.currentTarget.files?.[0]
										event.currentTarget.value = ""
										if (file !== undefined) void televerserPhoto(file)
									}}
								/>

								{titreEnCours === null ? (
									<div className="msg-infos-titre-row">
										<h2 id="msg-group-title" className="msg-infos-titre">{data.title}</h2>
										{vue.renommer ? (
											<button type="button" className="msg-icon-btn" aria-label={t("messagerieGroupeInfos.rename")} onClick={() => setTitreEnCours(data.title)}>
												<Pencil aria-hidden="true" size={16} />
											</button>
										) : null}
									</div>
								) : (
									<form
										className="msg-infos-titre-edit"
										onSubmit={(event) => {
											event.preventDefault()
											const propre = titreEnCours.trim()
											if (propre.length === 0) return
											void agir(() => renommer.mutateAsync({ networkId, threadId: id, title: propre }), t("messagerieGroupeInfos.nameUpdated")).then((ok) => {
												if (ok) setTitreEnCours(null)
											})
										}}
									>
										<label className="sr-only" htmlFor="msg-infos-titre-input">{t("messagerieGroupeInfos.nameLabel")}</label>
										<input id="msg-infos-titre-input" className="msg-infos-input" value={titreEnCours} maxLength={GROUPE_TITRE_MAX} autoFocus onChange={(event) => setTitreEnCours(event.currentTarget.value)} />
										<button data-role="success" type="submit" className="msg-icon-btn" aria-label={t("messagerieGroupeInfos.saveName")} disabled={renommer.isPending || titreEnCours.trim().length === 0}><Check aria-hidden="true" size={16} /></button>
										<button data-role="cancel" type="button" className="msg-icon-btn" aria-label={t("messagerieGroupeInfos.cancel")} onClick={() => setTitreEnCours(null)}><X aria-hidden="true" size={16} /></button>
									</form>
								)}

								<p className="msg-infos-meta">
									{t("messagerieGroupeInfos.metaMembers", { count: data.memberCount })}
									{vue.convies.length > 0
										? ` · ${t("messagerieGroupeInfos.metaPending", { count: vue.convies.length })}`
										: ""}
								</p>
								{descriptionEnCours !== null ? (
									<form
										className="msg-infos-description-edit"
										onSubmit={(event) => {
											event.preventDefault()
											const propre = descriptionEnCours.trim()
											void agir(
												() => changerDescription.mutateAsync({ networkId, threadId: id, description: propre.length === 0 ? null : propre }),
												propre.length === 0
													? t("messagerieGroupeInfos.descriptionDeleted")
													: t("messagerieGroupeInfos.descriptionUpdated"),
											).then((ok) => { if (ok) setDescriptionEnCours(null) })
										}}
									>
										<label className="sr-only" htmlFor="msg-infos-description-input">{t("messagerieGroupeInfos.descriptionLabel")}</label>
										<textarea id="msg-infos-description-input" className="msg-infos-input msg-infos-description-input" value={descriptionEnCours} maxLength={GROUP_DESCRIPTION_MAX_LENGTH} autoFocus onChange={(event) => setDescriptionEnCours(event.currentTarget.value)} />
										<div className="msg-infos-confirm-actions">
											<button data-role="success" type="submit" className="msg-infos-mini" disabled={changerDescription.isPending}><Check aria-hidden="true" size={15} /> {t("messagerieGroupeInfos.save")}</button>
											<button data-role="cancel" type="button" className="msg-infos-mini" onClick={() => setDescriptionEnCours(null)}><X aria-hidden="true" size={15} /> {t("messagerieGroupeInfos.cancel")}</button>
										</div>
									</form>
								) : data.description !== null ? (
									<button type="button" className="msg-infos-description" disabled={!vue.renommer} onClick={() => { if (vue.renommer) setDescriptionEnCours(data.description ?? "") }}>
										{data.description}
										{vue.renommer ? <Pencil aria-hidden="true" size={13} /> : null}
									</button>
								) : vue.renommer ? (
									<button type="button" className="msg-infos-description" onClick={() => setDescriptionEnCours("")}><Pencil aria-hidden="true" size={13} /> {t("messagerieGroupeInfos.addDescription")}</button>
								) : null}
								<p className="msg-infos-created">
									{t("messagerieGroupeInfos.createdBy", {
										nom: data.createdBy.displayName?.trim() || t("messagerieGroupeInfos.createdByFallback"),
										date: dateDuGroupe(data.createdAt, true, locale, timeZone),
									})}
								</p>
								{vue.renommer && data.avatarUrl !== null ? (
									<button data-role="danger" type="button" className="msg-infos-mini" disabled={photoPending || changerPhoto.isPending} onClick={() => void agir(() => changerPhoto.mutateAsync({ networkId, threadId: id, storageId: null }), t("messagerieGroupeInfos.photoRemoved"))}>
										<ImageMinus aria-hidden="true" size={15} /> {t("messagerieGroupeInfos.removePhoto")}
									</button>
								) : null}
								{photoPending ? <p className="msg-infos-meta" role="status">{t("messagerieGroupeInfos.photoUploading")}</p> : null}
							</section>

							<div className="msg-infos-quick-actions" aria-label={t("messagerieGroupeInfos.quickActions")}>
								<button type="button" className="msg-infos-quick" disabled={onStartAudio === undefined || callPending} onClick={onStartAudio}><Phone aria-hidden="true" size={18} /><span>{t("messagerieGroupeInfos.audio")}</span></button>
								<button type="button" className="msg-infos-quick" disabled={onStartVideo === undefined || callPending} onClick={onStartVideo}><Video aria-hidden="true" size={18} /><span>{t("messagerieGroupeInfos.video")}</span></button>
								<button type="button" className="msg-infos-quick" disabled={!vue.inviter} onClick={ouvrirAjoutMembre}><UserPlus aria-hidden="true" size={18} /><span>{t("messagerieGroupeInfos.add")}</span></button>
								<button type="button" className="msg-infos-quick" onClick={chercherUnMembre}><Search aria-hidden="true" size={18} /><span>{t("messagerieGroupeInfos.search")}</span></button>
							</div>

							{erreur !== null ? <p className="msg-error" role="alert">{erreur}</p> : null}
							{notice !== null ? <p className="msg-success" role="status">{notice}</p> : null}

							<section className="msg-infos-block msg-infos-settings" aria-label={t("messagerieGroupeInfos.settingsLabel")}>
								<button type="button" className="msg-infos-setting-row" onClick={() => setMediasOuverts(true)}>
									<span className="msg-infos-setting-icon"><FileText aria-hidden="true" size={17} /></span>
									<span className="msg-infos-setting-copy"><strong>{t("messagerieGroupeInfos.resourcesHeading")}</strong><small>{t("messagerieGroupeInfos.resourcesHint")}</small></span>
									<ChevronRight aria-hidden="true" size={16} />
								</button>
								<button type="button" className="msg-infos-setting-row" aria-expanded={permissionsOuvertes} onClick={() => setPermissionsOuvertes((ouvert) => !ouvert)}>
									<span className="msg-infos-setting-icon"><ShieldCheck aria-hidden="true" size={17} /></span>
									<span className="msg-infos-setting-copy"><strong>{t("messagerieGroupeInfos.permissionsTitle")}</strong><small>{t("messagerieGroupeInfos.permissionsHint")}</small></span>
									<ChevronRight aria-hidden="true" size={16} />
								</button>
								{permissionsOuvertes ? (
									<p className="msg-infos-permission-help">{t("messagerieGroupeInfos.permissionsHelp")}</p>
								) : null}
							</section>

							<section ref={membersSectionRef} className="msg-infos-block">
								<div className="msg-infos-section-head">
									<h3 className="msg-infos-soustitre">{t("messagerieGroupeInfos.membersHeading", { count: data.memberCount })}</h3>
								</div>
								{vue.inviter ? (
									<>
										<button type="button" className="msg-infos-setting-row" aria-expanded={ajoutOuvert} onClick={() => setAjoutOuvert((ouvert) => !ouvert)}>
											<span className="msg-infos-setting-icon"><UserPlus aria-hidden="true" size={17} /></span>
											<span className="msg-infos-setting-copy"><strong>{t("messagerieGroupeInfos.addMembersTitle")}</strong><small>{t("messagerieGroupeInfos.addMembersHint")}</small></span>
											<ChevronRight aria-hidden="true" size={16} />
										</button>
										<button type="button" className="msg-infos-setting-row" disabled={obtenirLienInvitation.isPending} onClick={() => void ouvrirInvitation()}>
											<span className="msg-infos-setting-icon"><QrCode aria-hidden="true" size={17} /></span>
											<span className="msg-infos-setting-copy"><strong>{t("messagerieGroupeInfos.inviteLinkTitle")}</strong><small>{t("messagerieGroupeInfos.inviteLinkHint")}</small></span>
											<ChevronRight aria-hidden="true" size={16} />
										</button>
									</>
								) : null}

								<div className="msg-infos-search">
									<Search aria-hidden="true" size={17} />
									<label className="sr-only" htmlFor="msg-infos-membres-search">{t("messagerieGroupeInfos.searchMember")}</label>
									<input ref={memberSearchRef} id="msg-infos-membres-search" type="search" placeholder={t("messagerieGroupeInfos.searchMemberPlaceholder")} value={rechercheMembre} onChange={(event) => setRechercheMembre(event.currentTarget.value)} />
								</div>

								{ajoutOuvert && vue.inviter ? (
									<div className="msg-infos-subsection">
										<p className="msg-infos-meta">{t("messagerieGroupeInfos.placesLeft", { count: vue.placesRestantes })}</p>
										<label className="sr-only" htmlFor="msg-infos-invite">{t("messagerieGroupeInfos.searchRelations")}</label>
										<input id="msg-infos-invite" className="msg-infos-input" type="search" placeholder={t("messagerieGroupeInfos.searchRelationsPlaceholder")} value={rechercheInvite} onChange={(event) => setRechercheInvite(event.currentTarget.value)} />
										{invitables.length === 0 ? (
											<p className="msg-infos-meta">{(connexions.data ?? []).length === 0 ? t("messagerieGroupeInfos.noRelations") : t("messagerieGroupeInfos.noInvitable")}</p>
										) : (
											<ul className="msg-infos-liste">
												{invitables.map((personne) => (
													<li key={String(personne.personId)}>
														<div className="msg-row" style={{ cursor: "default" }}>
															<Avatar displayName={personne.displayName} avatarUrl={personne.avatarUrl} hasIdentity size={36} />
															<span className="msg-row-main"><span className="msg-row-name">{personne.displayName}</span><span className="msg-row-preview">@{personne.handle}</span></span>
															<button type="button" className="msg-icon-btn" aria-label={t("messagerieGroupeInfos.invite", { nom: personne.displayName })} disabled={inviter.isPending} onClick={() => void agir(() => inviter.mutateAsync({ networkId, threadId: id, handle: personne.handle }), t("messagerieGroupeInfos.invited", { nom: personne.displayName }))}><UserPlus aria-hidden="true" size={16} /></button>
														</div>
													</li>
												))}
											</ul>
										)}
									</div>
								) : null}

								{membresPages.status === "LoadingFirstPage" ? (
									<p className="msg-infos-meta" role="status">{t("messagerieGroupeInfos.membersLoading")}</p>
								) : membresFiltres.length === 0 ? (
									<p className="msg-infos-meta">{t("messagerieGroupeInfos.noMemberMatch")}</p>
								) : (
									<ul className="msg-infos-liste">
										{membresFiltres.map((membre) => {
											const personId = membre.userId as Id<"persons">
											return (
												<li key={membre.userId} className="msg-infos-member">
													<div className="msg-row" style={{ cursor: "default" }}>
														<Avatar displayName={membre.displayName} avatarUrl={membre.avatarUrl} hasIdentity={membre.handle !== null} size={40} />
														<div className="msg-row-main">
															<span className="msg-row-name">{membre.isMe ? t("messagerieGroupeInfos.memberMe", { nom: membre.displayName }) : membre.displayName}</span>
															<span className="msg-row-preview">{t("messagerieGroupeInfos.memberSince", { role: membre.roleLabel, date: dateDuGroupe(membre.joinedAt, false, locale, timeZone) })}</span>
															<div className="msg-infos-member-footer">
																{membre.handle === null ? <span /> : <span className="msg-row-handle">@{membre.handle}</span>}
																<div className="msg-infos-member-actions">
																	{membre.actions.promouvoir ? <button type="button" className="msg-infos-mini msg-infos-role-action" aria-label={t("messagerieGroupeInfos.promote", { nom: membre.displayName })} disabled={changerRole.isPending} onClick={() => void agir(() => changerRole.mutateAsync({ networkId, threadId: id, memberPersonId: personId, role: "admin" }), t("messagerieGroupeInfos.promoted", { nom: membre.displayName }))}>{t("messagerieGroupeInfos.promoteShort")}</button> : null}
																	{membre.actions.retrograder ? <button type="button" className="msg-infos-mini msg-infos-role-action" aria-label={t("messagerieGroupeInfos.demote", { nom: membre.displayName })} disabled={changerRole.isPending} onClick={() => void agir(() => changerRole.mutateAsync({ networkId, threadId: id, memberPersonId: personId, role: "member" }), t("messagerieGroupeInfos.demoted", { nom: membre.displayName }))}>{t("messagerieGroupeInfos.demoteShort")}</button> : null}
																	{membre.actions.retirer ? <button data-role="danger" type="button" className="msg-icon-btn" aria-label={t("messagerieGroupeInfos.removeMember", { nom: membre.displayName })} disabled={retirer.isPending} onClick={() => setRetraitAConfirmer(membre.userId)}><UserMinus aria-hidden="true" size={16} /></button> : null}
																</div>
															</div>
														</div>
													</div>
													{retraitAConfirmer === membre.userId ? (
														<div className="msg-infos-confirm" role="alert">
															<p>{phraseDeRetrait(membre.displayName, t)}</p>
															<div className="msg-infos-confirm-actions">
																<button type="button" className="msg-infos-mini" data-danger="true" disabled={retirer.isPending} onClick={() => void agir(() => retirer.mutateAsync({ networkId, threadId: id, memberPersonId: personId }), t("messagerieGroupeInfos.removed", { nom: membre.displayName })).then((ok) => { if (ok) setRetraitAConfirmer(null) })}>{retirer.isPending ? t("messagerieGroupeInfos.removing") : t("messagerieGroupeInfos.removeConfirm", { nom: membre.displayName })}</button>
																<button data-role="cancel" type="button" className="msg-infos-mini" onClick={() => setRetraitAConfirmer(null)}>{t("messagerieGroupeInfos.cancel")}</button>
															</div>
														</div>
													) : null}
												</li>
											)
										})}
									</ul>
								)}
							</section>

							{vue.convies.length > 0 ? (
								<section className="msg-infos-block">
									<h3 className="msg-infos-soustitre">{t("messagerieGroupeInfos.pendingHeading")}</h3>
									<ul className="msg-infos-liste">
										{vue.convies.map((convie) => (
											<li key={convie.userId}>
												<div className="msg-row" style={{ cursor: "default" }}>
													<Avatar displayName={convie.displayName} avatarUrl={convie.avatarUrl} hasIdentity={convie.handle !== null} size={36} />
													<span className="msg-row-main"><span className="msg-row-name">{convie.displayName}</span><span className="msg-row-preview">{t("messagerieGroupeInfos.invitedOn", { date: dateDuGroupe(convie.invitedAt, false, locale, timeZone) })}</span></span>
												</div>
											</li>
										))}
									</ul>
								</section>
							) : null}

							<section className="msg-infos-sensitive" aria-label={t("messagerieGroupeInfos.sensitiveLabel")}>
								<div className="msg-infos-sensitive-actions" data-count={vue.supprimer ? "3" : "2"}>
									<button type="button" className="msg-infos-action" data-danger="true" aria-label={t("messagerieGroupeInfos.clearLabel")} aria-pressed={confirmation === "effacer"} onClick={() => setConfirmation("effacer")}><span className="msg-infos-action-pill"><Trash2 aria-hidden="true" size={14} /><span>{t("messagerieGroupeInfos.clearShort")}</span></span></button>
									<button type="button" className="msg-infos-action" aria-label={t("messagerieGroupeInfos.leaveLabel")} aria-pressed={confirmation === "quitter"} onClick={() => setConfirmation("quitter")}><span className="msg-infos-action-pill"><LogOut aria-hidden="true" size={14} /><span>{t("messagerieGroupeInfos.leaveShort")}</span></span></button>
									{vue.supprimer ? <button type="button" className="msg-infos-action" data-danger="true" aria-label={t("messagerieGroupeInfos.deleteLabel")} aria-pressed={confirmation === "supprimer"} onClick={() => setConfirmation("supprimer")}><span className="msg-infos-action-pill"><Trash2 aria-hidden="true" size={14} /><span>{t("messagerieGroupeInfos.deleteShort")}</span></span></button> : null}
								</div>

								{confirmation === "effacer" ? (
									<div className="msg-infos-confirm msg-infos-sensitive-confirm">
										<p role="alert">{phraseDEffacement(data.title, t)}</p>
										<div className="msg-infos-confirm-actions">
											<button type="button" className="msg-infos-mini" data-danger="true" disabled={effacer.isPending} onClick={() => void agir(() => effacer.mutateAsync({ networkId, threadId: id }), t("messagerieGroupeInfos.cleared")).then((ok) => { if (ok) setConfirmation(null) })}>{effacer.isPending ? t("messagerieGroupeInfos.clearing") : t("messagerieGroupeInfos.confirm")}</button>
											<button data-role="cancel" type="button" className="msg-infos-mini" onClick={() => setConfirmation(null)}>{t("messagerieGroupeInfos.cancel")}</button>
										</div>
									</div>
								) : null}

								{confirmation === "quitter" ? (
									<div className="msg-infos-confirm msg-infos-sensitive-confirm">
										<p>{phraseDeDepart({ titre: data.title, jeSuisProprietaire: data.myRole === "owner" }, t)}</p>
										<div className="msg-infos-confirm-actions">
											<button type="button" className="msg-infos-mini" data-danger="true" disabled={quitter.isPending} onClick={() => {
												setParti(true)
												void quitter.mutateAsync({ networkId, threadId: id }).then(() => onLeft()).catch((err: unknown) => { setParti(false); setErreur(messageErreurLisible(err, t)) })
											}}>{quitter.isPending ? t("messagerieGroupeInfos.leaving") : t("messagerieGroupeInfos.confirm")}</button>
											<button data-role="cancel" type="button" className="msg-infos-mini" onClick={() => setConfirmation(null)}>{t("messagerieGroupeInfos.cancel")}</button>
										</div>
									</div>
								) : null}

								{confirmation === "supprimer" && vue.supprimer ? (
									<div className="msg-infos-confirm msg-infos-sensitive-confirm">
										<p role="alert">{phraseDeSuppression({ titre: data.title, memberCount: data.memberCount }, t)}</p>
										<div className="msg-infos-confirm-actions">
											<button type="button" className="msg-infos-mini" data-danger="true" disabled={supprimer.isPending} onClick={() => {
												setParti(true)
												void supprimer.mutateAsync({ networkId, threadId: id }).then(() => onLeft()).catch((err: unknown) => { setParti(false); setErreur(messageErreurLisible(err, t)) })
											}}>{supprimer.isPending ? t("messagerieGroupeInfos.deleting") : t("messagerieGroupeInfos.deleteForever")}</button>
											<button data-role="cancel" type="button" className="msg-infos-mini" onClick={() => setConfirmation(null)}>{t("messagerieGroupeInfos.cancel")}</button>
										</div>
									</div>
								) : null}
							</section>
						</>
					)}
				</div>
			</div>
		</>
	)
}
