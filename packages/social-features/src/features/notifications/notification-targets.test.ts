// Dupliqué de socle/packages/agent-features/src/features/notifications/notification-targets.test.ts @ ad2e7fdc2 — adaptations : adresses attendues composées sur des adresses INJECTÉES de test (accueil, messagerie, profil, conférence) et non plus sur la base de l'espace agent ; sujet du moteur `{ kind, id }` au lieu des colonnes `subject…Id` ; libellés et phrases lus dans l'i18n du moteur (`t` en dernier paramètre) ; retirés : les deux cas « publication masquée sans base iRéseau » et « barre finale de la base » (la page réseau du moteur est toujours l'accueil, `reseauBaseHref` n'existe plus) ; les cibles de DIRECT portées sur le sujet `liveSession` du moteur et l'adresse injectée `conference(sessionId)` (rétablies au lot `live` : « enregistrement publié » et son rappel `onOpenDirect`, invitation à un direct expirée qui garde son ouverture — le cas « autres genres résolus » garde en plus l'évènement annulé) ; tous les autres cas portés (matrice de l'invitation tranchée comprise) ; ajoutés : base portant déjà une query ou une ancre, album d'un profil, journal iAppel (appel manqué, message vocal), fichier retenu sans cible, nature de sujet inconnue, profil du parrain, rappel jamais offert pour un album ou le journal, phrases de TOUS les genres du moteur (acteur, nom neutre, avis du système, page nommée par le serveur, retrait de parrainage, genre inconnu, anglais) et ligne de résultat (invitation, fichier libéré ou de nouveau analysé).
import type {
	NotificationKind,
	NotificationSubject,
	NotificationSubjectKind,
} from "@antsia/social-domain/notifications"
import { NOTIFICATION_KINDS } from "@antsia/social-domain/notifications"
import { COMMERCE_NOTIFICATION_KINDS } from "@antsia/social-domain/commerceNotifications"
import { describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import {
	connectionInviteOutcome,
	type NotificationRoutes,
	type NotificationTargetInput,
	notificationRowAction,
	notificationRowNote,
	notificationRowSentence,
	notificationTarget,
	targetCallback,
} from "./notification-targets"

const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "notifications" })
const t = i18n.getFixedT("fr")
const tEn = i18n.getFixedT("en")

/** Les adresses injectées de test — l'application seule sait les siennes. */
const HOME = "/fil"
const MESSAGES = "/messages"
const PROFILES = "/profil"
const CONFERENCES = "/conference"
const ROUTES: NotificationRoutes = {
	home: () => HOME,
	messages: () => MESSAGES,
	profile: (handle) => `${PROFILES}/${handle}`,
	conference: (sessionId) => `${CONFERENCES}/${sessionId}`,
}

type ItemOverrides = Partial<NotificationTargetInput> & { readAt?: number | null }

function item(overrides: ItemOverrides = {}): NotificationTargetInput & { readAt?: number | null } {
	return {
		kind: "post_reaction",
		subject: null,
		actor: { handle: null },
		...overrides,
	}
}

function subject(kind: NotificationSubjectKind, id: string): NotificationSubject {
	return { kind, id }
}

