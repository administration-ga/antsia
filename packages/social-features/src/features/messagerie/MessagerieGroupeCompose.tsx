// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieGroupeCompose.tsx @ ad2e7fdc2 — adaptations : relations éligibles par `groups.invites.listMyConnectionsForGroup` (réseau courant, personnes du moteur) ; création par `groups.threads.createGroup` (photo déclarée avec son type, `avatarMimeType`) ; photo déposée par `groups.threads.generateGroupAvatarUploadUrl` au lieu de `reseauPersonnel.media.generateUploadUrl` ; refus d'une photo par `refusPhotoDeGroupe` (plus de remplacement de texte dans le refus de photo de profil) ; refus serveur traduit (`messageErreurLisible(err, t)`) et raison de sélection traduite (`validerSelection(selection, t)`) ; liste des relations mémorisée (avertissement de dépendances) ; textes traduits (i18n `messagerie`, clés `messagerieGroupeCompose.…`) ; « agents » devient « personnes du réseau » ; feuille de style sortie du JSX dans une constante de module (`MSG_GROUPE_COMPOSE_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface — règles inchangées ; aplats d'identité et leur texte selon les chartes (`--esp-identity-fill`, `--primary-fill-on`, pastille tonale des états actifs ; ADR-0027), facture d'origine en repli.
"use client"

/**
 * MessagerieGroupeCompose — composer un GROUPE, dans la carte de messagerie.
 *
 * Même carte, autre vue (cf. `MessagerieDock`) : on y entre par le second
 * bouton d'en-tête de la liste, on en sort par la flèche de retour — jamais
 * par une seconde surface, jamais par un menu flottant.
 *
 * ⚠️ La source est `groups.invites.listMyConnectionsForGroup`, PAS l'annuaire
 * du réseau : un groupe ne se compose que de ses RELATIONS (acceptées dans ce
 * réseau, profils publiés, sans blocage — ce que `createGroup` acceptera).
 * Offrir l'annuaire entier fabriquerait des refus. La liste est bornée côté
 * serveur ; le filtre par texte se fait donc ICI, sur ce qui est déjà chargé.
 *
 * Ce que ce composant DÉCIDE vient des modules purs : sélection et plafond
 * (`toggleSelection`), validité (`validerSelection`, `peutEnvoyer`), refus
 * d'une photo (`refusPhotoDeGroupe`). Le nom,
 * lui, est toujours saisi explicitement : les participants ne baptisent jamais
 * automatiquement le groupe.
 */

import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import {
	useAuthenticatedConvexQuery,
	useConvexMutationQuery,
} from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useIdempotencyKey } from "../../lib/chat/use-idempotency-key"
import {
	ArrowLeft,
	Camera,
	Check,
	ChevronDown,
	MessagesSquare,
	Search,
	Trash2,
	X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Avatar } from "../reseau-personnel/Avatar"
import { dockStore } from "./dock-store"
import {
	GROUPE_MAX_AUTRES,
	GROUPE_PHOTO_ACCEPT,
	GROUPE_PHOTO_MAX_MO,
	GROUPE_TITRE_MAX,
	peutContinuer,
	peutEnvoyer,
	refusPhotoDeGroupe,
	toggleSelection,
	validerSelection,
} from "./groupe-composeur"
import { suiteDeCreation } from "./groupe-creation"
import { messageErreurLisible } from "./messagerie-erreur"
import {
	isRepliablePose,
	type MessagerieNav,
	type MessagerieVariant,
} from "./messagerie-views"
import { normaliseRecherche } from "./messagerie-liste"

type GroupeComposeEtape = "participants" | "identite"

/** Le dépôt de la photo a échoué côté stockage — distinct d'un refus du serveur. */
class EchecDepotPhoto extends Error {}

/**
 * La feuille de la vue, hors du JSX : un littéral enfant de `<style>` passerait
 * pour une chaîne d'interface (cliquet `no-hardcoded-strings`). Jetons de la
 * charte seulement, aucune couleur littérale.
 */
