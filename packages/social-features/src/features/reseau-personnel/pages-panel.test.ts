// Réécrit d'après socle/packages/agent-features/src/features/reseau-personnel/pages-panel.test.ts @ ad2e7fdc2 — ce qui change : pages au DTO du moteur (badge, nature, pays ; plus d'organisation) ; sections désignées par leur nature (`kind`) ; libellés lus dans l'i18n du moteur (français, et anglais pour la langue) ; nombres mis en forme par `Intl` ; refus lus dans le CODE du moteur (une phrase arrivée telle quelle n'est plus jamais montrée) ; deux cas retirés (compteur de publications : l'annuaire du moteur n'en porte plus, la fiche si — mêmes cas dans `profil-page.test.ts`) ; cas ajoutés : sigle, pays, badge calculé, natures et rôles, invitation, ligne de méta, brouillon de création.
/**
 * pages-panel — ce que le volet Pages décide, vérifié :
 *
 *  1. la recherche tolère accents et casse, sur le nom, le sigle ET l'adresse ;
 *  2. une suggestion déjà suivie ne s'affiche jamais deux fois ;
 *  3. une recherche active fusionne « suivies » et « à découvrir » en une
 *     seule section, toujours dédoublonnée ;
 *  4. le filtre par pays ne retire que des pages d'un autre pays ;
 *  5. les libellés accordent le pluriel et disent l'état, jamais l'inverse ;
 *  6. le badge est celui que le serveur a calculé, nommé tel quel ;
 *  7. un refus se montre par son code, jamais par sa trace ni par une phrase
 *     arrivée telle quelle ;
 *  8. un brouillon de page se juge avec les règles mêmes du serveur.
 */
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
  checkPageDraft,
  countryName,
  countryOptions,
  emptyPageDraft,
  emptyPagesText,
  filterPages,
  filterPagesByCountry,
  followActionErrorMessage,
  followedTruncatedText,
  followLabel,
  formatFollowerCount,
  MEMBER_OWNER_KINDS,
  normalizeQuery,
  ownerKindLabel,
  PAGE_ACTION_ERROR_FALLBACK_KEY,
  PAGE_COUNTRY_CODES,
  pageActionErrorMessage,
  pageBadgeView,
  pageHandlePreview,
  pageInvitationAcceptedText,
  pageInvitationText,
  pageMetaLine,
  pageRoleLabel,
  PAGES_FOLLOWED_CATALOG_SIZE,
  PAGES_SEARCH_MIN_LENGTH,
  PAGES_SUGGESTIONS_RAIL_LIMIT,
  pagesErrorText,
  pagesSectionTitle,
  pagesServerSearchTerm,
  sectionsFor,
  suggestionsForRail,
  type PageDraft,
  type PageSummary,
} from "./pages-panel"

const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" })
const t = i18n.getFixedT("fr")
const tEn = i18n.getFixedT("en")
/** Un nombre tel que la langue courante l'écrit (espace insécable fine en français). */
const nombre = (n: number) => new Intl.NumberFormat("fr").format(n)

function page(overrides: Partial<PageSummary> & { pageId: string }): PageSummary {
  return {
    handle: overrides.pageId,
    name: overrides.pageId,
    shortName: null,
    logoUrl: null,
    description: null,
    badge: "community",
    ownerKind: "association",
    country: null,
    followerCount: 0,
    following: false,
    ...overrides,
  }
}

describe("normalizeQuery", () => {
  it("passe en minuscules et retire les espaces superflus", () => {
    expect(normalizeQuery("  MINISTÈRE  ")).toBe("ministere")
  })

  it("plie les accents et diacritiques courants", () => {
    expect(normalizeQuery("Économie")).toBe("economie")
    expect(normalizeQuery("Impôts")).toBe("impots")
    expect(normalizeQuery("Éducation Nationale")).toBe("education nationale")
    expect(normalizeQuery("Garçon")).toBe("garcon")
  })

  it("laisse un texte déjà normalisé inchangé", () => {
    expect(normalizeQuery("finances")).toBe("finances")
  })

  it("rend une chaîne vide pour une entrée vide ou blanche", () => {
    expect(normalizeQuery("")).toBe("")
    expect(normalizeQuery("   ")).toBe("")
  })
})