describe("notificationTarget — une adresse par nature de sujet", () => {
	it("garde le rappel associatif sur sa route injectée, sans agenda ni callback personnels", () => {
		const notice = item({ kind: "association_event_reminder", subject: subject("event", "ev-asso"), associationEvent: { eventId: "ev-asso", pageHandle: "association-demo" } })
		expect(notificationTarget(notice, ROUTES, t)).toBeNull()
		const routes = { ...ROUTES, associationEvent: (handle: string, eventId: string) => `/pages/${encodeURIComponent(handle)}/evenements/${encodeURIComponent(eventId)}` }
		expect(notificationRowAction(notice, routes, { onOpenPersonalEvent: vi.fn() }, t)).toEqual({ mode: "link", kind: "event", href: "/pages/association-demo/evenements/ev-asso", label: "Ouvrir" })
		expect(notificationTarget({ ...notice, subject: subject("event", "autre") }, routes, t)).toBeNull()
	})
	it("phrase le rappel sans acteur ni contenu en français et en anglais", () => {
		const notice = { kind: "association_event_reminder", actor: { displayName: "Personne sans rapport" } }
		expect(notificationRowSentence(notice, t)).toBe("Rappel : un événement auquel vous êtes inscrit approche.")
		expect(notificationRowSentence(notice, tEn)).toBe("Reminder: an event you registered for is approaching.")
	})
	it("ouvre une publication sur la page réseau, par son paramètre de vue", () => {
		expect(notificationTarget(item({ subject: subject("post", "post-1") }), ROUTES, t)).toEqual({
			kind: "post",
			id: "post-1",
			href: `${HOME}?post=post-1`,
			label: "Ouvrir",
		})
		// Une identité qui porterait des caractères d'adresse est encodée.
		expect(notificationTarget(item({ subject: subject("post", "a b") }), ROUTES, t)?.href).toBe(`${HOME}?post=a%20b`)
	})

	it("ajoute la vue après la query de la base et avant son ancre", () => {
		const routes: NotificationRoutes = { ...ROUTES, home: () => `${HOME}?reseau=antsia#haut` }
		expect(notificationTarget(item({ subject: subject("post", "post-1") }), routes, t)?.href).toBe(`${HOME}?reseau=antsia&post=post-1#haut`)
	})

	it("adresse la conversation de groupe, le groupe et l'évènement", () => {
		expect(notificationTarget(item({ subject: subject("groupThread", "thread-1") }), ROUTES, t)).toMatchObject({
			kind: "groupThread",
			href: `${MESSAGES}/groupe/thread-1`,
		})
		expect(notificationTarget(item({ subject: subject("thematicGroup", "grp-1") }), ROUTES, t)).toMatchObject({
			kind: "group",
			href: `${HOME}?tab=groupes&groupe=grp-1`,
		})
		expect(notificationTarget(item({ subject: subject("event", "ev-1") }), ROUTES, t)).toMatchObject({
			kind: "event",
			href: `${HOME}?tab=evenements`,
		})
	})

	it("fait d'une demande de relation une cible d'invitation, pas un lien de profil", () => {
		expect(
			notificationTarget(item({ kind: "connection_request", subject: subject("connection", "cnx-1") }), ROUTES, t),
		).toEqual({
			kind: "connection",
			id: "cnx-1",
			href: `${HOME}?tab=relations`,
			label: "Répondre",
		})
		// Sans référence de connexion, rien à décider : aucune cible.
		expect(notificationTarget(item({ kind: "connection_request" }), ROUTES, t)).toBeNull()
	})

	it("envoie l'acceptation, le suivi et le parrainage vers le profil de l'acteur, jamais sans @handle", () => {
		for (const kind of ["connection_accepted", "new_follower", "sponsorship_received"]) {
			expect(
				notificationTarget(
					item({
						kind,
						subject: kind === "connection_accepted" ? subject("connection", "cnx-1") : null,
						actor: { handle: "awa.mba" },
					}),
					ROUTES,
					t,
				),
			).toEqual({
				kind: "profile",
				id: "awa.mba",
				href: `${PROFILES}/awa.mba`,
				label: "Voir le profil",
			})
			expect(notificationTarget(item({ kind, actor: { handle: "  " } }), ROUTES, t)).toBeNull()
		}
	})

	it("n'invente rien pour un genre sans sujet", () => {
		expect(notificationTarget(item({ kind: "post_reaction" }), ROUTES, t)).toBeNull()
		expect(notificationTarget(item({ kind: "attestation_verified" }), ROUTES, t)).toBeNull()
	})

	it("ouvre un enregistrement publié sur la page de sa conférence", () => {
		const replay = item({ kind: "live_replay_published", subject: subject("liveSession", "sess-9"), actor: { handle: "awa.mba" } })
		// Même cible que `live_started` : la SESSION, relue avec sa garde.
		expect(notificationTarget(replay, ROUTES, t)).toEqual({
			kind: "direct",
			id: "sess-9",
			href: `${CONFERENCES}/sess-9`,
			label: "Ouvrir",
		})
		expect(notificationRowAction(replay, ROUTES, {}, t)).toEqual({
			mode: "link",
			kind: "direct",
			href: `${CONFERENCES}/sess-9`,
			label: "Ouvrir",
		})
		// L'hôte qui sait ouvrir un direct ouvre aussi son enregistrement.
		expect(notificationRowAction(replay, ROUTES, { onOpenDirect: vi.fn() }, t)).toEqual({ mode: "callback", kind: "direct", id: "sess-9", label: "Ouvrir" })
		// Sans référence de session, aucune cible inventée.
		expect(notificationTarget(item({ kind: "live_started", actor: { handle: "awa.mba" } }), ROUTES, t)).toBeNull()
	})

	it("ouvre un album sur le profil de son propriétaire, jamais sans @handle", () => {
		const album = item({ kind: "album_published", subject: subject("album", "alb-1"), actor: { handle: "awa.mba" } })
		expect(notificationTarget(album, ROUTES, t)).toEqual({
			kind: "album",
			id: "alb-1",
			href: `${PROFILES}/awa.mba/albums/alb-1`,
			label: "Ouvrir",
		})
		expect(notificationTarget({ ...album, actor: null }, ROUTES, t)).toBeNull()
	})

	it("mène l'appel manqué et le message vocal au journal iAppel de la messagerie", () => {
		for (const [kind, subjectKind] of [
			["call_missed", "call"],
			["voicemail_left", "voicemail"],
		] as const) {
			expect(notificationTarget(item({ kind, subject: subject(subjectKind, "s-1") }), ROUTES, t)).toEqual({
				kind: "calls",
				id: "s-1",
				href: `${MESSAGES}?brique=iappel`,
				label: "Ouvrir",
			})
		}
	})

	it("ne fabrique aucune cible pour un fichier retenu ni pour une nature de sujet inconnue", () => {
		expect(notificationTarget(item({ kind: "file_withheld", subject: subject("fileScan", "scan-1") }), ROUTES, t)).toBeNull()
		// Un serveur en avance peut servir une nature que ce client ne connaît pas encore.
		const future = { kind: "reel", id: "s-1" } as unknown as NotificationSubject
		expect(notificationTarget(item({ kind: "post_reaction", subject: future }), ROUTES, t)).toBeNull()
		// Un identifiant vide n'est pas une référence.
		expect(notificationTarget(item({ subject: subject("post", "  ") }), ROUTES, t)).toBeNull()
	})
})