const MSG_GROUPE_COMPOSE_CSS = `
        .msg-grp-pick {
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
		  min-height: 44px;
          padding: 8px;
          border: none;
          border-radius: var(--esp-primitive-chip-radius, 10px);
          background: transparent;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .msg-grp-pick:hover { background: var(--ink-100); }
        .msg-grp-pick[aria-pressed="true"] { background: var(--primary-50); }
        .msg-grp-check {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 18px;
          height: 18px;
          border: 1.5px solid var(--ink-300);
          border-radius: 6px;
          color: transparent;
        }
        .msg-grp-pick[aria-pressed="true"] .msg-grp-check {
          border-color: var(--primary-fill);
          background: var(--primary-fill);
          color: var(--primary-fill-on, var(--on-fill));
        }
		.msg-grp-head-copy {
		  display: flex;
		  flex: 1;
		  min-width: 0;
		  flex-direction: column;
		}
		.msg-grp-head-step {
		  overflow: hidden;
		  color: var(--ink-600);
		  font-size: 11px;
		  line-height: 1.25;
		  text-overflow: ellipsis;
		  white-space: nowrap;
		}
		.msg-grp-search { min-height: 44px; }
		.msg-grp-selected {
		  display: flex;
		  gap: 6px;
		  flex: 0 0 auto;
		  overflow-x: auto;
		  padding: 7px 8px;
		  border-bottom: 1px solid var(--ink-200);
		  scrollbar-width: thin;
		}
		.msg-grp-selected-item {
		  display: flex;
		  align-items: center;
		  justify-content: center;
		  flex: 0 0 64px;
		  min-width: 44px;
		  min-height: 72px;
		  padding: 3px;
		  border: none;
		  border-radius: var(--esp-primitive-chip-radius, 10px);
		  background: transparent;
		  color: var(--ink-900);
		  font: inherit;
		  cursor: pointer;
		  flex-direction: column;
		  gap: 3px;
		}
		.msg-grp-selected-item:hover { background: var(--ink-100); }
		.msg-grp-selected-item:focus-visible {
		  outline: 2px solid var(--ring);
		  outline-offset: -2px;
		}
		.msg-grp-selected-avatar { position: relative; display: inline-flex; }
		.msg-grp-selected-x {
		  position: absolute;
		  right: -3px;
		  bottom: -2px;
		  display: grid;
		  place-items: center;
		  width: 18px;
		  height: 18px;
		  border: 2px solid var(--ink-0);
		  border-radius: 999px;
		  background: var(--ink-700);
		  color: var(--ink-0);
		}
		.msg-grp-selected-name {
		  display: block;
		  width: 100%;
		  overflow: hidden;
		  font-size: 10.5px;
		  text-align: center;
		  text-overflow: ellipsis;
		  white-space: nowrap;
		}
        .msg-grp-foot {
          display: flex;
          flex-direction: column;
          gap: 7px;
          flex: 0 0 auto;
          padding: 8px;
          border-top: 1px solid var(--ink-200);
        }
		.msg-grp-foot-row {
		  display: flex;
		  align-items: center;
		  justify-content: space-between;
		  gap: 8px;
		}
		.msg-grp-primary {
		  display: inline-flex;
		  align-items: center;
		  justify-content: center;
		  flex: 0 0 auto;
		  min-width: 88px;
		  min-height: 44px;
		  padding: 9px 15px;
		  border: none;
          border-radius: var(--esp-primitive-button-radius, 11px);
          background: var(--primary-fill);
          color: var(--primary-fill-on, var(--on-fill));
          font: inherit;
          font-size: 13px;
		  font-weight: 650;
		  cursor: pointer;
		}
		.msg-grp-primary:disabled { opacity: .45; cursor: default; }
		.msg-grp-primary:focus-visible {
		  outline: 2px solid var(--ring);
		  outline-offset: 2px;
		}
		.msg-grp-hint { margin: 0; font-size: 11.5px; color: var(--ink-600); }
		.msg-grp-validation { margin: 0; font-size: 11px; color: var(--ink-600); }
		/* Le décompte se COMPTE : monospace, la signature typographique. */
		.msg-grp-count { font-family: var(--font-mono); }
		.msg-grp-identity {
		  display: flex;
		  flex-direction: column;
		  gap: 14px;
		  max-width: 520px;
		  margin: 0 auto;
		  padding: 14px 6px 20px;
		}
		.msg-grp-photo {
		  display: flex;
		  align-items: center;
		  align-self: center;
		  flex-direction: column;
		  gap: 5px;
		}
		.msg-grp-emblem {
		  display: grid;
		  place-items: center;
		  position: relative;
		  width: 88px;
		  height: 88px;
		  padding: 4px;
		  border: 1px solid var(--ink-300);
		  border-radius: 999px;
		  background: var(--primary-100);
		  color: var(--primary-700);
		  cursor: pointer;
		}
		.msg-grp-emblem:hover { background: var(--primary-50); }
		.msg-grp-emblem:focus-visible,
		.msg-grp-photo-remove:focus-visible {
		  outline: 2px solid var(--ring);
		  outline-offset: 2px;
		}
		.msg-grp-emblem:disabled,
		.msg-grp-photo-remove:disabled { opacity: .55; cursor: default; }
		.msg-grp-photo-camera {
		  display: grid;
		  place-items: center;
		  position: absolute;
		  right: -2px;
		  bottom: -2px;
		  width: 30px;
		  height: 30px;
		  border: 2px solid var(--ink-0);
		  border-radius: 999px;
		  background: var(--primary-fill);
		  color: var(--primary-fill-on, var(--on-fill));
		}
		.msg-grp-photo-remove {
		  display: inline-flex;
		  align-items: center;
		  justify-content: center;
		  gap: 5px;
		  min-height: 44px;
		  padding: 5px 9px;
		  border: none;
		  border-radius: var(--esp-primitive-button-radius, 8px);
		  background: transparent;
		  color: var(--ink-600);
		  font: inherit;
		  font-size: 12px;
		  font-weight: 600;
		  cursor: pointer;
		}
		.msg-grp-photo-remove:hover { background: var(--ink-100); color: var(--ink-900); }
		.msg-grp-photo-help {
		  max-width: 300px;
		  margin: 0;
		  color: var(--ink-600);
		  font-size: 11px;
		  line-height: 1.4;
		  text-align: center;
		}
		.msg-grp-field {
		  display: flex;
		  flex-direction: column;
		  gap: 6px;
		  color: var(--ink-900);
		  font-size: 13px;
		  font-weight: 650;
		}
		.msg-grp-field input {
		  width: 100%;
		  min-height: 44px;
		  padding: 9px 11px;
		  border: 1px solid var(--ink-300);
		  border-radius: var(--esp-input-radius, 11px);
		  background: var(--ink-0);
		  color: var(--ink-900);
		  font: inherit;
		  font-size: 16px;
		  font-weight: 400;
		}
		.msg-grp-field input:focus-visible {
		  outline: 2px solid var(--ring);
		  outline-offset: 1px;
		}
		.msg-grp-field input[aria-invalid="true"] { border-color: var(--danger-500); }
		.msg-grp-name-help {
		  display: flex;
		  justify-content: space-between;
		  gap: 8px;
		  margin: 0;
		  color: var(--ink-600);
		  font-size: 11px;
		  font-weight: 400;
		}
		.msg-grp-summary-title {
		  margin: 2px 0 0;
		  color: var(--ink-900);
		  font-size: 13px;
		}
		.msg-grp-identity .msg-grp-selected {
		  margin: 0 -6px;
		  border: 1px solid var(--ink-200);
		  border-radius: var(--esp-primitive-card-radius, 12px);
		}
		.msg-panel[data-variant="page"] .msg-grp-pick { min-height: 64px; }
		.msg-panel[data-variant="page"] .msg-grp-selected-name { font-size: 12px; }
		.msg-panel[data-variant="page"] .msg-grp-hint,
		.msg-panel[data-variant="page"] .msg-grp-validation,
		.msg-panel[data-variant="page"] .msg-grp-field,
		.msg-panel[data-variant="page"] .msg-grp-photo-help,
		.msg-panel[data-variant="page"] .msg-grp-summary-title { font-size: 14px; }
      `

