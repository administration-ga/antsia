// @vitest-environment node
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  type ChartedNode,
  colorsIn,
  contrastRatio,
  gradientStops,
  parseColor,
  parseRules,
  relativeLuminance,
  type Rgba,
  TokenCascade,
  toHex,
} from "../tests/css-token-cascade"

/**
 * Charte du réseau ANTSIA « Gaboma » (ADR-0027 ; remplace la palette encre,
 * ivoire et prune du lot P01) telle que antsia.ga la sert : `styles.css`
 * (theme.css, charte.css, communication.css) puis `themes/antsia.css`, cascade
 * rejouée avec ses spécificités réelles, sur <html> et sur un portail qui
 * redéclare `data-charte`. Gaboma est le thème par défaut : vert, jaune
 * (safran) et bleu du drapeau, chacun avec ses fonctions.
 *
 * Ce sont des contrastes CALCULÉS sur les jetons résolus (luminance relative
 * sRGB, WCAG 2.2) : ils ne remplacent pas la mesure du rendu dans le
 * navigateur (opacités, superpositions sur média, anticrénelage).
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const THEME = read("./antsia.css")
const BASE = read("../styles/charte.css")
const SHEETS = [
  { name: "theme.css", css: read("../styles/theme.css") },
  { name: "charte.css", css: BASE },
  { name: "communication.css", css: read("../styles/communication.css") },
  { name: "antsia.css", css: THEME },
] as const
const cascade = new TokenCascade(SHEETS)

type Mode = "clair" | "sombre"
const MODES: readonly Mode[] = ["clair", "sombre"]
const node = (mode: Mode, nested = false): ChartedNode => ({ charte: "antsia", dark: mode === "sombre", nested })

function value(mode: Mode, token: string, nested = false): string {
  const resolved = cascade.resolve(node(mode, nested), token)
  if (resolved === undefined) throw new Error(`${token} ne se résout pas en ${mode}`)
  return resolved
}

function color(mode: Mode, token: string, nested = false): Rgba {
  const parsed = parseColor(value(mode, token, nested))
  if (!parsed) throw new Error(`${token} n'est pas une couleur en ${mode} : ${value(mode, token, nested)}`)
  return parsed
}

const ratio = (mode: Mode, foreground: string, background: string) =>
  contrastRatio(color(mode, foreground), color(mode, background), color(mode, "--background"))
const luminance = (mode: Mode, token: string) => relativeLuminance(color(mode, token))

/** ADR-0027 : chaque rôle de Gaboma et les jetons de chaque famille qui le portent. */
const PALETTE: readonly { role: string; clair: string; sombre: string; tokens: readonly string[] }[] = [
  { role: "fond page", clair: "#ffffff", sombre: "#000000", tokens: ["--background", "--background-dashboard", "--ink-100"] },
  { role: "surface carte", clair: "#f7f7f7", sombre: "#141414", tokens: ["--card", "--esp-surface-card", "--secondary", "--ink-0", "--sidebar"] },
  { role: "surface élevée", clair: "#ffffff", sombre: "#1e1e1e", tokens: ["--popover", "--ink-50", "--esp-surface-raised"] },
  { role: "texte principal", clair: "#0a0a0a", sombre: "#f5f5f5", tokens: ["--foreground", "--card-foreground", "--popover-foreground", "--sidebar-foreground", "--ink-900", "--ink-800", "--ink-700"] },
  { role: "texte secondaire", clair: "#616161", sombre: "#a1a1a1", tokens: ["--muted-foreground", "--secondary-foreground", "--sidebar-muted", "--ink-600", "--ink-500", "--ink-400"] },
  { role: "encre d'action et lien (bleu)", clair: "#2a5fa8", sombre: "#86b2f4", tokens: ["--primary", "--primary-500", "--accent", "--sidebar-primary", "--info-500", "--status-active"] },
  { role: "aplat d'action : Publier, Écrire (bleu)", clair: "#2f67b5", sombre: "#6fa2f0", tokens: ["--primary-fill", "--role-message-fill"] },
  { role: "texte sur l'aplat d'action", clair: "#ffffff", sombre: "#06142e", tokens: ["--primary-fill-on", "--role-message-on"] },
  { role: "texte sur l'encre d'action", clair: "#ffffff", sombre: "#03210f", tokens: ["--primary-foreground", "--on-fill", "--accent-foreground", "--sidebar-primary-foreground"] },
  { role: "relations : Suivre (vert)", clair: "#007e4d", sombre: "#2fcb86", tokens: ["--role-social-fill"] },
  { role: "réactions et commerce : J'aime, Participer (safran)", clair: "#f4bb44", sombre: "#f4bb44", tokens: ["--role-react-fill", "--role-commerce-fill"] },
  { role: "séparateur", clair: "#e6e6e6", sombre: "#262626", tokens: ["--border", "--ink-200", "--sidebar-border"] },
  { role: "contour de contrôle", clair: "#878787", sombre: "#707070", tokens: ["--input", "--ink-300"] },
  { role: "focus", clair: "#2a5fa8", sombre: "#86b2f4", tokens: ["--ring", "--sidebar-ring", "--outline-ring"] },
  // Valider et Supprimer, chacun ses trois couleurs comme dans les chartes (19/10/2026).
  { role: "Valider : aplat (Accepter, Décrocher)", clair: "#00804e", sombre: "#2fcb86", tokens: ["--role-success-fill", "--success-fill", "--success-500", "--esp-green-strong", "--status-archived"] },
  { role: "Valider : texte sur l'aplat", clair: "#ffffff", sombre: "#03210f", tokens: ["--role-success-on"] },
  { role: "Valider : encre (confirmation)", clair: "#006b42", sombre: "#4ad898", tokens: ["--role-success-ink", "--success", "--success-600"] },
  { role: "Supprimer : aplat (Supprimer, Raccrocher)", clair: "#c8102e", sombre: "#ff6b7a", tokens: ["--role-danger-fill", "--danger-fill", "--danger-500", "--status-error"] },
  { role: "Supprimer : texte sur l'aplat", clair: "#ffffff", sombre: "#2a0509", tokens: ["--role-danger-on"] },
  { role: "Supprimer : encre (erreur)", clair: "#b50e29", sombre: "#ff8592", tokens: ["--role-danger-ink", "--destructive", "--danger-600"] },
]