describe("filterPages", () => {
  const pages = [
    page({ pageId: "a", name: "Association des Gabonais de Lyon", handle: "agl" }),
    page({ pageId: "b", name: "Direction des Impôts", handle: "dgi" }),
  ]

  it("rend la MÊME référence quand la requête est vide", () => {
    expect(filterPages(pages, "")).toBe(pages)
    expect(filterPages(pages, "   ")).toBe(pages)
  })

  it("filtre sur le nom, tolérant à l'accent et à la casse", () => {
    expect(filterPages(pages, "impots").map((p) => p.pageId)).toEqual(["b"])
    expect(filterPages(pages, "IMPÔTS").map((p) => p.pageId)).toEqual(["b"])
  })

  it("filtre aussi sur le handle", () => {
    expect(filterPages(pages, "dgi").map((p) => p.pageId)).toEqual(["b"])
  })

  it("filtre aussi sur le SIGLE, que le serveur indexe avec le nom et l'adresse", () => {
    const withAcronym = [...pages, page({ pageId: "c", name: "Médias du Gabon", handle: "medias-ga", shortName: "MDG" })]
    expect(filterPages(withAcronym, "mdg").map((p) => p.pageId)).toEqual(["c"])
  })

  it("rend un tableau vide quand rien ne correspond", () => {
    expect(filterPages(pages, "santé")).toEqual([])
  })

  it("cherche par MOTS : chaque mot doit se retrouver, dans n'importe quel ordre", () => {
    // « direction impots » ne se lit nulle part d'un seul tenant dans
    // « Direction des Impôts » — mot à mot, si.
    expect(filterPages(pages, "direction impots").map((p) => p.pageId)).toEqual(["b"])
    expect(filterPages(pages, "impôts direction").map((p) => p.pageId)).toEqual(["b"])
    expect(filterPages(pages, "direction santé")).toEqual([])
  })
})

describe("filterPagesByCountry", () => {
  const pages = [page({ pageId: "a", country: "FR" }), page({ pageId: "b", country: "GA" }), page({ pageId: "c" })]

  it("rend la MÊME référence sans filtre", () => {
    expect(filterPagesByCountry(pages, null)).toBe(pages)
  })

  it("ne garde que les pages du pays — une page sans pays n'est d'aucun pays", () => {
    expect(filterPagesByCountry(pages, "GA").map((p) => p.pageId)).toEqual(["b"])
  })
})

describe("pagesServerSearchTerm — ce qui part au serveur", () => {
  it("applique le seuil du serveur : rien sous deux caractères", () => {
    expect(PAGES_SEARCH_MIN_LENGTH).toBe(2)
    expect(pagesServerSearchTerm("")).toBeNull()
    expect(pagesServerSearchTerm("   ")).toBeNull()
    expect(pagesServerSearchTerm("i")).toBeNull()
    expect(pagesServerSearchTerm(" i ")).toBeNull()
  })

  it("transmet le terme tel quel, accents compris, sans ses espaces de bord", () => {
    expect(pagesServerSearchTerm("im")).toBe("im")
    expect(pagesServerSearchTerm("  Impôts ")).toBe("Impôts")
  })
})

describe("sectionsFor — hors recherche", () => {
  it("cas nominal : deux sections, dans l'ordre suivies puis découverte", () => {
    const followed = [page({ pageId: "a" })]
    const discovered = [page({ pageId: "b" }), page({ pageId: "c" })]
    expect(sectionsFor(followed, discovered, "")).toEqual([
      { kind: "followed", pages: followed },
      { kind: "discover", pages: discovered },
    ])
  })

  it("retire des suggestions une page déjà suivie — jamais deux fois à l'écran", () => {
    const followed = [page({ pageId: "a" })]
    const discovered = [page({ pageId: "a" }), page({ pageId: "b" })]
    const sections = sectionsFor(followed, discovered, "")
    expect(sections).toHaveLength(2)
    expect(sections[1]!.pages.map((p) => p.pageId)).toEqual(["b"])
  })

  it("n'affiche pas de section « suivies » quand je ne suis aucune page", () => {
    expect(sectionsFor([], [page({ pageId: "b" })], "")).toEqual([{ kind: "discover", pages: [page({ pageId: "b" })] }])
  })

  it("n'affiche pas de section « découvrir » quand il ne reste rien à proposer", () => {
    const followed = [page({ pageId: "a" })]
    expect(sectionsFor(followed, [page({ pageId: "a" })], "")).toEqual([{ kind: "followed", pages: followed }])
  })

  it("rend un tableau vide quand il n'y a rien nulle part", () => {
    expect(sectionsFor([], [], "")).toEqual([])
  })

  it("titre chaque section dans la langue de l'écran", () => {
    expect(pagesSectionTitle("followed", t)).toBe("Pages suivies")
    expect(pagesSectionTitle("discover", t)).toBe("Pages à découvrir")
    expect(pagesSectionTitle("results", t)).toBe("Résultats")
    expect(pagesSectionTitle("mine", t)).toBe("Mes pages")
    expect(pagesSectionTitle("invitations", t)).toBe("Invitations à signer")
    expect(pagesSectionTitle("followed", tEn)).toBe("Pages you follow")
  })
})

