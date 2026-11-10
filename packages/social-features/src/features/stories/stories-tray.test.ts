// Dupliqué de socle/packages/agent-features/src/features/stories/stories-tray.test.ts @ ad2e7fdc2 — adaptations : groupes au DTO du moteur (`personId`, `cover` toujours porté) ; cas du champ de compatibilité `coverUrl` et de la vignette absente retirés (le moteur écarte un groupe sans vignette) ; libellés lus par l'i18n du moteur (`t` français, mêmes phrases attendues) ; cas ajoutés : nom neutre d'un auteur sans nom, libellé anglais, instant arrondi des lectures, prénom d'un médaillon (présentation « rings ») ; anneau dessiné de ma série en médaillons (ADR-0028).
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
	drawnRingState,
	orderTray,
	ringStateFor,
	STORY_QUERY_STEP_MS,
	storyAgeLabel,
	storyAuthorName,
	storyAuthorShortName,
	storyQueryInstant,
	trayCoverFor,
	trayTileLabel,
	trayVisible,
	type StoryTrayGroup,
} from "./stories-tray"

const HOUR = 60 * 60 * 1000

const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "stories" })
const t = i18n.getFixedT("fr")
const tEn = i18n.getFixedT("en")

function group(
	handle: string | null,
	overrides: Partial<StoryTrayGroup> = {},
): StoryTrayGroup {
	return {
		author: {
			personId: `person-${handle ?? "anonyme"}`,
			handle,
			displayName: handle ?? "Sans profil",
			avatarUrl: null,
		},
		storyCount: 1,
		unseenCount: 0,
		latestPublishedAt: 0,
		cover: { url: "i.jpg", kind: "image" },
		...overrides,
	}
}

describe("trayCoverFor — la vignette et son élément", () => {
	it("rend la vidéo la plus récente AVEC son kind — c'est elle la vignette", () => {
		expect(
			trayCoverFor(group("bob", { cover: { url: "v.mp4", kind: "video" } })),
		).toEqual({ url: "v.mp4", kind: "video" })
	})

	it("rend l'image quand c'est elle la plus récente", () => {
		expect(
			trayCoverFor(group("bob", { cover: { url: "i.jpg", kind: "image" } })),
		).toEqual({ url: "i.jpg", kind: "image" })
	})
})

describe("orderTray", () => {
	it("place MA vignette en tête, même si elle est la plus ancienne", () => {
		const mine = group("moi", { latestPublishedAt: 10 })
		const other = group("marie", { latestPublishedAt: 900 })
		const ordered = orderTray([other, mine], "moi")
		expect(ordered.map((entry) => entry.author.handle)).toEqual([
			"moi",
			"marie",
		])
	})

	it("fait passer les non-vues avant les vues", () => {
		const seen = group("marie", { unseenCount: 0, latestPublishedAt: 900 })
		const unseen = group("paul", { unseenCount: 2, latestPublishedAt: 100 })
		const ordered = orderTray([seen, unseen], null)
		expect(ordered.map((entry) => entry.author.handle)).toEqual([
			"paul",
			"marie",
		])
	})

	it("trie à égalité de statut du plus récent au plus ancien", () => {
		const older = group("a", { unseenCount: 1, latestPublishedAt: 100 })
		const newer = group("b", { unseenCount: 3, latestPublishedAt: 400 })
		expect(
			orderTray([older, newer], null).map((entry) => entry.author.handle),
		).toEqual(["b", "a"])
	})

	it("ne mute jamais le tableau reçu — il vient d'un cache partagé", () => {
		const source = [
			group("marie", { latestPublishedAt: 10 }),
			group("moi", { latestPublishedAt: 5 }),
		]
		const snapshot = source.map((entry) => entry.author.handle)
		orderTray(source, "moi")
		expect(source.map((entry) => entry.author.handle)).toEqual(snapshot)
	})

	it("ne désigne personne comme « moi » quand le handle propre est nul", () => {
		const anonymous = group(null, { latestPublishedAt: 10 })
		const other = group("marie", { latestPublishedAt: 900 })
		expect(
			orderTray([anonymous, other], null).map((entry) => entry.author.handle),
		).toEqual(["marie", null])
	})

	it("rend un tableau vide pour un plateau vide", () => {
		expect(orderTray([], "moi")).toEqual([])
	})
})

