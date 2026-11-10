// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/reseau-layout.test.ts @ ad2e7fdc2 — adaptations : dépendance retirée `espace-rail-collapse` — la largeur du rail rétracté de l'hôte devient une constante locale (82 px, mesure du socle, cas le plus contraint) ; libellés lus dans l'i18n du moteur ; feuilles lues sur les constantes qu'elles exportent (`RESEAU_DESKTOP_CSS` de la page de bureau, `RESEAU_MOBILE_CSS` de la coquille mobile) au lieu des blocs `<style>` du texte source, commentaires retirés, et découpées en règles qui gardent leurs conditions `@container`/`@media` ; composants relus commentaires ôtés (volets dans `features/reseau-personnel/`, barre mobile dans `shell/mobile/`) ; cliquets de la grille de bureau et des volets RÉTABLIS au lot F2 (huit cas, et la seconde moitié du « débordement des sous-menus ») — la grille n'a plus de rail d'hôte : « remplace les onglets par le rail gauche » vérifie le menu vertical et le retrait de la tablist au SEUL palier `COLLAPSED_NAV_MIN`, l'absence de `[data-espace-rail]`, et l'ORDRE des paliers 1 008 → 812 → 1 108 (à spécificité égale, c'est lui qui fait primer le menu vertical) ; l'attribut posé est `data-volet={shownTab}`, le volet MONTRÉ (`servedReseauTab`) ; le bloc conteneur est exigé d'une règle `.rp-scope` inconditionnelle.
import { readFileSync } from "node:fs"

import { RESEAU_MOBILE_MAX_PX } from "@antsia/ui/overlay"
import { describe, expect, it } from "vitest"

import { storyComposePose } from "../features/stories/story-create"
import { createAppI18n } from "../i18n"
import { RESEAU_MOBILE_CSS } from "./mobile/mobile-styles"
import { RESEAU_ADAPTIVE_CSS } from "./reseau-adaptive-styles"
import {
  COLLAPSED_FEED_MIN,
  COLLAPSED_NAV_MIN,
  COLLAPSED_RAIL_END_MIN,
  COLLAPSED_THREE_COLUMN_MIN,
  COLLECTION_COLUMN_MAX,
  GRID_MAX_WIDTH,
  GRID_WITH_NAV_MAX_WIDTH,
  FEED_COLUMN_MAX,
  FEED_COLUMN_MIN,
  RAIL_END_WIDTH,
  RESEAU_COLUMN_GAP,
  RESEAU_NAV_RAIL_MIN_WIDTH,
  RESEAU_NAV_RAIL_WIDTH,
  SUGGESTIONS_AFTER,
  TABLET_COLUMN_MAX,
  TABLET_COLUMN_MIN,
  TABLET_WIDE_COLUMN_MAX,
  TABLET_WIDE_MIN,
  TWO_COLUMN_MIN,
  composeSheetPose,
  invitationsBannerLabel,
  isCollectionVolet,
  readingWidth,
  shouldSurfaceInvitations,
  suggestionsInterleaveIndex,
  viewHeading,
  viewNeedsReturn,
  viewReturnLabel,
  type FeedView,
} from "./reseau-layout"
import { RESEAU_DESKTOP_CSS } from "./ReseauAgentPage"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")

/**
 * Le rail RÉTRACTÉ d'une application hôte, en pixels — la mesure du socle
 * (82 px). La coque légère du moteur n'en pose aucun : c'est donc le cas le
 * plus contraint qu'une application puisse imposer, et les paliers doivent y
 * tenir.
 */
const HOST_COLLAPSED_RAIL_PX = 82

/**
 * Les états transitoires du volet « fil ». `activity` et `people` n'y figurent
 * plus depuis le 2026-08-06 : ce sont des VOLETS (`reseau-agent-nav.ts`), rendus par
 * une bascule visible à tous les paliers, et non plus des surfaces à quitter.
 */
const ALL_VIEWS: FeedView[] = [
  { kind: "feed" },
  { kind: "tag", tag: "numerique" },
  { kind: "search", query: "note" },
  { kind: "post", postId: "abc" },
]