describe("sectionsFor — recherche active", () => {
  it("fusionne en UNE SEULE section de résultats", () => {
    const followed = [page({ pageId: "a", name: "Ministère des Finances" })]
    const discovered = [page({ pageId: "b", name: "Direction des Finances" })]
    expect(sectionsFor(followed, discovered, "finances")).toEqual([{ kind: "results", pages: [followed[0], discovered[0]] }])
  })

  it("ne répète pas une page qui correspond à la fois suivie et découverte", () => {
    const shared = page({ pageId: "a", name: "Ministère des Finances" })
    const sections = sectionsFor([shared], [shared], "finances")
    expect(sections).toHaveLength(1)
    expect(sections[0]!.pages).toEqual([shared])
  })

  it("recherche sans résultat : aucune section", () => {
    const followed = [page({ pageId: "a", name: "Ministère des Finances" })]
    const discovered = [page({ pageId: "b", name: "Direction des Impôts" })]
    expect(sectionsFor(followed, discovered, "santé")).toEqual([])
  })

  it("une requête toute en espaces n'est pas une recherche active", () => {
    const sections = sectionsFor([page({ pageId: "a" })], [page({ pageId: "b" })], "   ")
    expect(sections.map((s) => s.kind)).toEqual(["followed", "discover"])
  })
})

describe("sectionsFor — la découverte vient du SERVEUR", () => {
  // Le serveur a trouvé cette page sur son texte replié (sigle compris), que
  // ce module ne voit pas ici : un re-filtrage local sur le nom l'aurait retirée.
  const foundByServer = page({ pageId: "mef", name: "Ministère de l'Économie", handle: "min-economie" })

  it("ne re-filtre pas les résultats du serveur", () => {
    expect(sectionsFor([], [foundByServer], "mef", { serverSearched: true })).toEqual([{ kind: "results", pages: [foundByServer] }])
    // Sans le drapeau, l'ancien filtre local s'applique — et la perd.
    expect(sectionsFor([], [foundByServer], "mef")).toEqual([])
  })

  it("filtre toujours les pages SUIVIES, et dédoublonne contre elles", () => {
    const followed = [
      page({ pageId: "mef", name: "Ministère de l'Économie", handle: "min-economie" }),
      page({ pageId: "dgi", name: "Direction des Impôts", handle: "dgi" }),
    ]
    const sections = sectionsFor(followed, [foundByServer], "economie", { serverSearched: true })
    expect(sections).toHaveLength(1)
    expect(sections[0]!.pages.map((p) => p.pageId)).toEqual(["mef"])
  })

  it("hors recherche, le drapeau ne change rien : deux sections nommées", () => {
    const followed = [page({ pageId: "a" })]
    const discovered = [page({ pageId: "b" })]
    expect(sectionsFor(followed, discovered, "", { serverSearched: true })).toEqual(sectionsFor(followed, discovered, ""))
  })
})

describe("sectionsFor — filtre par pays", () => {
  it("ne garde des suivies que celles du pays, la découverte venant déjà filtrée du serveur", () => {
    const followed = [page({ pageId: "lyon", country: "FR" }), page({ pageId: "libreville", country: "GA" })]
    const discovered = [page({ pageId: "port-gentil", country: "GA" })]
    expect(sectionsFor(followed, discovered, "", { country: "GA" })).toEqual([
      { kind: "followed", pages: [followed[1]] },
      { kind: "discover", pages: discovered },
    ])
  })

  it("dédoublonne contre TOUTES les suivies, même d'un autre pays", () => {
    const followed = [page({ pageId: "a", country: "FR" })]
    const discovered = [page({ pageId: "a", country: "FR" }), page({ pageId: "b", country: "FR" })]
    const sections = sectionsFor(followed, discovered, "", { country: "GA" })
    expect(sections).toEqual([{ kind: "discover", pages: [discovered[1]] }])
  })
})