describe("notificationRowAction — rappel de l'hôte, sinon adresse", () => {
	it("préfère le rappel de l'hôte à la navigation", () => {
		const onOpenPost = vi.fn()
		expect(notificationRowAction(item({ subject: subject("post", "post-1") }), ROUTES, { onOpenPost }, t)).toEqual({
			mode: "callback",
			kind: "post",
			id: "post-1",
			label: "Ouvrir",
		})
	})

	it("tombe sur l'adresse quand l'hôte n'offre aucun rappel", () => {
		expect(notificationRowAction(item({ subject: subject("groupThread", "thread-1") }), ROUTES, {}, t)).toEqual({
			mode: "link",
			kind: "groupThread",
			href: `${MESSAGES}/groupe/thread-1`,
			label: "Ouvrir",
		})
	})

	it("décide une invitation SUR PLACE, même quand l'hôte offre un rappel", () => {
		expect(
			notificationRowAction(
				item({ kind: "connection_request", subject: subject("connection", "cnx-1") }),
				ROUTES,
				{ onOpenConnection: vi.fn() },
				t,
			),
		).toEqual({ mode: "connection", connectionId: "cnx-1" })
	})

	it("ne rend aucun geste quand il n'y a pas de cible", () => {
		expect(notificationRowAction(item({ kind: "post_reaction" }), ROUTES, {}, t)).toEqual({ mode: "none" })
		expect(notificationRowAction(item({ kind: "new_follower" }), ROUTES, {}, t)).toEqual({ mode: "none" })
	})

	it("n'offre jamais de rappel pour un album ou le journal d'appels : toujours une adresse", () => {
		const everything = {
			onOpenPost: vi.fn(),
			onOpenGroupThread: vi.fn(),
			onOpenGroup: vi.fn(),
			onOpenPersonalEvent: vi.fn(),
			onOpenConnection: vi.fn(),
			onOpenProfile: vi.fn(),
		}
		expect(targetCallback("album", everything)).toBeUndefined()
		expect(targetCallback("calls", everything)).toBeUndefined()
		expect(targetCallback("profile", everything)).toBe(everything.onOpenProfile)
		// La conférence, elle, s'ouvre sur place quand l'hôte le sait — et seulement alors.
		expect(targetCallback("direct", everything)).toBeUndefined()
		expect(targetCallback("direct", { onOpenDirect: everything.onOpenPost })).toBe(everything.onOpenPost)
		expect(notificationRowAction(item({ kind: "call_missed", subject: subject("call", "c-1") }), ROUTES, everything, t)).toEqual({
			mode: "link",
			kind: "calls",
			href: `${MESSAGES}?brique=iappel`,
			label: "Ouvrir",
		})
	})
})