/** Texte (≥ 4,5:1) : [premier plan, fond, où l'écran les associe]. */
const TEXT_PAIRS: readonly (readonly [string, string, string])[] = [
  ["--foreground", "--background", "texte du document"],
  ["--card-foreground", "--card", "auteur, titre et corps d'une carte"],
  ["--popover-foreground", "--popover", "menu, feuille, dialogue"],
  ["--foreground", "--muted", "encart et survol"],
  ["--muted-foreground", "--background", "date, aide sur le fond"],
  ["--muted-foreground", "--card", "date, aide dans une carte"],
  ["--muted-foreground", "--popover", "aide dans un menu"],
  ["--muted-foreground", "--muted", "aide dans un encart"],
  ["--secondary-foreground", "--secondary", "carte du kit (FlatCard)"],
  ["--primary", "--background", "lien sur le fond"],
  ["--primary", "--card", "lien dans une carte"],
  ["--primary", "--popover", "lien dans un menu"],
  ["--primary", "--muted", "lien dans un encart"],
  ["--primary-foreground", "--primary", "bouton plein (shadcn)"],
  ["--primary-fill-on", "--primary-fill", "bouton plein (ui-v2), bulle envoyée"],
  ["--primary-fill-on", "--primary-fill-hover", "bouton plein survolé"],
  ["--accent-foreground", "--accent", "onglet actif, rangée choisie"],
  ["--on-fill", "--primary-600", "aplat d'accent d'iCom"],
  ["--on-fill", "--danger-fill", "bouton de danger, enregistrement"],
  ["--on-fill", "--danger-fill-hover", "bouton de danger survolé"],
  ["--on-fill", "--success-fill", "bouton de succès"],
  ["--on-fill", "--success-fill-hover", "bouton de succès survolé"],
  ["--on-fill", "--success", "décrocher un appel"],
  ["--on-fill", "--esp-green-strong", "« Créer un compte » de l'accueil"],
  ["--destructive-foreground", "--destructive", "raccrocher, pastille de non-lus"],
  ["--background", "--destructive", "pastille d'appel manqué"],
  ["--success", "--background", "confirmation sur le fond"],
  ["--success", "--card", "confirmation dans une carte"],
  ["--success", "--popover", "confirmation dans un menu"],
  ["--destructive", "--background", "erreur sur le fond"],
  ["--destructive", "--card", "erreur de formulaire dans une carte"],
  ["--destructive", "--popover", "erreur dans un menu"],
  ["--danger-500", "--ink-0", "astérisque et erreur de champ (repli)"],
  ["--role-danger-ink", "--ink-0", "astérisque et erreur de champ"],
  ["--role-success-on", "--role-success-fill", "Valider, Décrocher, Reprendre"],
  ["--role-danger-on", "--role-danger-fill", "Supprimer, Raccrocher, pastille « En direct »"],
  ["--danger-600", "--ink-0", "action grave d'un menu"],
  ["--danger-600", "--danger-50", "badge de danger"],
  ["--danger-700", "--danger-50", "action sensible d'iCom"],
  ["--success-600", "--success-50", "badge et alerte de succès"],
  ["--success-600", "--status-archived-bg", "badge archivé"],
  ["--primary-500", "--ink-0", "lien ui-v2 dans une carte"],
  ["--primary-600", "--ink-0", "libellé actif dans une carte"],
  ["--primary-600", "--background", "libellé actif sur le fond"],
  ["--primary-700", "--ink-0", "texte d'accent fort"],
  ["--primary-600", "--primary-50", "badge primaire, rangée sélectionnée"],
  ["--primary-700", "--primary-50", "texte sur la sélection"],
  ["--primary-700", "--primary-100", "sélection appuyée"],
  ["--primary-800", "--primary-100", "filtre choisi d'iCom"],
  ["--foreground", "--primary-50", "option choisie"],
  ["--info-600", "--info-50", "badge et alerte d'information"],
  ["--primary-600", "--status-active-bg", "badge actif"],
  ["--esp-accent-deep", "--esp-accent-soft", "élément de navigation actif"],
  ["--sidebar-accent-foreground", "--sidebar-accent", "rail actif"],
  ["--sidebar-foreground", "--sidebar", "rail"],
  ["--ink-900", "--ink-0", "texte ui-v2 dans une carte"],
  ["--ink-900", "--ink-100", "bulle reçue d'iCom"],
  ["--ink-800", "--ink-0", "libellé de champ, bouton outline"],
  ["--ink-700", "--ink-0", "texte riche"],
  ["--ink-600", "--ink-0", "méta ui-v2"],
  ["--ink-600", "--ink-100", "méta sur une puce"],
  ["--ink-600", "--ink-50", "méta en surface élevée"],
  ["--ink-500", "--ink-0", "horodatage"],
  ["--ink-400", "--ink-0", "ligne compacte de notification"],
  ["--ink-400", "--popover", "ligne compacte dans la cloche"],
  ["--ink-600", "--ink-150", "vignette d'album vide"],
  ["--ink-700", "--ink-150", "badge neutre"],
  ["--ink-700", "--status-semi-bg", "badge partiel"],
  ["--ink-600", "--status-inactive-bg", "badge inactif"],
  ["--muted-foreground", "--esp-neutral-chip", "bouton de la cloche"],
  // Couleurs par fonction (ADR-0027).
  ["--role-social-on", "--role-social-fill", "bouton Suivre"],
  ["--role-social-ink", "--card", "coche « Vérifié » et lien de relation dans une carte"],
  ["--role-message-ink", "--role-message-soft", "bouton Écrire (tonal)"],
  ["--role-react-on", "--role-react-fill", "bouton J'aime, pastille de non-lus"],
  ["--role-react-label", "--role-react-soft", "libellé de l'action réagie"],
  ["--role-commerce-on", "--role-commerce-fill", "bouton Participer, Acheter"],
  ["--role-commerce-ink", "--card", "lien « Voir la boutique » dans une carte"],
  ["--ui2-button-secondary-fg", "--ui2-button-secondary-bg", "bouton secondaire tonal"],
  ["--ink-800", "--ui2-button-outline-bg", "bouton neutre gris (Annuler)"],
]