describe("suggestionsForRail", () => {
  it("écarte les pages déjà suivies", () => {
    const discovered = [page({ pageId: "a", following: true }), page({ pageId: "b", following: false })]
    expect(suggestionsForRail(discovered).map((p) => p.pageId)).toEqual(["b"])
  })

  it("plafonne à trois pages", () => {
    expect(PAGES_SUGGESTIONS_RAIL_LIMIT).toBe(3)
    const discovered = ["a", "b", "c", "d", "e"].map((pageId) => page({ pageId }))
    expect(suggestionsForRail(discovered)).toHaveLength(3)
  })

  it("rend tout ce qu'il y a quand il y en a moins de trois", () => {
    expect(suggestionsForRail([page({ pageId: "a" })])).toHaveLength(1)
  })
})

describe("followLabel", () => {
  it("dit « Suivre » quand je ne suis pas la page", () => {
    // ⚠️ Le même geste doit porter le MÊME mot sur tous les écrans qui le
    // proposent : volet Pages, rail et fiche d'une page (`profil-page.ts`),
    // pour la même mutation. « S'abonner » a quitté le lexique : le réseau
    // n'a pas deux vocabulaires selon l'écran.
    expect(followLabel(false, t)).toBe("Suivre")
  })

  it("dit « Suivi » quand je la suis déjà", () => {
    expect(followLabel(true, t)).toBe("Suivi")
    expect(followLabel(true, tEn)).toBe("Following")
  })
})

describe("compteur d'abonnés — pluriel et nombre de la langue", () => {
  it("zéro se dit en toutes lettres", () => {
    expect(formatFollowerCount(0, t)).toBe("Aucun abonné")
  })

  it("singulier à un, pluriel au-delà, nombre exact mis en forme", () => {
    expect(formatFollowerCount(1, t)).toBe("1 abonné")
    expect(formatFollowerCount(12, t)).toBe("12 abonnés")
    expect(formatFollowerCount(4812, t)).toBe(`${nombre(4812)} abonnés`)
    expect(formatFollowerCount(1, tEn)).toBe("1 follower")
    expect(formatFollowerCount(4812, tEn)).toBe(`${new Intl.NumberFormat("en").format(4812)} followers`)
  })
})

describe("badge, nature, rôle — nommés, jamais devinés", () => {
  it("nomme le badge CALCULÉ par le serveur, avec son ton et son pictogramme", () => {
    expect(pageBadgeView("official")).toEqual({ labelKey: "social:badges.official", tone: "primary", icon: "shieldCheck" })
    expect(pageBadgeView("verified")).toEqual({ labelKey: "social:badges.verified", tone: "primary", icon: "checkCircle" })
    expect(pageBadgeView("community")).toEqual({ labelKey: "social:badges.community", tone: "neutral", icon: "users" })
    expect(t(pageBadgeView("official").labelKey)).toBe("Officiel")
    expect(t(pageBadgeView("verified").labelKey)).toBe("Vérifié")
    expect(t(pageBadgeView("community").labelKey)).toBe("Communauté")
  })

  it("une page de la communauté n'est jamais dite « officielle »", () => {
    expect(t(pageBadgeView("community").labelKey).toLowerCase()).not.toContain("officiel")
  })

  it("nomme les natures et les rôles", () => {
    expect(ownerKindLabel("association", t)).toBe("Association")
    expect(ownerKindLabel("company", t)).toBe("Entreprise")
    expect(ownerKindLabel("media", t)).toBe("Média")
    expect(ownerKindLabel("institution", t)).toBe("Institution")
    // « Collectif » et non « Communauté » : ce mot est déjà celui du badge de confiance.
    expect(ownerKindLabel("community", t)).toBe("Collectif")
    expect(pageRoleLabel("admin", t)).toBe("Administrateur")
    expect(pageRoleLabel("signatory", t)).toBe("Signataire")
    expect(pageRoleLabel("moderator", t)).toBe("Modérateur")
    expect(pageRoleLabel("moderator", tEn)).toBe("Moderator")
  })

  it("dit le rôle qu'une invitation propose", () => {
    expect(pageInvitationText("signatory", t)).toContain("Signataire")
    expect(pageInvitationText("admin", tEn)).toContain("Administrator")
    // AS-10 : l'invitation d'un modérateur ne lui promet pas de publier au nom de la page.
    expect(pageInvitationText("moderator", t)).toContain("modérer les commentaires")
    expect(pageInvitationText("moderator", t)).not.toContain("invité à publier")
    expect(pageInvitationText("moderator", tEn)).toContain("moderate the comments")
    expect(pageInvitationAcceptedText("signatory", t)).toBe("Vous publiez désormais au nom de cette page.")
    expect(pageInvitationAcceptedText("moderator", t)).toBe("Vous modérez désormais les commentaires de cette page.")
  })

  it("un membre ne crée qu'une association, une entreprise, un média ou un collectif", () => {
    expect([...MEMBER_OWNER_KINDS].sort()).toEqual(["association", "community", "company", "media"])
  })
})