describe("notificationRowAction — une invitation tranchée ne se décide plus", () => {
	function request(overrides: ItemOverrides = {}) {
		return item({
			kind: "connection_request",
			subject: subject("connection", "cnx-1"),
			...overrides,
		})
	}

	const STATUSES = ["requested", "accepted", "declined", "blocked", "missing"] as const

	it("ne propose de répondre QUE sans résolution ET sans état qui l'interdise (matrice)", () => {
		const resolutions = [
			undefined,
			null,
			{ kind: "accepted", at: 10 },
			{ kind: "declined", at: 10 },
			{ kind: "cancelled", at: 10 },
			{ kind: "expired", at: 10 },
		]
		const states = [
			undefined,
			null,
			...STATUSES.flatMap((status) => [
				{ status, iAmRecipient: true },
				{ status, iAmRecipient: false },
			]),
		]
		for (const resolution of resolutions) {
			for (const inviteState of states) {
				// `readAt` varie à dessein : lire n'est pas décider.
				for (const readAt of [null, 5]) {
					const action = notificationRowAction(request({ resolution, inviteState, readAt }), ROUTES, {}, t)
					const unresolved = resolution === null || resolution === undefined
					const awaitsMe =
						inviteState === null ||
						inviteState === undefined ||
						(inviteState.status === "requested" && inviteState.iAmRecipient)
					const label = JSON.stringify({ resolution, inviteState, readAt })
					if (unresolved && awaitsMe) {
						expect(action, label).toEqual({
							mode: "connection",
							connectionId: "cnx-1",
						})
					} else {
						expect(action.mode, label).toBe("resolved")
					}
				}
			}
		}
	})

	it("dit le résultat stocké, qui l'emporte sur l'état vivant", () => {
		expect(notificationRowAction(request({ resolution: { kind: "accepted", at: 10 }, readAt: 10 }), ROUTES, {}, t)).toEqual({
			mode: "resolved",
			text: "Vous avez accepté cette invitation.",
		})
		expect(notificationRowAction(request({ resolution: { kind: "declined", at: 10 } }), ROUTES, {}, t)).toEqual({
			mode: "resolved",
			text: "Invitation déclinée.",
		})
		expect(notificationRowAction(request({ resolution: { kind: "cancelled", at: 10 } }), ROUTES, {}, t)).toEqual({
			mode: "resolved",
			text: "Invitation annulée.",
		})
		// La connexion a disparu depuis : la décision prise reste ce qu'on dit.
		expect(
			notificationRowAction(
				request({
					resolution: { kind: "accepted", at: 10 },
					inviteState: { status: "missing", iAmRecipient: false },
				}),
				ROUTES,
				{},
				t,
			),
		).toEqual({ mode: "resolved", text: "Vous avez accepté cette invitation." })
	})

	it("tombe sur la phrase générique pour une résolution qu'il ne sait pas dire", () => {
		expect(notificationRowAction(request({ resolution: { kind: "genre_a_venir", at: 10 } }), ROUTES, {}, t)).toEqual({
			mode: "resolved",
			text: "Invitation déjà traitée.",
		})
	})

	it("garde ses boutons à une invitation LUE mais non tranchée", () => {
		expect(notificationRowAction(request({ readAt: 5 }), ROUTES, {}, t)).toEqual({
			mode: "connection",
			connectionId: "cnx-1",
		})
		expect(
			notificationRowAction(
				request({
					readAt: 5,
					resolution: null,
					inviteState: { status: "requested", iAmRecipient: true },
				}),
				ROUTES,
				{},
				t,
			),
		).toEqual({ mode: "connection", connectionId: "cnx-1" })
	})

	it("lit l'état vivant quand rien n'est stocké : déjà traitée, ou annulée", () => {
		expect(notificationRowAction(request({ inviteState: { status: "accepted", iAmRecipient: true } }), ROUTES, {}, t)).toEqual({
			mode: "resolved",
			text: "Invitation déjà traitée.",
		})
		expect(notificationRowAction(request({ inviteState: { status: "requested", iAmRecipient: false } }), ROUTES, {}, t)).toEqual({
			mode: "resolved",
			text: "Invitation déjà traitée.",
		})
		expect(notificationRowAction(request({ inviteState: { status: "missing", iAmRecipient: false } }), ROUTES, {}, t)).toEqual({
			mode: "resolved",
			text: "Invitation annulée.",
		})
	})

	it("dit le résultat même sans référence de connexion, et malgré un rappel de l'hôte", () => {
		expect(
			notificationRowAction(request({ subject: null, resolution: { kind: "declined", at: 10 } }), ROUTES, {}, t),
		).toEqual({ mode: "resolved", text: "Invitation déclinée." })
		expect(
			notificationRowAction(request({ resolution: { kind: "accepted", at: 10 } }), ROUTES, { onOpenConnection: vi.fn() }, t),
		).toEqual({ mode: "resolved", text: "Vous avez accepté cette invitation." })
	})

	it("ne retire pas l'ouverture des AUTRES genres résolus", () => {
		// La liste dit le résultat en plus ; l'action reste celle du sujet.
		expect(
			notificationRowAction(
				item({
					kind: "thematic_group_invite",
					subject: subject("thematicGroup", "grp-1"),
					resolution: { kind: "declined", at: 10 },
				}),
				ROUTES,
				{},
				t,
			),
		).toEqual({
			mode: "link",
			kind: "group",
			href: `${HOME}?tab=groupes&groupe=grp-1`,
			label: "Ouvrir",
		})
		expect(
			notificationRowAction(
				item({
					kind: "event_invite",
					subject: subject("event", "ev-1"),
					resolution: { kind: "cancelled", at: 10 },
				}),
				ROUTES,
				{},
				t,
			),
		).toEqual({
			mode: "link",
			kind: "event",
			href: `${HOME}?tab=evenements`,
			label: "Ouvrir",
		})
		expect(
			notificationRowAction(
				item({
					kind: "live_invite",
					subject: subject("liveSession", "sess-1"),
					resolution: { kind: "expired", at: 10 },
				}),
				ROUTES,
				{},
				t,
			),
		).toEqual({
			mode: "link",
			kind: "direct",
			href: `${CONFERENCES}/sess-1`,
			label: "Ouvrir",
		})
	})
})