/** Non textuel (≥ 3:1, WCAG 1.4.11) : contours de contrôle, anneaux de focus, pastilles. */
const NON_TEXT_PAIRS: readonly (readonly [string, string, string])[] = [
  ["--input", "--background", "champ sur le fond"],
  ["--input", "--card", "champ dans une carte"],
  ["--input", "--popover", "champ dans une feuille"],
  ["--input", "--muted", "champ dans un encart"],
  ["--ink-300", "--ink-0", "champ et bouton outline ui-v2"],
  ["--ink-300", "--ink-100", "champ ui-v2 sur le fond"],
  ["--ink-400", "--ink-0", "case à cocher, bouton radio"],
  ["--ring", "--background", "focus sur le fond"],
  ["--ring", "--card", "focus dans une carte"],
  ["--ring", "--popover", "focus dans un menu"],
  ["--ring", "--muted", "focus dans un encart"],
  ["--outline-ring", "--background", "anneau du navigateur sur le fond"],
  ["--outline-ring", "--card", "anneau du navigateur dans une carte"],
  ["--outline-ring", "--popover", "anneau du navigateur dans un menu"],
  ["--primary-300", "--background", "anneau 3 px (réactions, commentaires)"],
  ["--primary-300", "--card", "anneau 3 px dans une carte"],
  ["--primary-300", "--popover", "anneau 3 px dans un menu"],
  ["--primary-400", "--card", "anneau du carrousel"],
  ["--primary-400", "--background", "anneau du carrousel sur le fond"],
  ["--primary-fill", "--card", "limite d'un bouton plein"],
  ["--warning", "--card", "pastille d'attente (ambre de la base)"],
  ["--role-react-ink", "--card", "cœur d'une publication aimée"],
  ["--role-react-ink", "--background", "cœur sur le fond"],
]