describe("pays — codes ISO, noms de la langue courante", () => {
  it("couvre les 249 codes attribués, sans doublon, en deux capitales", () => {
    expect(PAGE_COUNTRY_CODES).toHaveLength(249)
    expect(new Set(PAGE_COUNTRY_CODES).size).toBe(249)
    expect(PAGE_COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true)
    expect(PAGE_COUNTRY_CODES).toContain("GA")
  })

  it("nomme un pays dans la langue courante, et retombe sur son code", () => {
    expect(countryName("GA", "fr")).toBe("Gabon")
    expect(countryName("DE", "fr")).toBe("Allemagne")
    expect(countryName("DE", "en")).toBe("Germany")
  })

  it("propose les pays triés par leur nom dans la langue courante", () => {
    const options = countryOptions("fr")
    expect(options).toHaveLength(249)
    const labels = options.map((option) => option.label)
    const collator = new Intl.Collator("fr")
    expect([...labels].sort((a, b) => collator.compare(a, b))).toEqual(labels)
    expect(countryOptions("fr")).toBe(options)
  })

  it("compose la ligne de méta : nature, pays, abonnés", () => {
    expect(pageMetaLine({ ownerKind: "association", country: "GA", followerCount: 12 }, "fr", t)).toBe("Association · Gabon · 12 abonnés")
    expect(pageMetaLine({ ownerKind: "media", country: null, followerCount: 0 }, "fr", t)).toBe("Média · Aucun abonné")
  })
})

describe("emptyPagesText", () => {
  it("nomme la requête quand une recherche ne trouve rien", () => {
    expect(emptyPagesText("santé", true, null, t)).toBe("Aucune page ne correspond à « santé ».")
    expect(emptyPagesText("santé", false, null, t)).toContain("« santé »")
    // La requête prime : un pays filtré n'y change rien.
    expect(emptyPagesText("santé", false, "Gabon", t)).toContain("« santé »")
  })

  it("invite à découvrir quand je ne suis encore aucune page", () => {
    const text = emptyPagesText("", false, null, t)
    expect(text).not.toContain("«")
    expect(text.toLowerCase()).toContain("découvrez")
  })

  it("dit qu'il n'y a rien de neuf quand je suis déjà des pages", () => {
    expect(emptyPagesText("", true, null, t).toLowerCase()).toContain("nouvelle")
  })

  it("nomme le pays filtré quand il n'en sort rien", () => {
    expect(emptyPagesText("", true, "Gabon", t)).toContain("Gabon")
  })

  it("dit la troncature du catalogue des suivies, au lieu de la taire", () => {
    expect(followedTruncatedText(t)).toContain(String(PAGES_FOLLOWED_CATALOG_SIZE))
  })
})

describe("pagesErrorText — une panne se dit, source par source", () => {
  it("donne un titre et une phrase propres à chaque source", () => {
    expect(pagesErrorText("followed", t)).toEqual({ title: "Pages suivies indisponibles", message: "Vos pages suivies n'ont pas pu être chargées." })
    expect(pagesErrorText("discover", t).title).toBe("Pages indisponibles")
    expect(pagesErrorText("discover", t).message).toContain("Vos abonnements sont intacts")
    expect(pagesErrorText("mine", t).title).not.toBe(pagesErrorText("invitations", t).title)
  })
})