describe("connectionInviteOutcome — relire avant d'agir", () => {
	it("n'autorise la réponse qu'au destinataire d'une demande en attente", () => {
		expect(connectionInviteOutcome({ status: "requested", iAmRecipient: true }, t)).toEqual({ actionable: true })
	})

	it("distingue une invitation annulée d'une invitation déjà traitée", () => {
		expect(connectionInviteOutcome({ status: "missing", iAmRecipient: false }, t)).toEqual({
			actionable: false,
			message: "Invitation annulée.",
		})
		for (const status of ["accepted", "declined", "blocked"] as const) {
			expect(connectionInviteOutcome({ status, iAmRecipient: true }, t)).toEqual({
				actionable: false,
				message: "Invitation déjà traitée.",
			})
		}
	})

	it("refuse au DEMANDEUR de répondre à sa propre invitation", () => {
		expect(connectionInviteOutcome({ status: "requested", iAmRecipient: false }, t)).toEqual({
			actionable: false,
			message: "Invitation déjà traitée.",
		})
	})
})

describe("notificationRowSentence — ce que dit la ligne, pour TOUS les genres du moteur", () => {
	const OTHER = "Nouvelle activité dans le réseau."
	const SYSTEM_KINDS: readonly NotificationKind[] = ["membership_changed", "badge_changed", "moderation_decision", "report_received", "report_decided", "page_post", "file_withheld", "attestation_verified", "attestation_not_confirmed", "association_event_reminder"]

	it("chaque genre du domaine a sa phrase — jamais une clé brute, jamais la phrase générique", () => {
		for (const kind of NOTIFICATION_KINDS) {
			const sentence = notificationRowSentence({ kind, actor: { displayName: "Awa" } }, t)
			expect(sentence, kind).not.toMatch(/^(notifications|reseau):/)
			expect(sentence, kind).not.toBe(OTHER)
			// Un avis du système ne nomme personne ; tous les autres nomment l'acteur.
			if (SYSTEM_KINDS.includes(kind)) expect(sentence, kind).not.toContain("Awa")
			else expect(sentence, kind).toContain("Awa")
		}
	})

	it("phrase les genres que le moteur ajoute", () => {
		const awa = { displayName: "Awa" }
		expect(notificationRowSentence({ kind: "call_missed", actor: awa }, t)).toBe("Awa a cherché à vous joindre.")
		expect(notificationRowSentence({ kind: "voicemail_left", actor: awa }, t)).toBe("Awa vous a laissé un message vocal.")
		expect(notificationRowSentence({ kind: "album_published", actor: awa }, t)).toBe("Awa a publié un album.")
		expect(notificationRowSentence({ kind: "page_post", actor: null }, t)).toBe("Une page que vous suivez a publié.")
		// La page NOMMÉE par le serveur ; retirée (`null`) ou au nom vide, la phrase sans nom.
		expect(notificationRowSentence({ kind: "page_post", actor: null, page: { name: "Direction des Impôts" } }, t)).toBe(
			"Direction des Impôts a publié.",
		)
		expect(notificationRowSentence({ kind: "page_post", actor: null, page: null }, t)).toBe("Une page que vous suivez a publié.")
		expect(notificationRowSentence({ kind: "page_post", actor: null, page: { name: "  " } }, t)).toBe("Une page que vous suivez a publié.")
		expect(notificationRowSentence({ kind: "file_withheld", actor: null }, t)).toBe(
			"Un fichier déposé a été retenu par l'analyse de sécurité.",
		)
		expect(notificationRowSentence({ kind: "sponsorship_received", actor: awa }, t)).toBe("Awa vous parraine.")
		expect(notificationRowSentence({ kind: "attestation_verified", actor: null }, t)).toBe(
			"Votre inscription consulaire est confirmée : votre compte est vérifié.",
		)
		expect(notificationRowSentence({ kind: "attestation_not_confirmed", actor: null }, t)).toBe(
			"Nous n'avons pas pu confirmer votre inscription consulaire.",
		)
	})

	it("un retrait de parrainage nomme le parrain, ou se dit au passif quand la modération l'a fait", () => {
		expect(notificationRowSentence({ kind: "sponsorship_withdrawn", actor: { displayName: "Awa" } }, t)).toBe(
			"Awa a retiré son parrainage.",
		)
		expect(notificationRowSentence({ kind: "sponsorship_withdrawn", actor: null }, t)).toBe("Votre parrainage a été retiré.")
	})

	it("P10 : un contact commercial nomme l'acteur projeté par la cloche, sans contenu ni boutique ; sans acteur, la phrase du système", () => {
		expect(notificationRowSentence({ kind: "commercial_contact", actor: { displayName: "Awa" } }, t)).toBe(
			"Nouvelle activité dans votre conversation commerciale avec Awa.",
		)
		expect(notificationRowSentence({ kind: "commercial_contact", actor: { displayName: "Awa" } }, tEn)).toBe(
			"New activity in your commercial conversation with Awa.",
		)
		expect(notificationRowSentence({ kind: "commercial_contact", actor: { displayName: null } }, t)).toBe(
			"Nouvelle activité dans votre conversation commerciale avec Membre du réseau.",
		)
		expect(notificationRowSentence({ kind: "commercial_contact", actor: null }, t)).toBe("Une conversation commerciale a une nouvelle activité.")
	})

	it("nomme par le libellé neutre un acteur au profil non publié, ou absent d'un genre qui en attend un", () => {
		expect(notificationRowSentence({ kind: "post_reaction", actor: { displayName: null } }, t)).toBe(
			"Membre du réseau a réagi à votre publication.",
		)
		expect(notificationRowSentence({ kind: "album_published", actor: null }, t)).toBe("Membre du réseau a publié un album.")
		expect(notificationRowSentence({ kind: "mention", actor: { displayName: "  " } }, t)).toBe("Membre du réseau vous a cité.")
	})

	it("dit une phrase générique pour un genre que ce client ne connaît pas encore", () => {
		expect(notificationRowSentence({ kind: "genre_a_venir", actor: { displayName: "Awa" } }, t)).toBe(OTHER)
		expect(notificationRowSentence({ kind: "toString", actor: null }, t)).toBe(OTHER)
	})

	it("parle la langue de l'écran", () => {
		expect(notificationRowSentence({ kind: "call_missed", actor: { displayName: "Awa" } }, tEn)).toBe("Awa tried to reach you.")
		expect(notificationRowSentence({ kind: "sponsorship_withdrawn", actor: null }, tEn)).toBe("Your sponsorship was withdrawn.")
	})
})