describe("ringStateFor", () => {
	it("rend « self » sur ma propre vignette", () => {
		expect(ringStateFor(group("moi"), "moi")).toBe("self")
	})

	it("rend « self » MÊME avec des non-vues — le serveur n'en écrit jamais", () => {
		expect(ringStateFor(group("moi", { unseenCount: 4 }), "moi")).toBe("self")
	})

	it("rend « unseen » dès une story non vue", () => {
		expect(ringStateFor(group("marie", { unseenCount: 1 }), "moi")).toBe(
			"unseen",
		)
	})

	it("rend « seen » quand tout a été regardé", () => {
		expect(ringStateFor(group("marie", { unseenCount: 0 }), "moi")).toBe("seen")
	})

	it("ne confond pas deux profils non publiés", () => {
		expect(ringStateFor(group(null, { unseenCount: 1 }), null)).toBe("unseen")
	})

	it("traite un handle propre vide comme absent", () => {
		expect(ringStateFor(group("marie"), "")).toBe("seen")
	})
})

describe("drawnRingState — l'anneau dessiné", () => {
	it("en médaillons, ma série porte le dégradé du thème, comme une série à voir", () => {
		expect(drawnRingState("self", true)).toBe("unseen")
		expect(drawnRingState("unseen", true)).toBe("unseen")
		expect(drawnRingState("seen", true)).toBe("seen")
	})

	it("les cartes gardent les trois états tels quels", () => {
		expect(drawnRingState("self", false)).toBe("self")
		expect(drawnRingState("seen", false)).toBe("seen")
	})
})

describe("trayVisible", () => {
	it("montre la barre dès qu'un groupe existe", () => {
		expect(trayVisible([group("marie")], false)).toBe(true)
	})

	it("montre la barre pour la seule tuile de création", () => {
		expect(trayVisible([], true)).toBe(true)
	})

	it("efface la barre quand il n'y a ni story ni droit d'en créer", () => {
		expect(trayVisible([], false)).toBe(false)
	})
})

describe("storyAgeLabel", () => {
	it("dit « à l'instant » sous la minute", () => {
		expect(storyAgeLabel(1_000, 40_000, t)).toBe("à l'instant")
	})

	it("compte les minutes", () => {
		expect(storyAgeLabel(0, 12 * 60_000, t)).toBe("il y a 12 min")
	})

	it("compte les heures", () => {
		expect(storyAgeLabel(0, 3 * HOUR + 20 * 60_000, t)).toBe("il y a 3 h")
	})

	it("dit « expirée » au-delà des vingt-quatre heures", () => {
		expect(storyAgeLabel(0, 25 * HOUR, t)).toBe("expirée")
	})

	it("tient la frontière des vingt-quatre heures", () => {
		expect(storyAgeLabel(0, 24 * HOUR - 1, t)).toBe("il y a 23 h")
		expect(storyAgeLabel(0, 24 * HOUR, t)).toBe("expirée")
	})

	it("ne dit jamais le futur quand l'horloge client est en avance", () => {
		expect(storyAgeLabel(5_000, 0, t)).toBe("à l'instant")
	})

	it("parle la langue de l'écran", () => {
		expect(storyAgeLabel(0, 12 * 60_000, tEn)).toBe("12 min ago")
	})
})