describe("seuils de la grille", () => {
  it("n'affiche le rail droit qu'avec 680 px de lecture disponibles", () => {
    const twoColumnFeed = TWO_COLUMN_MIN - RAIL_END_WIDTH - RESEAU_COLUMN_GAP
    expect(twoColumnFeed).toBe(FEED_COLUMN_MIN)
    expect(FEED_COLUMN_MIN).toBeGreaterThanOrEqual(680)
    expect(FEED_COLUMN_MAX).toBeLessThanOrEqual(792)
  })

  it("borne la grille au fil maximal + rail + gouttière", () => {
    expect(GRID_MAX_WIDTH).toBe(
      FEED_COLUMN_MAX + RAIL_END_WIDTH + RESEAU_COLUMN_GAP
    )
  })

  it("réserve au menu vertical une colonne sans réduire la lecture", () => {
    expect(COLLAPSED_NAV_MIN).toBe(
      RESEAU_NAV_RAIL_MIN_WIDTH + RESEAU_COLUMN_GAP + COLLAPSED_FEED_MIN
    )
    expect(COLLAPSED_THREE_COLUMN_MIN).toBe(
      COLLAPSED_NAV_MIN + RESEAU_COLUMN_GAP + COLLAPSED_RAIL_END_MIN
    )
    expect(GRID_WITH_NAV_MAX_WIDTH).toBe(
      RESEAU_NAV_RAIL_WIDTH + RESEAU_COLUMN_GAP + GRID_MAX_WIDTH
    )
  })

  it("choisit la bonne composition à 1 470 px et 1 280 px, rail rétracté", () => {
    // Sous le bureau, .rp-scope conserve une gouttière de 16 px par côté.
    const containerAt = (viewport: number) => viewport - HOST_COLLAPSED_RAIL_PX - 32

    expect(containerAt(1470)).toBeGreaterThanOrEqual(
      COLLAPSED_THREE_COLUMN_MIN
    )
    expect(containerAt(1280)).toBeGreaterThanOrEqual(COLLAPSED_NAV_MIN)
    expect(containerAt(1280)).toBeGreaterThanOrEqual(
      COLLAPSED_THREE_COLUMN_MIN
    )
  })
})

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CSS DOIT IMPLÉMENTER CE QUE CE MODULE DÉCLARE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les constantes ci-dessus sont REDÉCLARÉES dans les feuilles de style des
 * deux coquilles (une propriété personnalisée n'est pas utilisable dans une
 * condition `@container`) — et c'est très exactement là que les deux ont
 * divergé au socle : `THREE_COLUMN_MIN` décrivait un palier à trois colonnes
 * que le CSS n'a jamais implémenté. `.rp-rail-start` n'était donc affiché
 * NULLE PART, et trois cartes — identité, « Mon réseau », compteurs — étaient
 * invisibles pour quiconque avait publié son profil. Aucun test ne pouvait le
 * voir : les constantes étaient cohérentes entre elles, et le typage ne lit
 * pas une chaîne.
 *
 * Ce cliquet lit donc les feuilles elles-mêmes — les constantes qu'exportent
 * la page de bureau (`RESEAU_DESKTOP_CSS`, `ReseauAgentPage.tsx`) et la
 * coquille mobile (`RESEAU_MOBILE_CSS`, `mobile/mobile-styles.tsx`) — et, pour
 * les attributs que ces feuilles visent, le code des composants qui les posent.
 *
 * `cssOf` rend le CSS d'une feuille, et RIEN d'autre : les commentaires, qui
 * contiennent des noms de classe, sont retirés avant toute recherche.
 */
function cssOf(sheet: string): string {
  return sheet.replace(/\/\*[\s\S]*?\*\//g, "")
}

/**
 * Le CODE d'un composant (chemin relatif à ce fichier), commentaires ôtés : un
 * commentaire qui cite un attribut ne le pose pas.
 */
function codeOf(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "")
}

interface CssRule {
  /** Les règles conditionnelles qui l'englobent (`@container …`, `@media …`), de l'extérieure à l'intérieure. */
  conditions: readonly string[]
  selector: string
  body: string
}