/** Rôles du bloc sombre de la base qu'ANTSIA garde tels quels, à dessein. */
const INHERITED_IN_DARK = new Set([
  // Ambre d'avertissement, tons de compteur et séries de graphique : catégoriels, mesurés par la base.
  "--warning", "--warning-light", "--warning-50", "--warning-100", "--warning-500", "--warning-600",
  "--status-destruct", "--status-destruct-bg",
  "--accent-orange", "--accent-yellow", "--accent-blue",
  "--chart-2", "--chart-3", "--chart-4", "--chart-5",
  "--esp-tone-blue", "--esp-tone-blue-bg", "--esp-tone-amber", "--esp-tone-amber-bg",
  "--esp-tone-rose", "--esp-tone-rose-bg", "--esp-tone-green", "--esp-tone-green-bg",
  // Valeurs de la base posées sur les primitives réaccordées (le fond de la barre
  // flottante est désormais propre au thème, ADR-0027).
  "--esp-mobilebar-shadow", "--esp-shadow-card", "--border-light",
  // Sélecteur de comptes de l'espace agent : absent du réseau.
  "--esp-segment-on", "--esp-segment-on-fg",
])

const themeRules = parseRules({ name: "antsia.css", css: THEME })
const LIGHT_ONLY = ['[data-charte="antsia"]']
const DARK_ONLY = ['.dark[data-charte="antsia"]', '.dark [data-charte="antsia"]']
const BOTH = [...LIGHT_ONLY, ...DARK_ONLY]
const keysOf = (selectors: readonly string[]) =>
  new Set(themeRules.filter((rule) => rule.selectors.join("|") === selectors.join("|")).flatMap((rule) => rule.declarations.map((declaration) => declaration.token)))