describe("notificationRowNote — ce qu'est DEVENU le sujet", () => {
	it("reprend le résultat d'une invitation de relation tranchée", () => {
		const action = { mode: "resolved", text: "Invitation déclinée." } as const
		expect(notificationRowNote({ kind: "connection_request" }, action, t)).toBe("Invitation déclinée.")
	})

	it("dit le résultat des autres invitations, en plus de leur ouverture", () => {
		const action = { mode: "link", kind: "groupThread", href: `${MESSAGES}/groupe/t-1`, label: "Ouvrir" } as const
		expect(notificationRowNote({ kind: "group_added", resolution: { kind: "accepted", at: 10 } }, action, t)).toBe(
			"Invitation acceptée.",
		)
		expect(notificationRowNote({ kind: "event_invite", resolution: { kind: "maybe", at: 10 } }, action, t)).toBe(
			"Vous avez répondu « peut-être ».",
		)
		// Rien de tranché, ou un genre sans résultat à dire : la ligne se tait.
		expect(notificationRowNote({ kind: "group_added", resolution: null }, action, t)).toBeNull()
		expect(notificationRowNote({ kind: "post_reaction", resolution: { kind: "accepted", at: 10 } }, action, t)).toBeNull()
	})

	it("dit le statut VIVANT d'un fichier retenu : libéré, ou de nouveau à l'analyse", () => {
		const none = { mode: "none" } as const
		for (const status of ["clean", "skipped"] as const) {
			expect(notificationRowNote({ kind: "file_withheld", fileScanStatus: status }, none, t)).toBe("Ce fichier a depuis été libéré.")
		}
		for (const status of ["pending", "running"] as const) {
			expect(notificationRowNote({ kind: "file_withheld", fileScanStatus: status }, none, t)).toBe(
				"Ce fichier est de nouveau en cours d'analyse.",
			)
		}
		// Toujours retenu (ou statut inconnu) : la phrase suffit.
		for (const status of ["suspicious", "infected", "error", null, undefined] as const) {
			expect(notificationRowNote({ kind: "file_withheld", fileScanStatus: status }, none, t)).toBeNull()
		}
	})
})