/**
 * Découpage en règles, CONDITIONS ENGLOBANTES comprises — suffisant : on
 * n'interroge que des sélecteurs, leurs déclarations et le palier qui les
 * porte. Au socle, un découpage à plat suffisait : la condition « rail
 * rétracté » vivait dans le sélecteur (`[data-espace-rail="collapsed"]`). Le
 * moteur la porte par le seul palier `@container`, qu'il faut donc garder.
 */
function cssRules(source: string, conditions: readonly string[] = []): CssRule[] {
  const rules: CssRule[] = []
  let cursor = 0
  let open = source.indexOf("{", cursor)
  while (open !== -1) {
    // L'accolade qui ferme CE bloc, blocs imbriqués compris.
    let depth = 1
    let close = open + 1
    while (close < source.length && depth > 0) {
      if (source[close] === "{") depth += 1
      else if (source[close] === "}") depth -= 1
      close += 1
    }
    const prelude = source.slice(cursor, open).trim()
    const body = source.slice(open + 1, close - 1)
    if (prelude.startsWith("@")) rules.push(...cssRules(body, [...conditions, prelude]))
    else rules.push({ conditions, selector: prelude, body })
    cursor = close
    open = source.indexOf("{", cursor)
  }
  return rules
}

/** Les sélecteurs d'une liste (`a, b`), un par un. */
function selectorParts(rule: CssRule): string[] {
  return rule.selector.split(",").map((part) => part.trim())
}

/** Une déclaration doit rester sur son sélecteur ET son palier, pas ailleurs dans la feuille. */
function ruleBody(rules: readonly CssRule[], selector: string, conditions: readonly string[] = []): string {
  const matches = rules.filter((rule) =>
    selectorParts(rule).includes(selector) &&
    rule.conditions.length === conditions.length &&
    rule.conditions.every((condition, index) => condition === conditions[index])
  )
  expect(matches).toHaveLength(1)
  return matches[0]?.body ?? ""
}