describe("trayTileLabel", () => {
	it("nomme ma propre série", () => {
		expect(trayTileLabel(group("moi", { storyCount: 2 }), "moi", undefined, t)).toBe(
			"Votre actu, 2 actus",
		)
	})

	it("accorde le singulier", () => {
		expect(
			trayTileLabel(
				group("marie", { storyCount: 1, unseenCount: 1 }),
				"moi",
				undefined,
				t,
			),
		).toBe("Actus de marie, 1 actu, 1 non vue")
	})

	it("énonce le décompte des non-vues au pluriel", () => {
		expect(
			trayTileLabel(
				group("marie", { storyCount: 5, unseenCount: 3 }),
				"moi",
				undefined,
				t,
			),
		).toBe("Actus de marie, 5 actus, 3 non vues")
	})

	it("tait le décompte quand tout est vu — « 0 non vue » n'apprend rien", () => {
		expect(trayTileLabel(group("marie", { storyCount: 4 }), "moi", undefined, t)).toBe(
			"Actus de marie, 4 actus",
		)
	})

	it("ajoute l'âge quand l'horloge est fournie", () => {
		expect(
			trayTileLabel(
				group("marie", { storyCount: 2, latestPublishedAt: 0 }),
				"moi",
				2 * HOUR,
				t,
			),
		).toBe("Actus de marie, 2 actus, il y a 2 h")
	})

	it("tait l'âge quand aucune horloge n'est donnée", () => {
		expect(
			trayTileLabel(group("marie", { storyCount: 2 }), "moi", undefined, t),
		).not.toContain("il y a")
	})

	it("nomme un auteur que le moteur ne peut pas nommer par le libellé neutre", () => {
		const unnamed = group(null, {
			author: { personId: "person-x", handle: null, displayName: null, avatarUrl: null },
			storyCount: 2,
		})
		expect(trayTileLabel(unnamed, "moi", undefined, t)).toBe(
			"Actus de Membre du réseau, 2 actus",
		)
	})

	it("parle la langue de l'écran", () => {
		expect(
			trayTileLabel(
				group("marie", { storyCount: 5, unseenCount: 1 }),
				"moi",
				undefined,
				tEn,
			),
		).toBe("Stories by marie, 5 stories, 1 unseen")
	})
})

describe("storyAuthorName — jamais un nom vide", () => {
	it("rend le nom quand le moteur en porte un", () => {
		expect(storyAuthorName("Marie Ndong", t)).toBe("Marie Ndong")
	})

	it("rend le libellé neutre traduit sinon", () => {
		expect(storyAuthorName(null, t)).toBe("Membre du réseau")
		expect(storyAuthorName(null, tEn)).toBe("Network member")
	})
})

describe("storyAuthorShortName — le prénom d'un médaillon (présentation « rings »)", () => {
	it("retient le prénom, que le NOM en majuscules vienne avant ou après", () => {
		expect(storyAuthorShortName("Awa NDONG", t)).toBe("Awa")
		expect(storyAuthorShortName("NDONG MBA Awa", t)).toBe("Awa")
		expect(storyAuthorShortName("Jean-Rémy ÉLOÏSE", t)).toBe("Jean-Rémy")
		expect(storyAuthorShortName("  Clarisse   OBAME ", t)).toBe("Clarisse")
	})

	it("à défaut de prénom reconnaissable, le premier mot ; sans nom, le libellé neutre", () => {
		expect(storyAuthorShortName("NDONG", t)).toBe("NDONG")
		expect(storyAuthorShortName("Recette", t)).toBe("Recette")
		expect(storyAuthorShortName(null, t)).toBe("Membre du réseau")
		expect(storyAuthorShortName("   ", tEn)).toBe("Network member")
	})
})

describe("storyQueryInstant — l'instant des lectures du serveur", () => {
	it("arrondit au pas inférieur : stable d'un rendu à l'autre dans le même pas", () => {
		const base = 1_000 * STORY_QUERY_STEP_MS
		expect(storyQueryInstant(base)).toBe(base)
		expect(storyQueryInstant(base + 1)).toBe(base)
		expect(storyQueryInstant(base + STORY_QUERY_STEP_MS - 1)).toBe(base)
		expect(storyQueryInstant(base + STORY_QUERY_STEP_MS)).toBe(
			base + STORY_QUERY_STEP_MS,
		)
	})

	it("ne remonte jamais dans le futur", () => {
		const now = 1_760_000_123_456
		expect(storyQueryInstant(now)).toBeLessThanOrEqual(now)
		expect(now - storyQueryInstant(now)).toBeLessThan(STORY_QUERY_STEP_MS)
	})

	it("rend l'instant tel quel sur un pas absurde", () => {
		expect(storyQueryInstant(12_345, 0)).toBe(12_345)
		expect(storyQueryInstant(12_345, Number.NaN)).toBe(12_345)
	})
})