describe("charte ANTSIA servie par le moteur — cascade base + thème", () => {
  it("le thème a trois blocs : clair, sombre et commun aux deux, sans recouvrement", () => {
    expect(themeRules.map((rule) => rule.selectors)).toEqual([LIGHT_ONLY, DARK_ONLY, BOTH])
    const [light, dark, both] = [keysOf(LIGHT_ONLY), keysOf(DARK_ONLY), keysOf(BOTH)]
    expect([...both].filter((token) => light.has(token) || dark.has(token))).toEqual([])
  })

  it("le sombre redéclare chaque rôle du bloc sombre de la base, sauf les héritages listés", () => {
    const baseDark = parseRules({ name: "charte.css", css: BASE }).find((rule) => rule.condition === null && rule.selectors.join("|") === ".dark[data-charte]|.dark [data-charte]")
    const baseDarkKeys = new Set(baseDark?.declarations.map((declaration) => declaration.token))
    expect(baseDarkKeys.size).toBeGreaterThan(100)
    const covered = new Set([...keysOf(DARK_ONLY), ...keysOf(BOTH)])
    expect([...baseDarkKeys].filter((token) => !covered.has(token)).sort()).toEqual([...INHERITED_IN_DARK].sort())
  })

  for (const mode of MODES) {
    describe(`thème ${mode}`, () => {
      it.each(PALETTE)("$role : la palette Gaboma (ADR-0027) portée par chaque famille, sur <html> et dans un portail", (entry) => {
        for (const token of entry.tokens) {
          for (const nested of [false, true]) {
            expect(toHex(color(mode, token, nested)), `${token}${nested ? " (portail)" : ""}`).toBe(entry[mode])
          }
        }
      })

      it.each(TEXT_PAIRS)("texte %s sur %s ≥ 4,5:1 (%s)", (foreground, background) => {
        expect(ratio(mode, foreground, background)).toBeGreaterThanOrEqual(4.5)
      })

      it.each(NON_TEXT_PAIRS)("contour %s sur %s ≥ 3:1 (%s)", (foreground, background) => {
        expect(ratio(mode, foreground, background)).toBeGreaterThanOrEqual(3)
      })

      it("titre blanc sur chaque arrêt de la couverture de repli ≥ 4,5:1", () => {
        const stops = gradientStops(value(mode, "--esp-banner"))
        expect(stops).toHaveLength(2)
        for (const stop of stops) expect(contrastRatio(color(mode, "--esp-on-banner"), stop)).toBeGreaterThanOrEqual(4.5)
      })

      it("barre basse translucide : libellés lisibles sur le fond qui défile", () => {
        const bar = color(mode, "--esp-mobilebar-bg")
        for (const label of ["--foreground", "--muted-foreground", "--primary"]) {
          expect(contrastRatio(color(mode, label), bar, color(mode, "--background")), label).toBeGreaterThanOrEqual(4.5)
        }
      })

      it("un portail qui redéclare la charte résout exactement les jetons de <html>", () => {
        expect(cascade.resolveAll(node(mode, true))).toEqual(cascade.resolveAll(node(mode)))
      })

      it("le drapeau par fonction : bleu pour publier, vert pour suivre, safran pour réagir et participer", () => {
        for (const nested of [false, true]) {
          expect(toHex(color(mode, "--primary-fill", nested))).toBe(mode === "clair" ? "#2f67b5" : "#6fa2f0")
          expect(toHex(color(mode, "--role-social-fill", nested))).toBe(mode === "clair" ? "#007e4d" : "#2fcb86")
          expect(toHex(color(mode, "--role-react-fill", nested))).toBe("#f4bb44")
          expect(toHex(color(mode, "--role-commerce-fill", nested))).toBe("#f4bb44")
        }
        // Les trois couleurs de l'aperçu, dans l'ordre du drapeau : vert, jaune, bleu.
        expect(["--esp-theme-swatch-1", "--esp-theme-swatch-2", "--esp-theme-swatch-3"].map((token) => toHex(color(mode, token)))).toEqual(["#007e4d", "#f4bb44", "#2f67b5"])
      })
    })
  }

  it("clair : fond blanc, cartes gris très clair d'un cran, creux sous la carte, menus blancs", () => {
    expect(luminance("clair", "--background")).toBeGreaterThan(luminance("clair", "--card"))
    expect(ratio("clair", "--card", "--background")).toBeGreaterThanOrEqual(1.05)
    expect(ratio("clair", "--card", "--background")).toBeLessThanOrEqual(1.15)
    expect(luminance("clair", "--muted")).toBeLessThan(luminance("clair", "--card"))
    expect(ratio("clair", "--muted", "--card")).toBeGreaterThanOrEqual(1.08)
    expect(ratio("clair", "--primary-50", "--card")).toBeGreaterThanOrEqual(1.1)
  })

  it("sombre : charbon, carte relevée, surface élevée et sélection au-dessus de la carte", () => {
    expect(luminance("sombre", "--card")).toBeGreaterThan(luminance("sombre", "--background"))
    expect(luminance("sombre", "--popover")).toBeGreaterThan(luminance("sombre", "--card"))
    expect(ratio("sombre", "--card", "--background")).toBeGreaterThanOrEqual(1.1)
    expect(ratio("sombre", "--popover", "--card")).toBeGreaterThanOrEqual(1.1)
    // Survol et encart se lèvent ; la sélection se lit sans contour, même dans un menu.
    expect(luminance("sombre", "--muted")).toBeGreaterThan(luminance("sombre", "--card"))
    expect(luminance("sombre", "--primary-50")).toBeGreaterThan(luminance("sombre", "--popover"))
    expect(ratio("sombre", "--primary-50", "--card")).toBeGreaterThanOrEqual(1.2)
  })

  it("voile des surfaces superposées : l'encre du texte principal à 55 %, dans les deux thèmes", () => {
    const ink = color("clair", "--foreground")
    for (const mode of MODES) {
      const scrim = color(mode, "--ui2-scrim")
      expect(toHex({ ...scrim, a: 1 }), mode).toBe(toHex(ink))
      expect(scrim.a, mode).toBeCloseTo(0.55, 5)
    }
  })

  it("rayons : 12 px cartes et champs, 16 px feuilles, pilule intacte", () => {
    for (const token of ["--radius", "--radius-md", "--radius-lg", "--radius-xl"]) expect(value("clair", token), token).toBe("12px")
    expect(value("clair", "--radius-2xl")).toBe("16px")
    expect(value("sombre", "--radius-xl")).toBe("12px")
    expect(value("clair", "--esp-r-chrome")).toBe("999px")
  })

  it("cartes du fil (ADR-0027, étude du 22/10/2026) : 16 px dans les deux thèmes, un angle propre aux cartes", () => {
    for (const mode of MODES) {
      for (const nested of [false, true]) expect(value(mode, "--rp-surface-radius", nested), mode).toBe("16px")
    }
  })

  it("surfaces élevées des publications (lot P03, D3) : menus, feuilles et dialogues peints en surface élevée", () => {
    // Les expressions EXACTES des six sites (garde de source dans `themes-isolation.test.ts`).
    const sites = [
      "var(--esp-surface-raised, var(--esp-surface-card, var(--secondary)))",
      "var(--esp-surface-raised, var(--ink-0))",
      "var(--esp-surface-raised, var(--background))",
      "var(--esp-surface-raised, var(--card))",
    ]
    const raised = PALETTE.find((entry) => entry.role === "surface élevée")!
    for (const mode of MODES) {
      for (const nested of [false, true]) {
        for (const site of sites) {
          const resolved = cascade.resolveValue(node(mode, nested), site)
          expect(resolved, `${mode} ${site}`).toBeDefined()
          expect(toHex(parseColor(resolved!)!), `${mode}${nested ? " (portail)" : ""} ${site}`).toBe(raised[mode])
        }
      }
      // Le texte des menus et feuilles reste lisible sur cette surface.
      expect(ratio(mode, "--popover-foreground", "--esp-surface-raised")).toBeGreaterThanOrEqual(4.5)
      expect(ratio(mode, "--ink-600", "--esp-surface-raised")).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("liens du texte courant (lot P03, D5) : soulignés, la couleur seule ne les distinguant pas du texte (< 3:1)", () => {
    for (const mode of MODES) {
      expect(value(mode, "--esp-inline-link-decoration"), mode).toBe("underline")
      // RichText : liens en `--primary-600`, texte courant en `--ink-700`.
      expect(ratio(mode, "--primary-600", "--ink-700"), mode).toBeLessThan(3)
      // Le lien lui-même reste lisible sur la carte.
      expect(ratio(mode, "--primary-600", "--card"), mode).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("texte courant en Inter, embarquée comme Familjen Grotesk ; aucune infrastructure d'apparence ajoutée", () => {
    // Inter n'était qu'un nom de famille sans fichier : le texte tombait sur la police du système.
    const imported = /@import "(@fontsource-variable\/inter)";/.exec(read("../styles.css"))?.[1]
    expect(imported).toBe("@fontsource-variable/inter")
    const faces = new Set([...read(`../../node_modules/${imported}/index.css`).matchAll(/font-family: '([^']+)'/g)].map((match) => match[1]))
    const first = /^"([^"]+)"/.exec(value("clair", "--font-sans"))?.[1]
    expect(first).toBe("Inter Variable")
    expect(faces.has(first)).toBe(true)
    expect(value("sombre", "--font-sans")).toBe(value("clair", "--font-sans"))
    expect(THEME.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/@import|@font-face|url\(|prefers-color-scheme/)
  })

  it("corps de texte à 16 px dans les deux thèmes (03 §3), interligne de la couche de base inchangé", () => {
    for (const mode of MODES) expect(value(mode, "--body-font-size"), mode).toBe("16px")
    expect(read("../styles/theme.css")).toMatch(/font-size: var\(--body-font-size, 15px\);\s*line-height: 1\.5;/)
  })

  it("titres : la première face de `--font-display` est celle que `styles.css` importe réellement", () => {
    const imported = /@import "(@fontsource-variable\/familjen-grotesk)";/.exec(read("../styles.css"))?.[1]
    expect(imported).toBe("@fontsource-variable/familjen-grotesk")
    const faces = new Set([...read(`../../node_modules/${imported}/index.css`).matchAll(/font-family: '([^']+)'/g)].map((match) => match[1]))
    for (const mode of MODES) {
      const first = /^"([^"]+)"/.exec(value(mode, "--font-display"))?.[1]
      expect(first, mode).toBe("Familjen Grotesk Variable")
      expect(faces.has(first), mode).toBe(true)
    }
  })

  it("ombres : l'encre en clair (mêmes géométries et opacités que la base), les ombres noires de la base en sombre", () => {
    const base = new TokenCascade(SHEETS.slice(0, 3))
    const shape = (raw: string) => raw.replace(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/gi, "C")
    const ink = color("clair", "--foreground")
    for (const token of ["--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl", "--icom-float-drag-shadow"]) {
      const antsia = value("clair", token)
      const reference = base.resolve({ charte: "antsia", dark: false, nested: false }, token) ?? ""
      expect(shape(antsia), token).toBe(shape(reference))
      expect(colorsIn(antsia).map((part) => part.a), token).toEqual(colorsIn(reference).map((part) => part.a))
      for (const part of colorsIn(antsia)) expect(toHex({ ...part, a: 1 }), token).toBe(toHex(ink))
    }
    for (const token of ["--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl"]) {
      expect(value("sombre", token), token).toBe(base.resolve({ charte: "antsia", dark: true, nested: false }, token))
    }
  })
})