export interface MessagerieGroupeComposeProps {
	/** Où la vue se pose — cf. `messagerie-views.ts`. */
	variant: MessagerieVariant
	/**
	 * Les gestes de navigation, INJECTÉS.
	 *
	 * ⚠️ Cette vue était la seule du module à câbler `dockStore` en dur. Dans
	 * le dock, ça marchait ; sur les deux poses « page » — le téléphone et le
	 * volet droit du bureau — aucun de ses trois gestes ne faisait rien de
	 * visible, l'écran y étant décidé par l'URL et non par le magasin.
	 */
	nav: MessagerieNav
	open?: boolean
	/**
	 * Replier la carte — le dock, et lui seul.
	 *
	 * Le repli est la GÉOMÉTRIE de la carte : une vue posée en page qui
	 * l'écrit agit à distance sur le bureau depuis le téléphone.
	 */
	onToggleOpen?: () => void
}

export function MessagerieGroupeCompose({
	variant,
	nav,
	open = true,
	onToggleOpen,
}: MessagerieGroupeComposeProps) {
	const { t } = useTranslation("messagerie")
	const { networkId } = useNetwork()
	const [etape, setEtape] = useState<GroupeComposeEtape>("participants")
	const [selection, setSelection] = useState<readonly string[]>([])
	const [titre, setTitre] = useState("")
	const [titreTouche, setTitreTouche] = useState(false)
	const [photoFichier, setPhotoFichier] = useState<File | null>(null)
	const [photoApercu, setPhotoApercu] = useState<string | null>(null)
	const [avatarStorageId, setAvatarStorageId] =
		useState<Id<"_storage"> | null>(null)
	const [recherche, setRecherche] = useState("")
	const [erreur, setErreur] = useState<string | null>(null)
	const [creation, setCreation] = useState(false)
	const rechercheRef = useRef<HTMLInputElement>(null)
	const titreRef = useRef<HTMLInputElement>(null)
	const photoRef = useRef<HTMLInputElement>(null)
	const { getKey } = useIdempotencyKey()

	const connexions = useAuthenticatedConvexQuery(
		api.modules.groups.invites.listMyConnectionsForGroup,
		{ networkId },
	)
	const createGroup = useConvexMutationQuery(
		api.modules.groups.threads.createGroup,
	)
	const generateUploadUrl = useConvexMutationQuery(
		api.modules.groups.threads.generateGroupAvatarUploadUrl,
	)

	useEffect(() => {
		if (!open) return
		if (etape === "participants") rechercheRef.current?.focus()
		else titreRef.current?.focus()
	}, [etape, open])

	useEffect(() => {
		if (photoFichier === null) {
			setPhotoApercu(null)
			return
		}
		const url = URL.createObjectURL(photoFichier)
		setPhotoApercu(url)
		return () => URL.revokeObjectURL(url)
	}, [photoFichier])

	const toutes = useMemo(() => connexions.data ?? [], [connexions.data])
	const terme = normaliseRecherche(recherche)
	const visibles =
		terme.length === 0
			? toutes
			: toutes.filter(
					(personne) =>
						normaliseRecherche(personne.displayName).includes(terme) ||
						normaliseRecherche(personne.handle).includes(terme),
				)

	// Les personnes sélectionnées restent dans l'ordre du choix. Contrairement
	// à la liste filtrée, ce résumé ne disparaît jamais pendant la recherche.
	const personnesSelectionnees = useMemo(() => {
		const parHandle = new Map(toutes.map((p) => [p.handle, p]))
		return selection
			.map((handle) => parHandle.get(handle))
			.filter((personne): personne is (typeof toutes)[number] =>
				personne !== undefined,
			)
	}, [selection, toutes])
	const verdict = validerSelection(selection, t)
	const pretAContinuer = peutContinuer(selection)
	const pretAEnvoyer = peutEnvoyer(titre, selection) && !creation
	const titreInvalide = titreTouche && titre.trim().length === 0
	// Le geste redescend chez la POSE, seule à savoir où elle est.
	const repliable = isRepliablePose(variant) && onToggleOpen !== undefined

	function retirer(handle: string): void {
		setErreur(null)
		setSelection((avant) => toggleSelection(avant, handle))
	}

	function allerIdentite(): void {
		if (!pretAContinuer) return
		setErreur(null)
		setEtape("identite")
	}

	function choisirPhoto(file: File | null): void {
		setErreur(null)
		if (file === null) return
		const refus = refusPhotoDeGroupe(file, t)
		if (refus !== null) {
			setErreur(refus)
			if (photoRef.current !== null) photoRef.current.value = ""
			return
		}
		setPhotoFichier(file)
		setAvatarStorageId(null)
	}

	function retirerPhoto(): void {
		setPhotoFichier(null)
		setAvatarStorageId(null)
		if (photoRef.current !== null) photoRef.current.value = ""
	}

	async function televerserPhoto(): Promise<Id<"_storage"> | undefined> {
		if (photoFichier === null) return undefined
		if (avatarStorageId !== null) return avatarStorageId

		const uploadUrl = await generateUploadUrl.mutateAsync({ networkId })
		const response = await fetch(uploadUrl, {
			method: "POST",
			headers: { "Content-Type": photoFichier.type },
			body: photoFichier,
		})
		if (!response.ok) {
			throw new EchecDepotPhoto()
		}
		const uploaded = (await response.json()) as { storageId: string }
		const storageId = uploaded.storageId as Id<"_storage">
		setAvatarStorageId(storageId)
		return storageId
	}

	function retour(): void {
		if (creation) return
		setErreur(null)
		if (etape === "identite") {
			setEtape("participants")
			return
		}
		nav.back()
	}

	async function creer(): Promise<void> {
		if (!pretAEnvoyer) return
		setErreur(null)
		setCreation(true)
		try {
			const photoId = await televerserPhoto()
			const resultat = await createGroup.mutateAsync({
				networkId,
				title: titre.trim(),
				memberHandles: [...selection],
				idempotencyKey: getKey(),
				...(photoId === undefined || photoFichier === null
					? {}
					: { avatarStorageId: photoId, avatarMimeType: photoFichier.type }),
			})
			const suite = suiteDeCreation({
				threadId: String(resultat.threadId),
				created: resultat.created,
			})
			if (suite === null) {
				nav.back()
				return
			}
			// ⚠️ `rotate()` a DISPARU d'ici. Le schéma dit lui-même que la clé se
			// tire AU MONTAGE du composeur, jamais à l'envoi : la faire tourner
			// sur un succès rendait au garde-fou d'idempotence son inutilité, et
			// un second appui sur « Créer » — depuis l'écran qu'on ne pouvait pas
			// quitter — fabriquait un groupe identique de plus.
			//
			// Le démontage du composeur EST la rotation. Une clé = une intention
			// de composition.
			//
			// Les DEUX gestes, et dans cet ordre : le magasin porte la
			// conversation active et survit au changement de coquille ; c'est la
			// NAVIGATION qui amène à l'écran.
			dockStore.openGroupe(String(resultat.threadId))
			nav.openConversation(suite.cle)
		} catch (err) {
			setErreur(
				err instanceof EchecDepotPhoto
					? t("messagerieGroupeCompose.photoUploadFailed")
					: messageErreurLisible(err, t),
			)
		} finally {
			setCreation(false)
		}
	}

	const resumeSelection =
		personnesSelectionnees.length > 0 ? (
			<div
				className="msg-grp-selected"
				aria-label={t("messagerieGroupeCompose.selectedCount", {
					count: personnesSelectionnees.length,
				})}
			>
				{personnesSelectionnees.map((personne) => (
					<button
						type="button"
						className="msg-grp-selected-item"
						key={String(personne.personId)}
						aria-label={t("messagerieGroupeCompose.removeSelected", {
							nom: personne.displayName,
						})}
						onClick={() => retirer(personne.handle)}
					>
						<span className="msg-grp-selected-avatar">
							<Avatar
								displayName={personne.displayName}
								avatarUrl={personne.avatarUrl}
								size={variant === "page" ? 44 : 36}
							/>
							<span aria-hidden="true" className="msg-grp-selected-x">
								<X size={12} />
							</span>
						</span>
						<span className="msg-grp-selected-name">
							{personne.displayName}
						</span>
					</button>
				))}
			</div>
		) : null

	return (
		<>
			<style href="msg-groupe-compose" precedence="default">{MSG_GROUPE_COMPOSE_CSS}</style>

			<div className="msg-head-row">
				<button
					type="button"
					className="msg-icon-btn"
					aria-label={
						etape === "identite"
							? t("messagerieGroupeCompose.backToParticipants")
							: t("messagerieGroupeCompose.cancel")
					}
					disabled={creation}
					onClick={retour}
					style={{ marginLeft: 6 }}
				>
					<ArrowLeft aria-hidden="true" size={16} />
				</button>
				<button
					type="button"
					className="msg-head"
					aria-expanded={repliable ? open : undefined}
					disabled={!repliable || creation}
					onClick={() => onToggleOpen?.()}
				>
					<MessagesSquare aria-hidden="true" size={17} />
					<span className="msg-grp-head-copy">
						<span className="msg-head-title">
							{t("messagerieGroupeCompose.title")}
						</span>
						<span className="msg-grp-head-step">
							{etape === "participants"
								? t("messagerieGroupeCompose.stepParticipants")
								: t("messagerieGroupeCompose.stepIdentity")}
						</span>
					</span>
					{repliable && (
						<ChevronDown
							aria-hidden="true"
							size={16}
							style={{ transform: open ? "rotate(180deg)" : undefined }}
						/>
					)}
				</button>
			</div>

			{open ? (
				etape === "participants" ? (
					<>
						<div className="msg-search-row msg-grp-search">
							<Search aria-hidden="true" size={14} />
							<input
								ref={rechercheRef}
								type="search"
								value={recherche}
								placeholder={t("messagerieGroupeCompose.search")}
								aria-label={t("messagerieGroupeCompose.search")}
								onChange={(event) => setRecherche(event.target.value)}
							/>
						</div>

						{resumeSelection}

						<div className="msg-body">
							{connexions.isLoading ? (
								<p className="msg-empty">
									{t("messagerieGroupeCompose.loading")}
								</p>
							) : toutes.length === 0 ? (
								<p className="msg-empty">
									{t("messagerieGroupeCompose.noConnections")}
								</p>
							) : visibles.length === 0 ? (
								<p className="msg-empty">
									{t("messagerieGroupeCompose.noMatch", {
										terme: recherche.trim(),
									})}
								</p>
							) : (
								<ul className="msg-list">
									{visibles.map((personne) => {
										const cochee = selection.includes(personne.handle)
										return (
											<li key={String(personne.personId)}>
												<button
													type="button"
													className="msg-grp-pick"
													aria-pressed={cochee}
													onClick={() => retirer(personne.handle)}
												>
													<span
														aria-hidden="true"
														className="msg-grp-check"
													>
														<Check size={13} />
													</span>
													<Avatar
														displayName={personne.displayName}
														avatarUrl={personne.avatarUrl}
														size={variant === "page" ? 44 : 32}
													/>
													<span className="msg-row-main">
														<span className="msg-row-name">
															{personne.displayName}
														</span>
														<span className="msg-row-preview">
															@{personne.handle}
														</span>
													</span>
												</button>
											</li>
										)
									})}
								</ul>
							)}
						</div>

						<div className="msg-grp-foot">
							<div className="msg-grp-foot-row">
								<p className="msg-grp-hint">
									<span className="msg-grp-count">
										{selection.length}/{GROUPE_MAX_AUTRES}
									</span>{" "}
									{t("messagerieGroupeCompose.selectedHint", {
										count: selection.length,
									})}
								</p>
								<button
									type="button"
									className="msg-grp-primary"
									disabled={!pretAContinuer}
									onClick={allerIdentite}
								>
									{t("messagerieGroupeCompose.next")}
								</button>
							</div>
							{verdict.ok ? null : (
								<p className="msg-grp-validation">{verdict.raison}</p>
							)}
						</div>
					</>
				) : (
					<>
						<div className="msg-body">
							<div className="msg-grp-identity">
								<div className="msg-grp-photo">
									<input
										ref={photoRef}
										type="file"
										accept={GROUPE_PHOTO_ACCEPT}
										hidden
										onChange={(event) =>
											choisirPhoto(event.currentTarget.files?.[0] ?? null)
										}
									/>
									<button
										type="button"
										className="msg-grp-emblem"
										aria-label={
											photoApercu === null
												? t("messagerieGroupeCompose.photoAdd")
												: t("messagerieGroupeCompose.photoReplace")
										}
										disabled={creation}
										onClick={() => photoRef.current?.click()}
									>
										{photoApercu === null ? (
											<MessagesSquare aria-hidden="true" size={32} />
										) : (
											<Avatar
												displayName={
													titre.trim() || t("messagerieGroupeCompose.photoAltFallback")
												}
												avatarUrl={photoApercu}
												size={78}
											/>
										)}
										<span className="msg-grp-photo-camera" aria-hidden="true">
											<Camera size={15} />
										</span>
									</button>
									{photoFichier === null ? null : (
										<button
											type="button"
											className="msg-grp-photo-remove"
											disabled={creation}
											onClick={retirerPhoto}
										>
											<Trash2 aria-hidden="true" size={14} />
											{t("messagerieGroupeCompose.photoRemove")}
										</button>
									)}
									<p className="msg-grp-photo-help">
										{t("messagerieGroupeCompose.photoHelp", {
											max: GROUPE_PHOTO_MAX_MO,
										})}
									</p>
								</div>
								<label className="msg-grp-field">
									<span>{t("messagerieGroupeCompose.nameLabel")}</span>
									<input
										ref={titreRef}
										type="text"
										value={titre}
										maxLength={GROUPE_TITRE_MAX}
										placeholder={t("messagerieGroupeCompose.nameLabel")}
										autoComplete="off"
										required
										aria-required="true"
										aria-invalid={titreInvalide}
										aria-describedby="msg-grp-name-help"
										onBlur={() => setTitreTouche(true)}
										onChange={(event) => {
											setErreur(null)
											setTitreTouche(true)
											setTitre(event.target.value)
										}}
									/>
									<span className="msg-grp-name-help" id="msg-grp-name-help">
										<span>{t("messagerieGroupeCompose.nameHelp")}</span>
										<span className="msg-grp-count">
											{titre.length}/{GROUPE_TITRE_MAX}
										</span>
									</span>
								</label>

								<p className="msg-grp-summary-title">
									<strong>
										{t("messagerieGroupeCompose.participants", {
											count: selection.length,
										})}
									</strong>{" "}
									{t("messagerieGroupeCompose.invitationsAfter")}
								</p>
								{resumeSelection}
							</div>
						</div>

						{erreur !== null ? (
							<p className="msg-error" role="status">
								{erreur}
							</p>
						) : null}

						<div className="msg-grp-foot">
							<button
								type="button"
								className="msg-grp-primary"
								disabled={!pretAEnvoyer}
								onClick={() => void creer()}
							>
								{creation
									? t("messagerieGroupeCompose.creating")
									: t("messagerieGroupeCompose.create")}
							</button>
						</div>
					</>
				)
			) : null}
		</>
	)
}