/** P14B (écrit, non exécuté) : destinations TYPÉES relues par le serveur et phrases des avis commerce. */
describe("P14B — destinations typées et avis commerce", () => {
	const TYPED: NotificationRoutes = {
		...ROUTES,
		commercialConversation: (threadId) => `/messages/commerce/${threadId}`,
		serviceRequest: (requestRowId) => `/mes-demandes/${requestRowId}`,
		jobApplication: (applicationId) => `/mes-candidatures/${applicationId}`,
		pageModerationDecisions: (pageId) => `/mes-donnees#decisions-page-${pageId}`,
		personalDecisions: () => "/mes-donnees",
		personalReports: () => "/mes-donnees#mes-signalements",
	}

	it("la destination typée l'emporte sur le sujet commun et se compose sur les adresses injectées", () => {
		expect(notificationTarget(item({ kind: "commerce_service_booking_confirmed", target: { kind: "serviceRequest", requestRowId: "demande-1" } }), TYPED, t))
			.toEqual({ kind: "serviceRequest", id: "demande-1", href: "/mes-demandes/demande-1", label: "Ouvrir" })
		expect(notificationTarget(item({ kind: "commerce_job_application_updated", target: { kind: "jobApplication", applicationId: "cand-1" } }), TYPED, t))
			.toEqual({ kind: "jobApplication", id: "cand-1", href: "/mes-candidatures/cand-1", label: "Ouvrir" })
		expect(notificationTarget(item({ kind: "commerce_service_quote_accepted", target: { kind: "commercialThread", threadId: "fil-1" } }), TYPED, t))
			.toEqual({ kind: "commercialThread", id: "fil-1", href: "/messages/commerce/fil-1", label: "Ouvrir" })
		expect(notificationTarget(item({ kind: "moderation_decision", subject: subject("report", "r1"), target: { kind: "pageModerationDecisions", pageId: "page-1", pageHandle: "page-demo" } }), TYPED, t))
			.toEqual({ kind: "decisions", id: "page-1", href: "/mes-donnees#decisions-page-page-1", label: "Voir les décisions" })
		expect(notificationTarget(item({ kind: "moderation_decision", subject: subject("report", "r1"), target: { kind: "personalDecisions" } }), TYPED, t))
			.toEqual({ kind: "decisions", id: "personal", href: "/mes-donnees", label: "Voir les décisions" })
		// SU01d : l'accusé de réception et la décision au déclarant ouvrent « Mes signalements ».
		for (const kind of ["report_received", "report_decided"] as const) {
			expect(notificationTarget(item({ kind, subject: subject("report", "r1"), target: { kind: "personalReports" } }), TYPED, t))
				.toEqual({ kind: "reports", id: "personal", href: "/mes-donnees#mes-signalements", label: "Voir mes signalements" })
			expect(notificationTarget(item({ kind, subject: subject("report", "r1"), target: { kind: "personalReports" } }), ROUTES, t)).toBeNull()
		}
	})

	it("SU01d : l'accusé de réception et la décision se disent sans acteur, sans contenu ni sanction", () => {
		expect(notificationRowSentence({ kind: "report_received", actor: null }, t)).toBe("Votre signalement a bien été reçu. Vous serez informé de la décision.")
		expect(notificationRowSentence({ kind: "report_decided", actor: { displayName: "Awa" } }, t)).toBe("Une décision a été prise sur votre signalement.")
	})

	it("une application qui ne sert pas la nature n'invente aucune adresse ; la mise en relation DIASPORALE ne se route pas ici", () => {
		expect(notificationTarget(item({ kind: "commerce_service_booking_confirmed", target: { kind: "serviceRequest", requestRowId: "demande-1" } }), ROUTES, t)).toBeNull()
		expect(notificationTarget(item({ kind: "moderation_decision", subject: subject("report", "r1"), target: { kind: "personalDecisions" } }), ROUTES, t)).toBeNull()
		expect(notificationTarget(item({ kind: "service_request_received", target: { kind: "diasporaServiceNotice", audience: "provider", subjectKind: "serviceRequest", subjectId: "sr-1", requestId: "sr-1", pageHandle: "salon-demo" } }), TYPED, t)).toBeNull()
		// Sans destination typée (`null`), la cible du sujet commun reste la règle ; une décision sans destination n'a pas de lien.
		expect(notificationTarget(item({ subject: subject("post", "post-1"), target: null }), TYPED, t)?.href).toBe(`${HOME}?post=post-1`)
		expect(notificationTarget(item({ kind: "moderation_decision", subject: subject("report", "r1"), target: null }), TYPED, t)).toBeNull()
		// Identifiant vide : aucune adresse.
		expect(notificationTarget(item({ kind: "commerce_job_application_updated", target: { kind: "jobApplication", applicationId: "  " } }), TYPED, t)).toBeNull()
	})

	it("une destination typée sort toujours en lien (aucun rappel d'hôte), et ne propose pas « Marquer lu »", () => {
		const targets = { onOpenPost: vi.fn(), onOpenProfile: vi.fn() }
		expect(notificationRowAction(item({ kind: "commerce_service_booking_held", target: { kind: "serviceRequest", requestRowId: "demande-1" } }), TYPED, targets, t))
			.toEqual({ mode: "link", kind: "serviceRequest", href: "/mes-demandes/demande-1", label: "Ouvrir" })
		expect(notificationRowAction(item({ kind: "commerce_service_booking_held", target: null }), TYPED, targets, t)).toEqual({ mode: "none" })
		for (const kind of ["serviceRequest", "jobApplication", "decisions"] as const) expect(targetCallback(kind, targets)).toBeUndefined()
	})

	it("chaque genre commerce a sa phrase du système : ni acteur, ni clé brute, ni phrase générique", () => {
		for (const kind of COMMERCE_NOTIFICATION_KINDS) {
			const sentence = notificationRowSentence({ kind, actor: { displayName: "Awa" } }, t)
			expect(sentence, kind).not.toMatch(/^(notifications|reseau):/)
			expect(sentence, kind).not.toBe("Nouvelle activité dans le réseau.")
			expect(sentence, kind).not.toContain("Awa")
			expect(notificationRowSentence({ kind, actor: null }, tEn), kind).not.toBe("New activity in the network.")
		}
		expect(notificationRowSentence({ kind: "commerce_service_quote_received", actor: null }, t)).toBe("Un devis vous attend pour votre demande de service.")
		expect(notificationRowSentence({ kind: "commerce_job_application_updated", actor: null }, tEn)).toBe("Your job application status has changed.")
	})

	it("une décision visant une page représentée nomme la page (carte publique), jamais le motif ; sans carte, la phrase personnelle", () => {
		expect(notificationRowSentence({ kind: "moderation_decision", actor: null, page: { name: "Cabinet de recette" } }, t))
			.toBe("Une décision de modération concerne la page Cabinet de recette. Consultez ses décisions et recours.")
		expect(notificationRowSentence({ kind: "moderation_decision", actor: null, page: null }, t))
			.toBe("Une décision de modération vous concerne. Consultez vos décisions et recours.")
		expect(notificationRowSentence({ kind: "moderation_decision", actor: null, page: { name: "  " } }, tEn))
			.toBe("A moderation decision concerns you. View your decisions and appeals.")
	})
})