describe("la grille implémente les paliers du module", () => {
  const css = cssOf(RESEAU_DESKTOP_CSS)
  const rules = cssRules(css)

  it("déclare le palier utile, les largeurs du fil et le rail droit", () => {
    expect(css).toContain(`min-width: ${TWO_COLUMN_MIN}px`)
    expect(css).toContain(
      `minmax(${FEED_COLUMN_MIN}px, ${FEED_COLUMN_MAX}px) ${RAIL_END_WIDTH}px`
    )
    expect(css).toContain(`max-width: ${GRID_MAX_WIDTH}px`)
    expect(css).toContain(`min-width: ${COLLAPSED_NAV_MIN}px`)
    expect(css).toContain(`min-width: ${COLLAPSED_THREE_COLUMN_MIN}px`)
    expect(css).toContain(
      `grid-template-columns: minmax(${RESEAU_NAV_RAIL_MIN_WIDTH}px, ${RESEAU_NAV_RAIL_WIDTH}px) minmax(${COLLAPSED_FEED_MIN}px, ${FEED_COLUMN_MAX}px) minmax(${COLLAPSED_RAIL_END_MIN}px, ${RAIL_END_WIDTH}px)`
    )
    expect(css).toContain(`max-width: ${GRID_WITH_NAV_MAX_WIDTH}px`)
  })

  it("emploie la même gouttière latérale et aligne les cartes en tête", () => {
    expect(css).toContain(".rp-scope { padding: 14px 16px 0; }")
    expect(css).toContain("padding-top: 0;")
  })

  it("garde une hauteur définie et les scrollers historiques hors opt-in adaptatif", () => {
    expect(codeOf("./ReseauAgentPage.tsx")).toMatch(
      /<div\s+className="rp-scope"\s+data-navigation-layout=\{adaptive \? "adaptive" : undefined\}\s+style=\{adaptive \? undefined : \{\s*height:\s*"100%"/
    )
    expect(ruleBody(rules, ".rp-scope")).toContain("overflow: hidden")
    const singleColumn = ruleBody(rules, ".rp-grid")
    expect(singleColumn).toContain("flex: 1")
    expect(singleColumn).toContain("min-height: 0")
    expect(singleColumn).toContain("overflow-y: auto")

    const twoColumns = [`@container rp-page (min-width: ${TWO_COLUMN_MIN}px)`]
    const grid = ruleBody(rules, ".rp-grid", twoColumns)
    expect(grid).toContain("height: 100%")
    expect(grid).toContain("overflow: hidden")
    for (const selector of [".rp-main-col", ".rp-grid .rp-rail-end"]) {
      const column = ruleBody(rules, selector, twoColumns)
      expect(column).toContain("overflow-y: auto")
      expect(column).toContain("min-height: 0")
      expect(column).toContain("padding-bottom: 48px")
    }
    const rightRail = ruleBody(rules, ".rp-grid .rp-rail-end", twoColumns)
    expect(rightRail).toContain("max-height: 100%")
    expect(rightRail).toContain("overflow-x: hidden")
    const leftRail = ruleBody(rules, ".rp-rail-start", [`@container rp-page (min-width: ${COLLAPSED_NAV_MIN}px)`])
    expect(leftRail).toContain("overflow-y: auto")
    expect(leftRail).toContain("min-height: 0")
    expect(leftRail).toContain("padding-bottom: 48px")
  })

  it("borne les trois compartiments et épingle les deux parties de l'en-tête adaptatif", () => {
    const adaptive = cssRules(cssOf(RESEAU_ADAPTIVE_CSS))
    const scope = '.rp-scope[data-navigation-layout="adaptive"]'
    expect(ruleBody(adaptive, scope)).toContain("height: 100%")
    expect(ruleBody(adaptive, scope)).toContain("overflow: hidden")
    expect(ruleBody(adaptive, `${scope} .rp-main-col`)).toContain("overflow-y: auto")
    expect(ruleBody(adaptive, `${scope} .rp-main-col`)).toContain("scroll-padding-top:")
    const rails = adaptive.find(rule => selectorParts(rule).includes(`${scope} .rp-rail-start`) && rule.body.includes("max-height: 100%"))?.body ?? ""
    expect(rails).toContain("overflow-y: auto")
    expect(rails).toContain("overscroll-behavior-y: contain")
    expect(ruleBody(adaptive, `${scope} .rp-identity-region`)).toContain("position: sticky")
    expect(ruleBody(adaptive, `${scope} .rp-volet-head`)).toContain("top: calc(var(--rp-composer-height")
  })

  it("UNE gouttière à l'opt-in : marge extérieure = écart entre colonnes, sans largeur maximale (22/10/2026)", () => {
    const adaptive = cssRules(cssOf(RESEAU_ADAPTIVE_CSS))
    const scope = '.rp-scope[data-navigation-layout="adaptive"]'
    // Le jeton de l'application, à défaut les paliers d'U09 (16 px, puis 24 px).
    expect(ruleBody(adaptive, scope)).toContain("--rp-adaptive-gutter: var(--spacing-gutter, 16px)")
    expect(ruleBody(adaptive, scope, ["@media (min-width: 1200px)"])).toContain("--rp-adaptive-gutter: var(--spacing-gutter, 24px)")
    // Les bords de la page et l'écart entre les colonnes lisent le MÊME jeton.
    expect(ruleBody(adaptive, scope)).toContain("padding: 24px var(--rp-adaptive-gutter) 0")
    expect(ruleBody(adaptive, `${scope} .rp-grid`)).toContain("gap: var(--rp-adaptive-gutter)")
    // Ni cadre de 1 400 px, ni colonne centrale bornée puis centrée : l'un comme
    // l'autre creuserait aux bords ou autour du fil un écart plus large que la gouttière.
    for (const selector of [`${scope} .rp-grid`, `${scope} .rp-main-col`]) {
      expect(ruleBody(adaptive, selector)).toContain("max-width: none")
      expect(ruleBody(adaptive, selector)).toContain("margin-inline: 0")
    }
    for (const rule of adaptive) {
      expect(rule.body).not.toMatch(/max-width:(?!\s*none)/)
      expect(rule.body).not.toContain("justify-self: center")
    }
    expect(ruleBody(adaptive, `${scope} .rp-grid`, ["@media (min-width: 1400px)", "@container rp-page (min-width: 1280px)"])).toContain(
      "grid-template-columns: var(--rp-adaptive-nav-width) minmax(0, 1fr) 312px"
    )
  })

  it("ne masque le rappel du profil à AUCUN palier", () => {
    // La barre de profil est l'en-tête de la page réseau : elle porte
    // l'identité ET le geste de publication. Une règle qui la masquerait les
    // emporterait avec elle — et c'est très exactement le défaut du
    // 2026-08-12 au socle, quand la carte vivait dans un rail que rien
    // n'affichait.
    const region = rules.filter((rule) =>
      rule.selector.includes(".rp-identity-region")
    )
    expect(region.length).toBeGreaterThan(0)
    for (const rule of region) {
      expect(rule.body).not.toMatch(/display:\s*none/)
    }
  })

  it("fait du scroller un BLOC CONTENEUR — le défaut du 2026-08-12", () => {
    // `.rp-scope` est fermé (`overflow: hidden`) : ce sont ses colonnes qui
    // défilent. Sans `position: relative`, ses descendants en position
    // absolue — les `sr-only` du fil en sont — résolvent contre le bloc
    // conteneur initial : ils échappent au rognage ET rallongent la hauteur
    // du DOCUMENT. Mesuré au socle : 1553 px pour une fenêtre de 760, le
    // document devenait défilable et découvrait le fond du body sous la page.
    // ⚠️ `container-type` ne remplace pas cette règle : le `contain` calculé
    // reste `none`, il n'établit aucun bloc conteneur. Et la règle est
    // INCONDITIONNELLE : un bloc conteneur posé à un seul palier laisserait
    // fuir tous les autres.
    const regles = rules.filter(
      (rule) =>
        rule.conditions.length === 0 &&
        selectorParts(rule).includes(".rp-scope")
    )
    expect(regles.length).toBeGreaterThan(0)
    expect(regles.some((rule) => /position:\s*relative/.test(rule.body))).toBe(
      true
    )
  })

  it("remplace les onglets par le rail gauche uniquement au palier du menu — sans rail d'hôte, la mise en page « rail rétracté » s'applique d'office", () => {
    // Au socle, ces règles visaient `[data-espace-rail="collapsed"]` : le menu
    // vertical ne remplaçait la tablist que sous le rail RÉTRACTÉ de l'espace.
    // La coque du moteur ne pose aucun rail : une condition sur cet attribut
    // ne s'appliquerait à rien, et la tablist resterait seule à tous les
    // paliers.
    expect(css).not.toContain("data-espace-rail")

    const menuPalier = `@container rp-page (min-width: ${COLLAPSED_NAV_MIN}px)`
    const auPalierDuMenu = (rule: CssRule) =>
      rule.conditions.length === 1 && rule.conditions[0] === menuPalier

    // Le menu vertical ne s'affiche QU'À ce palier (la règle de base le
    // masque)…
    const railVisible = rules.filter(
      (rule) =>
        selectorParts(rule).includes(".rp-rail-start") &&
        /display:\s*flex/.test(rule.body)
    )
    expect(railVisible.length).toBeGreaterThan(0)
    for (const rule of railVisible) {
      expect(auPalierDuMenu(rule)).toBe(true)
    }

    // …et la tablist ne se retire qu'à ce même palier : hors de lui, aucune
    // règle ne fait perdre la navigation.
    const hiddenTabs = rules.filter(
      (rule) =>
        selectorParts(rule).some((part) =>
          [".rp-tabs", ".rp-main .rp-tabs"].includes(part)
        ) && /display:\s*none/.test(rule.body)
    )
    expect(hiddenTabs.length).toBeGreaterThan(0)
    for (const rule of hiddenTabs) {
      expect(auPalierDuMenu(rule)).toBe(true)
    }

    // Sans le sélecteur d'attribut, la SPÉCIFICITÉ ne départage plus les
    // paliers : c'est l'ORDRE. Celui du menu doit suivre celui des deux
    // colonnes — sinon, de 1 008 à 1 107 px, la grille fil + rail droit
    // reprendrait la main, menu affiché : trois colonnes pour deux pistes —
    // et précéder celui des trois colonnes, qui rend le rail droit.
    const deuxColonnes = css.indexOf(
      `@container rp-page (min-width: ${TWO_COLUMN_MIN}px)`
    )
    const menu = css.indexOf(menuPalier)
    const troisColonnes = css.indexOf(
      `@container rp-page (min-width: ${COLLAPSED_THREE_COLUMN_MIN}px)`
    )
    expect(deuxColonnes).toBeGreaterThan(-1)
    expect(deuxColonnes).toBeLessThan(menu)
    expect(menu).toBeLessThan(troisColonnes)
  })
})

describe("une largeur de lecture par TÂCHE (R-15)", () => {
  it("le palier large de la tablette rejoint le plancher du bureau", () => {
    // C'est tout l'objet du palier : 959 → 960 ne doit plus faire tomber un
    // article de 935 px à 646 px.
    expect(TABLET_WIDE_COLUMN_MAX).toBe(FEED_COLUMN_MIN)
    expect(TABLET_COLUMN_MAX).toBeLessThan(TABLET_WIDE_COLUMN_MAX)
    expect(TABLET_COLUMN_MIN).toBeLessThan(TABLET_WIDE_MIN)
    // Une collection peut occuper la page, jamais plus qu'elle.
    expect(COLLECTION_COLUMN_MAX).toBeGreaterThan(FEED_COLUMN_MAX)
    expect(COLLECTION_COLUMN_MAX).toBe(GRID_MAX_WIDTH)
  })

  it("borne l'ARTICLE, laisse courir la COLLECTION", () => {
    const fil = (containerWidth: number, viewport: "mobile" | "desktop") =>
      readingWidth({ containerWidth, volet: "fil", viewport })
    const relations = (containerWidth: number, viewport: "mobile" | "desktop") =>
      readingWidth({ containerWidth, volet: "relations", viewport })

    expect(fil(320, "mobile")).toBe(320)
    expect(fil(600, "mobile")).toBe(600)
    expect(fil(700, "mobile")).toBe(TABLET_COLUMN_MAX)
    expect(fil(935, "mobile")).toBe(TABLET_WIDE_COLUMN_MAX)
    // 960 px de viewport, rail ouvert : la page ne reçoit que 646 px.
    expect(fil(646, "desktop")).toBe(646)
    expect(fil(1280, "desktop")).toBe(FEED_COLUMN_MAX)

    expect(relations(935, "mobile")).toBe(935)
    expect(relations(1280, "desktop")).toBe(COLLECTION_COLUMN_MAX)
    expect(relations(646, "desktop")).toBe(646)
    for (const volet of ["pages", "groupes", "enregistrements"]) {
      expect(isCollectionVolet(volet)).toBe(true)
      expect(readingWidth({ containerWidth: 1280, volet, viewport: "desktop" })).toBe(
        COLLECTION_COLUMN_MAX
      )
    }
    expect(isCollectionVolet("fil")).toBe(false)
  })

  it("RECETTE 959 → 960 → 959 : plus de chute de 935 à 646", () => {
    // À 959 px de viewport, le scroller mobile reçoit ~935 px ; à 960, la page
    // du bureau n'en reçoit que 646 (rail de 264 + gouttières).
    const avant = readingWidth({ containerWidth: 935, volet: "fil", viewport: "mobile" })
    const apres = readingWidth({ containerWidth: 646, volet: "fil", viewport: "desktop" })
    expect(avant - apres).toBeLessThanOrEqual(60)
    // Et le retour est symétrique : aucun état à reconstruire, seule la
    // largeur change.
    expect(avant).toBe(TABLET_WIDE_COLUMN_MAX)
  })

  it("PROPRIÉTÉ — monotone, et changer d'arbre ne rétrécit jamais", () => {
    for (const volet of ["fil", "relations"]) {
      let mobilePrecedent = 0
      let bureauPrecedent = 0
      for (let w = 280; w <= 1600; w += 6) {
        const mobile = readingWidth({ containerWidth: w, volet, viewport: "mobile" })
        const bureau = readingWidth({ containerWidth: w, volet, viewport: "desktop" })
        expect(mobile).toBeGreaterThanOrEqual(mobilePrecedent)
        expect(bureau).toBeGreaterThanOrEqual(bureauPrecedent)
        // À conteneur ÉGAL, le bureau n'est jamais plus étroit que la
        // tablette. Au-delà de 959 px les deux arbres ne coexistent pas
        // (`mobile-shell.ts`) : les comparer y serait comparer une largeur
        // qui n'arrive jamais.
        if (w <= RESEAU_MOBILE_MAX_PX) {
          expect(bureau).toBeGreaterThanOrEqual(mobile)
        }
        mobilePrecedent = mobile
        bureauPrecedent = bureau
      }
    }
  })

  it("une largeur non mesurée n'est pas « très étroit »", () => {
    for (const containerWidth of [0, -12, Number.NaN]) {
      expect(readingWidth({ containerWidth, volet: "fil", viewport: "mobile" })).toBe(0)
    }
  })
})

describe("les deux coquilles implémentent les paliers de R-15", () => {
  const desktop = cssOf(RESEAU_DESKTOP_CSS)
  const mobile = cssOf(RESEAU_MOBILE_CSS)

  it("le bureau élargit les collections par le volet ouvert", () => {
    expect(desktop).toContain('.rp-main-col[data-volet="relations"]')
    expect(desktop).toContain('.rp-main-col[data-volet="pages"]')
    expect(desktop).toContain('.rp-main-col[data-volet="groupes"]')
    expect(desktop).toContain('.rp-main-col[data-volet="enregistrements"]')
    expect(desktop).toContain(`max-width: ${COLLECTION_COLUMN_MAX}px`)
    // Le fil, lui, garde sa largeur d'article : aucune règle ne le relâche.
    expect(desktop).not.toContain('.rp-main-col[data-volet="fil"] {')
  })

  it("l'attribut est POSÉ, faute de quoi la règle ne s'applique à rien", () => {
    const page = codeOf("./ReseauAgentPage.tsx")
    // Le volet MONTRÉ, et non le volet demandé : une adresse vers un volet
    // que la page ne sert pas s'ouvre sur le fil, dont la colonne doit
    // prendre la largeur d'article.
    expect(page).toContain("data-volet={shownTab}")
    expect(page).toContain("const shownTab = servedReseauTab(tab)")
  })

  it("la tablette borne la lecture sans borner les collections", () => {
    expect(mobile).toContain("container-name: rp-page rm-scroll")
    expect(mobile).toContain(
      `@container rm-scroll (min-width: ${TABLET_COLUMN_MIN}px)`
    )
    expect(mobile).toContain(
      `@container rm-scroll (min-width: ${TABLET_WIDE_MIN}px)`
    )
    expect(mobile).toContain(`max-width: ${TABLET_COLUMN_MAX}px`)
    expect(mobile).toContain(`max-width: ${TABLET_WIDE_COLUMN_MAX}px`)
    expect(mobile).toContain(".rm-column:has([data-collection])")
    expect(mobile).toContain("max-width: none")
  })

  it("les trois collections se DÉSIGNENT, sinon la relâche ne trouve personne", () => {
    for (const [fichier, valeur] of [
      ["PeoplePanel.tsx", "relations"],
      ["PagesPanel.tsx", "pages"],
      ["GroupsPanel.tsx", "groupes"],
    ] as const) {
      expect(codeOf(`../features/reseau-personnel/${fichier}`)).toContain(
        `data-collection="${valeur}"`
      )
    }
  })

  it("le débordement des sous-menus se VOIT et se rattrape", () => {
    // Un sous-menu par volet servi, sur un téléphone : sans dégradé, la
    // dernière destination est coupée net et rien ne dit qu'il y en a
    // d'autres. Et un lien profond vers un volet hors champ ramène l'onglet
    // actif dans la rangée.
    expect(mobile).toContain("mask-image")
    const barre = codeOf("./mobile/ReseauMobileTabBar.tsx")
    expect(barre).toContain('scrollIntoView({ block: "nearest", inline: "nearest" })')
    expect(barre).toContain('[aria-current="page"]')
  })
})

describe("invariant du redimensionnement", () => {
  it("TOUTE vue autre que le fil expose un retour", () => {
    for (const view of ALL_VIEWS) {
      if (view.kind === "feed") {
        expect(viewNeedsReturn(view)).toBe(false)
        expect(viewReturnLabel(view, t)).toBeNull()
      } else {
        // Sans cela, passer de 375 à 1440 px pendant qu'une surface remplace
        // le fil laisserait l'écran bloqué sur un panneau que la largeur ne
        // justifie plus.
        expect(viewNeedsReturn(view)).toBe(true)
        expect(viewReturnLabel(view, t)).toBe("Revenir au fil")
      }
    }
  })

  it("chaque surface se nomme, sauf le fil qui est le lieu par défaut", () => {
    expect(viewHeading({ kind: "feed" }, t)).toBeNull()
    for (const view of ALL_VIEWS.filter((v) => v.kind !== "feed")) {
      const heading = viewHeading(view, t)
      expect(heading).not.toBeNull()
      expect((heading ?? "").length).toBeGreaterThan(0)
    }
    expect(viewHeading({ kind: "tag", tag: "numerique" }, t)).toContain(
      "#numerique"
    )
  })
})

describe("entrelacement des suggestions", () => {
  it("intercale après la 3ᵉ publication quand le fil est assez long", () => {
    expect(suggestionsInterleaveIndex(10)).toBe(SUGGESTIONS_AFTER)
    expect(suggestionsInterleaveIndex(4)).toBe(SUGGESTIONS_AFTER)
  })

  it("n'intercale pas dans un fil court — la carte passerait pour du contenu", () => {
    for (const count of [0, 1, 2, 3]) {
      expect(suggestionsInterleaveIndex(count)).toBeNull()
    }
  })

  it("ne place jamais la carte en tête", () => {
    for (let count = 0; count <= 30; count++) {
      const index = suggestionsInterleaveIndex(count)
      if (index !== null) {
        expect(index).toBeGreaterThan(0)
        expect(index).toBeLessThan(count)
      }
    }
  })
})

describe("prérequis bloquants remontés au-dessus du fil", () => {
  it("les invitations reçues remontent dès la première", () => {
    expect(shouldSurfaceInvitations(1)).toBe(true)
    expect(shouldSurfaceInvitations(0)).toBe(false)
    expect(shouldSurfaceInvitations(undefined)).toBe(false)
  })

  it("le bandeau dit de QUOI il s'agit, et s'accorde", () => {
    expect(invitationsBannerLabel(1, t)).toBe("1 invitation en attente")
    expect(invitationsBannerLabel(3, t)).toBe("3 invitations en attente")
  })
})

describe("composeSheetPose", () => {
  it("carte au bureau, plein écran au téléphone et au premier rendu", () => {
    expect(composeSheetPose(false)).toBe("card")
    expect(composeSheetPose(true)).toBe("fullscreen")
    // `null` = SSR / premier passage : se tromper vers la carte ferait
    // clignoter deux géométries au chargement du téléphone.
    expect(composeSheetPose(null)).toBe("fullscreen")
  })

  it("CLIQUET — la pose des actus et celle des publications ne peuvent pas diverger", () => {
    // Publier une actu, un statut ou une publication sont trois portes d'un
    // même geste : trois géométries d'ouverture seraient trois produits.
    // Tant que les deux fonctions coexistent (cf. l'en-tête de
    // `composeSheetPose`), ce test interdit qu'une seule bouge.
    for (const input of [true, false, null] as const) {
      expect(composeSheetPose(input)).toBe(storyComposePose(input))
    }
  })
})
