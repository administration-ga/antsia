// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieGroupeInvitations.tsx @ ad2e7fdc2 — adaptations : invitations par `groups.invites.myGroupInvites` du moteur, PAGINÉE (une page bornée — la file d'un réseau tient en une page — lue sans lever : une panne ne fait pas tomber la liste des conversations) et `respondGroupInvite` (réseau courant, fil `groupThreads`) ; invitant nommé par le contrat `counterpartLabel` (profil publié = `source` « published », nom nul = libellé neutre) ; refus traduit (`messageErreurLisible(err, t)`) ; textes traduits (i18n `messagerie`, clés `messagerieGroupeInvitations.…`) ; couleurs par fonction (ADR-0027) : la coche Rejoindre à l'encre des relations (`--role-social-ink`).
"use client"

/**
 * MessagerieGroupeInvitations — les groupes où l'on est CONVIÉ, en tête de liste.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SANS CET ÉCRAN, PLUS AUCUN GROUPE NE PEUT SE FORMER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Depuis que `createGroup` INVITE au lieu d'ajouter d'office, une ligne de
 * membre naît à l'acceptation — et `respondGroupInvite` n'avait AUCUN
 * appelant. Un groupe créé restait donc à un seul membre, définitivement :
 * l'invitation partait, la notification aussi, et il n'existait nulle part un
 * bouton pour l'accepter. Le composeur de groupe fabriquait des groupes vides.
 *
 * ── Pourquoi en tête de la LISTE, et pas dans un écran à part ─────────────
 * Une invitation est une conversation qui n'a pas encore commencé : sa place
 * est là où l'on va chercher ses conversations. Un écran dédié suppose qu'on
 * sache qu'il existe, et une invitation qu'on ne voit pas ne se distingue pas
 * d'une invitation qui n'est jamais partie.
 *
 * Le bloc n'occupe RIEN quand il n'y a rien à répondre : pas de titre vide,
 * pas de réserve. Il se rend dans les deux poses — la carte du bureau comme la
 * page du téléphone — parce que la liste, elle, est la même des deux côtés.
 */

import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import {
	useAuthenticatedConvexQuery,
	useConvexMutationQuery,
} from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Check, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Avatar } from "../reseau-personnel/Avatar"
import { nomAffichable } from "./groupe-gestion"
import { groupeKey } from "./messagerie-dock"
import { messageErreurLisible } from "./messagerie-erreur"
import type { MessagerieNav } from "./messagerie-views"

/**
 * Les invitations lues d'un coup : le plafond d'une page du serveur. Lue comme
 * une requête simple (et non une pagination qui lève), une panne laisse le
 * bloc vide au lieu de faire tomber la liste des conversations qu'il coiffe.
 */
const INVITATIONS_PAR_PAGE = 50

export function MessagerieGroupeInvitations({ nav }: { nav: MessagerieNav }) {
	const { t } = useTranslation("messagerie")
	const { networkId } = useNetwork()
	const invitations = useAuthenticatedConvexQuery(
		api.modules.groups.invites.myGroupInvites,
		{
			networkId,
			paginationOpts: { numItems: INVITATIONS_PAR_PAGE, cursor: null },
		},
	)
	const repondre = useConvexMutationQuery(
		api.modules.groups.invites.respondGroupInvite,
	)
	const [erreur, setErreur] = useState<string | null>(null)

	const liste = invitations.data?.page ?? []
	if (liste.length === 0) return null

	function repondreA(threadId: Id<"groupThreads">, accept: boolean) {
		setErreur(null)
		void repondre
			.mutateAsync({ networkId, threadId, accept })
			.then(() => {
				// Accepter MÈNE au groupe : rester sur la liste laisserait
				// l'impression que rien ne s'est passé, l'invitation ayant
				// simplement disparu de l'écran.
				if (accept) nav.openConversation(groupeKey(String(threadId)))
			})
			.catch((err: unknown) => setErreur(messageErreurLisible(err, t)))
	}

	return (
		<section
			className="msg-invites"
			aria-label={t("messagerieGroupeInvitations.label")}
		>
			<h3 className="msg-invites-titre">
				{t("messagerieGroupeInvitations.title", { count: liste.length })}
			</h3>
			{erreur !== null ? (
				<p className="msg-error" role="alert">
					{erreur}
				</p>
			) : null}
			<ul className="msg-infos-liste">
				{liste.map((invite) => {
					const invitant = nomAffichable(invite.invitedBy.displayName, t)
					return (
						<li key={String(invite.threadId)}>
							<div className="msg-row" style={{ cursor: "default" }}>
								<Avatar
									displayName={invitant}
									avatarUrl={invite.invitedBy.avatarUrl}
									hasIdentity={invite.invitedBy.source === "published"}
									size={32}
								/>
								<span className="msg-row-main">
									<span className="msg-row-name">{invite.title}</span>
									<span className="msg-row-preview">
										{t("messagerieGroupeInvitations.preview", {
											invitant,
											membres: t("messagerieGroupeInvitations.members", {
												count: invite.memberCount,
											}),
										})}
									</span>
								</span>
								<button
									type="button"
									className="msg-icon-btn"
									aria-label={t("messagerieGroupeInvitations.join", {
										titre: invite.title,
									})}
									title={t("messagerieGroupeInvitations.joinTitle")}
									// Rejoindre : encre des relations (ADR-0027).
									style={{ background: "var(--esp-action-success-fill, transparent)", color: "var(--esp-action-success-on, var(--role-social-ink, currentColor))" }}
									disabled={repondre.isPending}
									onClick={() => repondreA(invite.threadId, true)}
								>
									<Check aria-hidden="true" size={16} />
								</button>
								<button
									type="button"
									className="msg-icon-btn"
									aria-label={t("messagerieGroupeInvitations.decline", {
										titre: invite.title,
									})}
									title={t("messagerieGroupeInvitations.declineTitle")}
									disabled={repondre.isPending}
									onClick={() => repondreA(invite.threadId, false)}
								>
									<X aria-hidden="true" size={16} />
								</button>
							</div>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
