// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieGroupeInvite.tsx @ ad2e7fdc2 — adaptations : aperçu et entrée par `groups.invites.previewGroupInvite` et `joinGroupViaInviteLink` du moteur (réseau courant : un jeton d'un autre réseau se lit comme un jeton inconnu) ; refus traduit (`messageErreurLisible(err, t)`) ; textes traduits (i18n `messagerie`, clés `messagerieGroupeInvite.…`) ; « identité iRéseau » devient « identité sur le réseau » ; feuille de style sortie du JSX dans une constante de module (`MSG_GROUPE_INVITE_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface — règles inchangées, sauf Rejoindre aux couleurs des relations (`data-role="social"`, `--role-social-*`, aplat d'identité en repli ; ADR-0027) ; aplats d'identité et leur texte selon les chartes (`--esp-identity-fill`, `--primary-fill-on`, pastille tonale des états actifs ; ADR-0027), facture d'origine en repli.
"use client"

import { api } from "@antsia/api/engine"
import {
	useAuthenticatedConvexQuery,
	useConvexMutationQuery,
} from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { ArrowRight, Link2, Users, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { GroupeAvatar } from "./GroupeAvatar"
import { messageErreurLisible } from "./messagerie-erreur"

export interface ApercuInvitationGroupe {
	threadId: string
	title: string
	avatarUrl: string | null
	memberCount: number
	alreadyMember: boolean
}

interface MessagerieGroupeInviteViewProps {
	preview: ApercuInvitationGroupe | null
	invalidToken: boolean
	loading: boolean
	failed: boolean
	joining: boolean
	joinError: string | null
	onClose: () => void
	onAction: () => void
}

/**
 * Vue sans dépendance réseau : l'invitation révèle uniquement l'identité
 * minimale du groupe, avant le consentement explicite de la personne.
 */
export function MessagerieGroupeInviteView({
	preview,
	invalidToken,
	loading,
	failed,
	joining,
	joinError,
	onClose,
	onAction,
}: MessagerieGroupeInviteViewProps) {
	const { t } = useTranslation("messagerie")
	const indisponible = invalidToken || failed

	return (
		<section
			className="msg-group-invite"
			aria-labelledby="msg-group-invite-title"
			aria-busy={loading || joining}
		>
			<MessagerieGroupeInviteStyles />
			<header className="msg-group-invite-head">
				<span className="msg-group-invite-head-icon" aria-hidden="true">
					<Link2 size={18} />
				</span>
				<h2 id="msg-group-invite-title">{t("messagerieGroupeInvite.title")}</h2>
				<button
					type="button"
					className="msg-group-invite-close"
					aria-label={t("messagerieGroupeInvite.close")}
					onClick={onClose}
				>
					<X aria-hidden="true" size={18} />
				</button>
			</header>

			<div className="msg-group-invite-body">
				{loading ? (
					<div className="msg-group-invite-state" role="status" aria-live="polite">
						<span className="msg-group-invite-skeleton" aria-hidden="true" />
						<p>{t("messagerieGroupeInvite.checking")}</p>
					</div>
				) : indisponible ? (
					<div className="msg-group-invite-state" role="alert">
						<span className="msg-group-invite-state-icon" aria-hidden="true">
							<Link2 size={24} />
						</span>
						<h3>{t("messagerieGroupeInvite.unavailableTitle")}</h3>
						<p>{t("messagerieGroupeInvite.unavailableBody")}</p>
						<button type="button" className="msg-group-invite-secondary" onClick={onClose}>
							{t("messagerieGroupeInvite.backToMessages")}
						</button>
					</div>
				) : preview !== null ? (
					<div className="msg-group-invite-card">
						<GroupeAvatar
							title={preview.title}
							avatarUrl={preview.avatarUrl}
							size={64}
						/>
						<div className="msg-group-invite-identity">
							<h3>{preview.title}</h3>
							<p>
								<Users aria-hidden="true" size={15} />
								{t("messagerieGroupeInvite.members", { count: preview.memberCount })}
							</p>
						</div>
						<p className="msg-group-invite-note">
							{preview.alreadyMember
								? t("messagerieGroupeInvite.alreadyMember")
								: t("messagerieGroupeInvite.joinNotice")}
						</p>
						{joinError !== null ? (
							<p className="msg-group-invite-error" role="alert">
								{joinError}
							</p>
						) : null}
						<button
							type="button"
							className="msg-group-invite-primary"
							// Rejoindre : couleur des relations ; « Ouvrir » garde l'aplat d'identité (ADR-0027).
							data-role={preview.alreadyMember ? undefined : "social"}
							disabled={joining}
							onClick={onAction}
						>
							{joining
								? t("messagerieGroupeInvite.joining")
								: preview.alreadyMember
									? t("messagerieGroupeInvite.open")
									: t("messagerieGroupeInvite.join")}
							{joining ? null : <ArrowRight aria-hidden="true" size={17} />}
						</button>
					</div>
				) : null}
			</div>
		</section>
	)
}

export function MessagerieGroupeInvite({
	token,
	onClose,
	onJoined,
}: {
	token: string | null
	onClose: () => void
	onJoined: (threadId: string) => void
}) {
	const { t } = useTranslation("messagerie")
	const { networkId } = useNetwork()
	const preview = useAuthenticatedConvexQuery(
		api.modules.groups.invites.previewGroupInvite,
		token === null ? "skip" : { networkId, token },
	)
	const join = useConvexMutationQuery(
		api.modules.groups.invites.joinGroupViaInviteLink,
	)
	const [joinError, setJoinError] = useState<string | null>(null)
	const data: ApercuInvitationGroupe | undefined =
		preview.data === undefined
			? undefined
			: { ...preview.data, threadId: String(preview.data.threadId) }

	function agir() {
		if (token === null || data === undefined) return
		setJoinError(null)
		if (data.alreadyMember) {
			onJoined(data.threadId)
			return
		}
		void join
			.mutateAsync({ networkId, token })
			.then((result) => onJoined(String(result.threadId)))
			.catch((err: unknown) => setJoinError(messageErreurLisible(err, t)))
	}

	return (
		<MessagerieGroupeInviteView
			preview={data ?? null}
			invalidToken={token === null}
			loading={
				token !== null &&
				(preview.isLoading || (!preview.isError && data === undefined))
			}
			failed={preview.isError}
			joining={join.isPending}
			joinError={joinError}
			onClose={onClose}
			onAction={agir}
		/>
	)
}

/**
 * La feuille de la vue, hors du JSX : un littéral enfant de `<style>` passerait
 * pour une chaîne d'interface (cliquet `no-hardcoded-strings`). Jetons de la
 * charte seulement, aucune couleur littérale.
 */
const MSG_GROUPE_INVITE_CSS = `
			.msg-group-invite {
				display: flex;
				flex-direction: column;
				min-height: 420px;
				color: var(--ink-900);
			}
			.msg-group-invite-head {
				display: grid;
				grid-template-columns: 44px minmax(0, 1fr) 44px;
				align-items: center;
				gap: 8px;
				min-height: 64px;
				padding: 10px 12px;
				border-bottom: 1px solid var(--ink-200);
			}
			.msg-group-invite-head h2 {
				margin: 0;
				font-size: 16px;
				font-weight: 700;
				text-align: center;
			}
			.msg-group-invite-head-icon,
			.msg-group-invite-close,
			.msg-group-invite-state-icon {
				display: inline-grid;
				place-items: center;
				width: 44px;
				height: 44px;
				border-radius: 50%;
			}
			.msg-group-invite-head-icon {
				background: var(--primary-50);
				color: var(--primary-700);
			}
			.msg-group-invite-close {
				border: none;
				background: transparent;
				color: var(--ink-700);
				cursor: pointer;
			}
			.msg-group-invite-close:hover { background: var(--ink-100); }
			.msg-group-invite-close:focus-visible,
			.msg-group-invite-primary:focus-visible,
			.msg-group-invite-secondary:focus-visible {
				outline: 3px solid var(--primary-300);
				outline-offset: 2px;
			}
			.msg-group-invite-body {
				display: grid;
				place-items: start center;
				padding: 28px 16px 24px;
			}
			.msg-group-invite-card,
			.msg-group-invite-state {
				display: flex;
				flex-direction: column;
				align-items: center;
				width: min(100%, 420px);
				padding: var(--esp-card-padding, 24px 18px);
				border: 1px solid var(--esp-primitive-surface-border, var(--ink-200));
				border-radius: var(--esp-primitive-card-radius, 16px);
				background: var(--esp-surface-card, var(--ink-0));
				text-align: center;
			}
			.msg-group-invite-identity { margin-top: 12px; }
			.msg-group-invite-identity h3,
			.msg-group-invite-state h3 {
				margin: 0;
				font-size: 18px;
				line-height: 1.3;
			}
			.msg-group-invite-identity p {
				display: inline-flex;
				align-items: center;
				gap: 5px;
				margin: 6px 0 0;
				color: var(--ink-600);
				font-size: 13px;
			}
			.msg-group-invite-note,
			.msg-group-invite-state p {
				margin: 18px 0 0;
				color: var(--ink-600);
				font-size: 13px;
				line-height: 1.5;
			}
			.msg-group-invite-error {
				width: 100%;
				margin: 14px 0 0;
				padding: 8px 10px;
				border-radius: var(--esp-primitive-chip-radius, 10px);
				background: var(--danger-50, var(--ink-100));
				color: var(--danger-700, var(--ink-900));
				font-size: 12.5px;
			}
			.msg-group-invite-primary,
			.msg-group-invite-secondary {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 8px;
				min-height: 44px;
				margin-top: 18px;
				padding: 8px 16px;
				border-radius: 999px;
				font: inherit;
				font-size: 13px;
				font-weight: 700;
				cursor: pointer;
			}
			.msg-group-invite-primary {
				border: 1px solid var(--primary-700);
				background: var(--primary-fill);
				color: var(--primary-fill-on, var(--on-fill));
			}
			.msg-group-invite-primary[data-role="social"] {
				border-color: var(--role-social-fill, var(--primary-700));
				background: var(--role-social-fill, var(--primary-fill));
				color: var(--role-social-on, var(--on-fill));
			}
			.msg-group-invite-primary:disabled { cursor: wait; opacity: .65; }
			.msg-group-invite-secondary {
				border: 1px solid var(--ink-300);
				background: transparent;
				color: var(--ink-800);
			}
			.msg-group-invite-state-icon {
				margin-bottom: 12px;
				background: var(--ink-100);
				color: var(--ink-600);
			}
			.msg-group-invite-skeleton {
				width: 64px;
				height: 64px;
				border-radius: 50%;
				background: var(--ink-100);
				animation: msg-group-invite-pulse 1.2s ease-in-out infinite;
			}
			@keyframes msg-group-invite-pulse {
				50% { opacity: .45; }
			}
			@media (prefers-reduced-motion: reduce) {
				.msg-group-invite-skeleton { animation: none; }
			}
		`

function MessagerieGroupeInviteStyles() {
	return (
		<style>{MSG_GROUPE_INVITE_CSS}</style>
	)
}