describe("followActionErrorMessage — le refus, par son code", () => {
  const GENERIQUE = "Cette action n'a pas pu être effectuée."

  it("traduit le CODE du moteur", () => {
    expect(t(PAGE_ACTION_ERROR_FALLBACK_KEY)).toBe(GENERIQUE)
    expect(followActionErrorMessage({ data: { code: "notFound" } }, t)).toBe(t("errors:notFound"))
    expect(followActionErrorMessage({ data: { code: "rateLimited", retryAfterMs: 2000 } }, t)).toBe(t("errors:rateLimited"))
  })

  it("une règle du domaine prime sur son code, bornes interpolées", () => {
    const err = { data: { code: "invalidArgument", rule: "PAGE_HANDLE_LENGTH", params: { min: 3, max: 60 } } }
    const text = pageActionErrorMessage(err, t)
    expect(text).toBe(t("rules:PAGE_HANDLE_LENGTH", { min: 3, max: 60 }))
    expect(text).toContain("60")
  })

  it("ne lit JAMAIS `error.message` — trace de dev ou générique de prod", () => {
    expect(followActionErrorMessage(new Error("Server Error"), t)).toBe(GENERIQUE)
  })

  it("ne montre jamais une phrase arrivée telle quelle, et retombe sur le générique", () => {
    // Le moteur parle par CODES : une chaîne dans `data` n'est pas un contrat.
    expect(followActionErrorMessage({ data: "Page introuvable." }, t)).toBe(GENERIQUE)
    expect(followActionErrorMessage(null, t)).toBe(GENERIQUE)
    expect(followActionErrorMessage(undefined, t)).toBe(GENERIQUE)
    expect(followActionErrorMessage({ data: "   " }, t)).toBe(GENERIQUE)
    expect(followActionErrorMessage({ data: 42 }, t)).toBe(GENERIQUE)
    expect(followActionErrorMessage({ data: { code: "inconnu" } }, t)).toBe(GENERIQUE)
  })
})

describe("checkPageDraft — le brouillon jugé par les règles du serveur", () => {
  const draft = (overrides: Partial<PageDraft>): PageDraft => ({ ...emptyPageDraft(), ...overrides })

  it("rend les arguments de `createPage`, l'adresse déduite du nom", () => {
    const check = checkPageDraft(draft({ name: "  Association des Gabonais de Lyon  ", country: "FR" }), t)
    expect(check).toEqual({
      ok: true,
      args: { name: "Association des Gabonais de Lyon", ownerKind: "association", handle: "association-des-gabonais-de-lyon", country: "FR" },
    })
  })

  it("garde l'adresse proposée, repliée comme au serveur, et les champs facultatifs", () => {
    const check = checkPageDraft(draft({ name: "Médias du Gabon", ownerKind: "media", handle: "Médias GA", shortName: " MDG ", description: " Le média. " }), t)
    expect(check).toEqual({
      ok: true,
      args: { name: "Médias du Gabon", ownerKind: "media", handle: "medias-ga", shortName: "MDG", description: "Le média." },
    })
  })

  it("refuse un nom vide sous son champ, sans redire la faute sur l'adresse", () => {
    const check = checkPageDraft(draft({ name: "   " }), t)
    expect(check.ok).toBe(false)
    if (check.ok) return
    expect(check.errors.name).toBe(t("rules:PAGE_NAME_LENGTH", { max: 120 }))
    expect(check.errors.handle).toBeUndefined()
  })

  it("refuse une adresse trop courte, même déduite d'un nom valable", () => {
    const check = checkPageDraft(draft({ name: "AB" }), t)
    expect(check.ok).toBe(false)
    if (check.ok) return
    expect(check.errors.handle).toBe(t("rules:PAGE_HANDLE_LENGTH", { min: 3, max: 60 }))
  })

  it("refuse un sigle ou une description trop longs", () => {
    const check = checkPageDraft(draft({ name: "Une page", shortName: "X".repeat(31), description: "y".repeat(1001) }), t)
    expect(check.ok).toBe(false)
    if (check.ok) return
    expect(check.errors.shortName).toBe(t("rules:PAGE_SHORT_NAME_TOO_LONG", { max: 30 }))
    expect(check.errors.description).toBe(t("rules:PAGE_DESCRIPTION_TOO_LONG", { max: 1000 }))
  })

  it("montre l'adresse que la page prendra", () => {
    expect(pageHandlePreview({ name: "Médias du Gabon", handle: "" })).toBe("medias-du-gabon")
    expect(pageHandlePreview({ name: "Médias du Gabon", handle: "mdg" })).toBe("mdg")
    expect(pageHandlePreview({ name: "", handle: "" })).toBeNull()
  })
})
