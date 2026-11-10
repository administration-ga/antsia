// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  type ChartedNode,
  contrastRatio,
  gradientStops,
  parseColor,
  parseRules,
  relativeLuminance,
  type Rgba,
  TokenCascade,
  toHex,
} from "../tests/css-token-cascade"
import { ANTSIA_THEME_IDS, antsiaCharteFor } from "./antsia-themes"

/**
 * Les sept thèmes qu'un membre d'antsia.ga choisit dans ses réglages (ADR-0027) :
 * Gaboma, la charte du réseau (`antsia.css`), puis Soleil, Forêt, Corail, Lagon,
 * Électrique et Sable, la charte de DIASPORALE (`antsia-<thème>.css`). Chaque thème est une charte complète,
 * rejouée ici comme antsia.ga la sert : theme.css, charte.css, communication.css
 * puis le fichier du thème, sur <html> et sur un portail qui redéclare la charte.
 *
 * Règles vérifiées : trois couleurs par thème, chacune avec ses fonctions
 * (identité, relations, messages, réactions, commerce) ; l'identité a une ENCRE
 * lisible en texte (`--primary`) et un APLAT de bouton (`--primary-fill`) avec son
 * propre texte ; fonds neutres ; système épuré (un angle par élément, contour
 * seulement à couleur égale). Contrastes CALCULÉS sur les jetons résolus.
 *
 * Écart assumé (ADR-0027) : les aplats clairs retenus par le propriétaire
 * (turquoise, mandarine, safran…) ne tiennent pas 3:1 contre la carte ; un bouton
 * plein se reconnaît à son libellé, lisible à ≥ 4,5:1 sur son aplat. La paire
 * « limite d'un bouton plein » n'est donc exigée que de Gaboma
 * (`antsia-palette.test.ts`).
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const BASE = read("../styles/charte.css")
const BASE_SHEETS = [
  { name: "theme.css", css: read("../styles/theme.css") },
  { name: "charte.css", css: BASE },
  { name: "communication.css", css: read("../styles/communication.css") },
] as const

/** Les couleurs retenues par le propriétaire (troisième série, 19/10/2026) : encre et aplat d'identité, puis l'aperçu. */
const EXPECTED: Record<string, { encre: [string, string]; aplat: [string, string]; nuancier: [string, string, string] }> = {
  gaboma: { encre: ["#2a5fa8", "#86b2f4"], aplat: ["#2f67b5", "#6fa2f0"], nuancier: ["#007e4d", "#f4bb44", "#2f67b5"] },
  soleil: { encre: ["#a4520d", "#f6a660"], aplat: ["#ec8b34", "#f29a4a"], nuancier: ["#ec8b34", "#3f9fe8", "#f1453b"] },
  foret: { encre: ["#2d7240", "#76bf85"], aplat: ["#317a45", "#76bf85"], nuancier: ["#317a45", "#646e40", "#c98a2b"] },
  corail: { encre: ["#ba3354", "#f58da0"], aplat: ["#e25f78", "#f07a90"], nuancier: ["#e25f78", "#e69545", "#aa84d4"] },
  lagon: { encre: ["#0d6f6a", "#6fe0d8"], aplat: ["#4ecdc4", "#4ecdc4"], nuancier: ["#4ecdc4", "#ff6b6b", "#ffe66d"] },
  electrique: { encre: ["#0033ff", "#93a8ff"], aplat: ["#0033ff", "#4060ff"], nuancier: ["#0033ff", "#f43f5e", "#84cc16"] },
  // Sable, la charte de DIASPORALE (19/10/2026) : mêmes trois couleurs que le thème Sable de diasporale.com.
  sable: { encre: ["#01609c", "#7ec2ff"], aplat: ["#0167a8", "#5ba5e5"], nuancier: ["#238090", "#d7ad63", "#0167a8"] },
}

/**
 * Valider (succès) et Supprimer (danger) dans les chartes « Chartes ANTSIA » v7 : aplat,
 * texte sur l'aplat, encre en texte — chacun le sien, valeurs exactes des chartes.
 */
type Triple = readonly [fill: string, on: string, ink: string]
const STATES: Record<string, Record<"clair" | "sombre", { success: Triple; danger: Triple }>> = {
  gaboma: { clair: { success: ["#00804e", "#ffffff", "#006b42"], danger: ["#c8102e", "#ffffff", "#b50e29"] }, sombre: { success: ["#2fcb86", "#03210f", "#4ad898"], danger: ["#ff6b7a", "#2a0509", "#ff8592"] } },
  soleil: { clair: { success: ["#237a40", "#ffffff", "#1b6434"], danger: ["#c8331f", "#ffffff", "#b42d1b"] }, sombre: { success: ["#5cc584", "#062612", "#6bd192"], danger: ["#ff7b66", "#2a0700", "#ff8b78"] } },
  foret: { clair: { success: ["#317a45", "#ffffff", "#28723d"], danger: ["#b3261e", "#ffffff", "#a3221b"] }, sombre: { success: ["#76bf85", "#031c09", "#76bf85"], danger: ["#f0897e", "#2a0603", "#f59a90"] } },
  corail: { clair: { success: ["#2e7d4f", "#ffffff", "#22603c"], danger: ["#b42335", "#ffffff", "#a81f31"] }, sombre: { success: ["#6fcf97", "#062614", "#7dd8a3"], danger: ["#ff8a8a", "#2a0505", "#ff9a9a"] } },
  lagon: { clair: { success: ["#1e7a4f", "#ffffff", "#17633f"], danger: ["#c93030", "#ffffff", "#b82b2b"] }, sombre: { success: ["#5fd39a", "#062614", "#6fdca6"], danger: ["#ff7b72", "#2a0505", "#ff8f87"] } },
  electrique: { clair: { success: ["#15803d", "#ffffff", "#126e35"], danger: ["#dc2626", "#ffffff", "#c81e1e"] }, sombre: { success: ["#34d399", "#001c10", "#34d399"], danger: ["#f87171", "#2a0505", "#fc9595"] } },
  sable: { clair: { success: ["#14743a", "#ffffff", "#0f5f2f"], danger: ["#b3261e", "#ffffff", "#b3261e"] }, sombre: { success: ["#6ebe85", "#151311", "#6ebe85"], danger: ["#e18c85", "#151311", "#e18c85"] } },
}

type Mode = "clair" | "sombre"
const MODES: readonly Mode[] = ["clair", "sombre"]
const at = (mode: Mode) => (mode === "clair" ? 0 : 1)

/** Texte (≥ 4,5:1), les mêmes paires que la charte du réseau, plus les fonctions. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["--foreground", "--background"], ["--card-foreground", "--card"], ["--popover-foreground", "--popover"], ["--foreground", "--muted"],
  ["--muted-foreground", "--background"], ["--muted-foreground", "--card"], ["--muted-foreground", "--popover"], ["--muted-foreground", "--muted"],
  ["--secondary-foreground", "--secondary"], ["--primary", "--background"], ["--primary", "--card"], ["--primary", "--popover"], ["--primary", "--muted"],
  ["--primary-foreground", "--primary"], ["--primary-fill-on", "--primary-fill"], ["--primary-fill-on", "--primary-fill-hover"], ["--accent-foreground", "--accent"],
  ["--on-fill", "--primary-600"], ["--on-fill", "--danger-fill"], ["--on-fill", "--danger-fill-hover"], ["--on-fill", "--success-fill"],
  ["--on-fill", "--success-fill-hover"], ["--on-fill", "--success"], ["--on-fill", "--esp-green-strong"], ["--destructive-foreground", "--destructive"],
  ["--background", "--destructive"], ["--success", "--background"], ["--success", "--card"], ["--success", "--popover"], ["--destructive", "--background"],
  ["--destructive", "--card"], ["--destructive", "--popover"], ["--danger-500", "--ink-0"], ["--danger-600", "--ink-0"], ["--danger-600", "--danger-50"],
  ["--danger-700", "--danger-50"], ["--success-600", "--success-50"], ["--success-600", "--status-archived-bg"], ["--primary-500", "--ink-0"],
  ["--primary-600", "--ink-0"], ["--primary-600", "--background"], ["--primary-700", "--ink-0"], ["--primary-600", "--primary-50"],
  ["--primary-700", "--primary-50"], ["--primary-700", "--primary-100"], ["--primary-800", "--primary-100"], ["--foreground", "--primary-50"],
  ["--info-600", "--info-50"], ["--primary-600", "--status-active-bg"], ["--esp-accent-deep", "--esp-accent-soft"],
  ["--sidebar-accent-foreground", "--sidebar-accent"], ["--sidebar-foreground", "--sidebar"], ["--ink-900", "--ink-0"], ["--ink-900", "--ink-100"],
  ["--ink-800", "--ink-0"], ["--ink-700", "--ink-0"], ["--ink-600", "--ink-0"], ["--ink-600", "--ink-100"], ["--ink-600", "--ink-50"],
  ["--ink-500", "--ink-0"], ["--ink-400", "--ink-0"], ["--ink-400", "--popover"], ["--ink-600", "--ink-150"], ["--ink-700", "--ink-150"],
  ["--ink-700", "--status-semi-bg"], ["--ink-600", "--status-inactive-bg"], ["--muted-foreground", "--esp-neutral-chip"],
  // Une couleur par fonction (ADR-0027).
  ["--role-social-on", "--role-social-fill"], ["--role-social-ink", "--card"], ["--role-social-ink", "--background"],
  ["--role-message-on", "--role-message-fill"], ["--role-message-ink", "--card"], ["--role-message-ink", "--role-message-soft"],
  ["--role-react-on", "--role-react-fill"], ["--role-react-label", "--role-react-soft"],
  ["--role-commerce-on", "--role-commerce-fill"], ["--role-commerce-ink", "--card"], ["--role-commerce-ink", "--background"],
  ["--ui2-button-secondary-fg", "--ui2-button-secondary-bg"], ["--ink-800", "--ui2-button-outline-bg"], ["--esp-tab-active-fg", "--esp-tab-active-bg"],
  // Valider et Supprimer, chacun ses trois couleurs (chartes du 19/10/2026).
  ["--role-success-on", "--role-success-fill"], ["--role-success-ink", "--card"], ["--role-success-ink", "--background"], ["--role-success-ink", "--popover"],
  ["--role-danger-on", "--role-danger-fill"], ["--role-danger-ink", "--card"], ["--role-danger-ink", "--background"], ["--role-danger-ink", "--popover"],
  ["--role-danger-ink", "--ink-0"],
  // Aplat d'identité aux sites qui peignaient l'encre en fond (« Nouvelles publications », « Appeler »…).
  ["--primary-fill-on", "--esp-identity-fill"], ["--primary-fill-on", "--esp-identity-fill-hover"],
]

/** Non textuel (≥ 3:1, WCAG 1.4.11) : champs, anneaux, icônes de réaction. */
const NON_TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["--input", "--background"], ["--input", "--card"], ["--input", "--popover"], ["--input", "--muted"], ["--ink-300", "--ink-0"],
  ["--ink-300", "--ink-100"], ["--ink-400", "--ink-0"], ["--ring", "--background"], ["--ring", "--card"], ["--ring", "--popover"], ["--ring", "--muted"],
  ["--outline-ring", "--background"], ["--outline-ring", "--card"], ["--outline-ring", "--popover"], ["--primary-300", "--background"],
  ["--primary-300", "--card"], ["--primary-300", "--popover"], ["--primary-400", "--card"], ["--primary-400", "--background"],
  ["--warning", "--card"], ["--role-react-ink", "--card"], ["--role-react-ink", "--background"],
]

/** Rôles du bloc sombre de la base gardés tels quels, comme dans la charte du réseau. */
const INHERITED_IN_DARK = new Set([
  "--warning", "--warning-light", "--warning-50", "--warning-100", "--warning-500", "--warning-600",
  "--status-destruct", "--status-destruct-bg",
  "--accent-orange", "--accent-yellow", "--accent-blue",
  "--chart-2", "--chart-3", "--chart-4", "--chart-5",
  "--esp-tone-blue", "--esp-tone-blue-bg", "--esp-tone-amber", "--esp-tone-amber-bg",
  "--esp-tone-rose", "--esp-tone-rose-bg", "--esp-tone-green", "--esp-tone-green-bg",
  "--esp-mobilebar-shadow", "--esp-shadow-card", "--border-light",
  "--esp-segment-on", "--esp-segment-on-fg",
])

/** Un angle par élément (ADR-0027). */
const ANGLES: Record<string, string> = {
  "--esp-social-action-radius": "6px",
  "--ui2-button-radius": "999px", "--ui2-badge-radius": "6px", "--ui2-card-radius": "16px", "--esp-chip-radius": "10px",
  "--esp-avatar-page-radius": "12px", "--esp-field-radius": "14px", "--esp-media-radius": "12px", "--esp-fab-radius": "14px",
  "--rp-surface-radius": "16px", "--esp-mobilebar-radius": "26px", "--esp-header-icon-radius": "999px",
}

/**
 * Écart des composantes : sous 0,07, la couleur se lit comme un neutre (blanc, gris, beige, noir).
 * Le plus coloré des fonds des chartes est le creux du fond Lin (Forêt, #ece6db) : 0,067.
 */
const chroma = (rgba: Rgba) => Math.max(rgba.r, rgba.g, rgba.b) - Math.min(rgba.r, rgba.g, rgba.b)
const NEUTRAL_CHROMA = 0.07

const declarationsOf = (css: string, selectors: readonly string[]) =>
  parseRules({ name: "thème", css })
    .filter((rule) => rule.selectors.join("|") === selectors.join("|"))
    .flatMap((rule) => rule.declarations.map((declaration) => [declaration.token, declaration.value] as const))

const sharedOf = (charte: string) =>
  new Map(declarationsOf(read(`./${charte}.css`), [`[data-charte="${charte}"]`, `.dark[data-charte="${charte}"]`, `.dark [data-charte="${charte}"]`]))
/** Les jetons propres à chaque thème dans son bloc commun : le voile, le contour et l'aperçu. */
const OWN_SHARED = new Set(["--ui2-scrim", "--esp-surface-border", "--esp-mobilebar-border", "--esp-theme-swatch-1", "--esp-theme-swatch-2", "--esp-theme-swatch-3"])
const GABOMA_SHARED = sharedOf("antsia")

describe("les sept thèmes d'antsia.ga (ADR-0027)", () => {
  it("la liste des thèmes et les fichiers du dossier coïncident ; Gaboma, la charte du réseau, reste le premier", () => {
    expect([...ANTSIA_THEME_IDS]).toEqual(["gaboma", "soleil", "foret", "corail", "lagon", "electrique", "sable"])
    expect(antsiaCharteFor("gaboma")).toBe("antsia")
    const files = readdirSync(new URL(".", import.meta.url)).filter((name) => /^antsia(-[a-z]+)?\.css$/.test(name)).sort()
    expect(files).toEqual(ANTSIA_THEME_IDS.map((id) => `${antsiaCharteFor(id)}.css`).sort())
    for (const id of ANTSIA_THEME_IDS.filter((theme) => theme !== "gaboma")) expect(antsiaCharteFor(id)).toBe(`antsia-${id}`)
    expect(Object.keys(EXPECTED).sort()).toEqual([...ANTSIA_THEME_IDS].sort())
    expect(Object.keys(STATES).sort()).toEqual([...ANTSIA_THEME_IDS].sort())
  })

  it("les toasts suivent chaque thème : la règle de la charte du réseau, étendue aux six autres chartes", () => {
    const globals = read("../../../../apps/antsia_ga/src/app/globals.css")
    const rules = parseRules({ name: "globals.css", css: globals })
    const original = rules.find((rule) => rule.selectors.join(",") === '[data-charte="antsia"] [data-sonner-toaster][data-sonner-theme]')
    const themed = rules.find((rule) => rule.selectors.every((selector) => /^\[data-charte="antsia-[a-z]+"\] \[data-sonner-toaster\]\[data-sonner-theme\]$/.test(selector)))
    expect(original, "règle de la charte du réseau").toBeDefined()
    expect(themed?.selectors.map((selector) => /antsia-([a-z]+)/.exec(selector)?.[1]).sort()).toEqual(ANTSIA_THEME_IDS.filter((id) => id !== "gaboma").sort())
    expect(themed?.declarations).toEqual(original?.declarations)
  })

  it("contours : la base garde chaque filet d'origine ; un thème ANTSIA n'en pose qu'à couleur égale", () => {
    // La base pose `--esp-surface-border: initial` : chaque site retombe sur SON filet historique.
    const base = new TokenCascade(BASE_SHEETS)
    for (const dark of [false, true]) {
      const node: ChartedNode = { charte: "diasporale", dark, nested: false }
      expect(base.resolve(node, "--esp-surface-border")).toBeUndefined()
      expect(base.resolveValue(node, "var(--esp-surface-border, var(--border))")).toBe(base.resolve(node, "--border"))
      expect(base.resolveValue(node, "var(--esp-surface-border, var(--ink-200))")).toBe(base.resolve(node, "--ink-200"))
    }
    for (const id of ANTSIA_THEME_IDS) {
      const charte = antsiaCharteFor(id)
      const themed = new TokenCascade([...BASE_SHEETS, { name: `${charte}.css`, css: read(`./${charte}.css`) }])
      for (const dark of [false, true]) {
        for (const nested of [false, true]) {
          const node: ChartedNode = { charte, dark, nested }
          const same = themed.resolve(node, "--card") === themed.resolve(node, "--background")
          const expected = same ? themed.resolve(node, "--border") : "transparent"
          expect(themed.resolve(node, "--esp-surface-border"), `${charte} ${dark ? "sombre" : "clair"}`).toBe(expected)
          expect(themed.resolve(node, "--esp-mobilebar-border"), `${charte} barre`).toBe(expected)
        }
      }
    }
  })

  it("les sites qui dessinaient un filet de surface lisent le jeton, leur filet d'origine en repli", () => {
    const SITES: readonly (readonly [string, string, number])[] = [
      ["../../../social-features/src/shell/design-styles.ts", "1px solid var(--esp-surface-border, var(--border))", 1],
      ["../../../social-features/src/shell/design-styles.ts", "inset 0 0 0 1px var(--esp-surface-border, transparent)", 1],
      ["../espace-kit/espace-kit-styles.tsx", "border: 1px solid var(--esp-surface-border, var(--border));", 2],
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "border: 1px solid var(--esp-surface-border, var(--ink-200));", 1],
      ["../../../social-features/src/features/stories/stories-styles.tsx", "border: 1px solid var(--esp-surface-border, var(--border));", 1],
      ["../../../../apps/antsia_ga/src/components/shared/controls.tsx", "border-[color:var(--esp-surface-border,var(--border))]", 1],
      ["../../../social-features/src/features/reseau-personnel/ProfileMiniCard.tsx", "1px solid var(--esp-surface-border, var(--ink-200))", 1],
      ["../components/card.tsx", "1px solid var(--esp-surface-border, var(--ink-200))", 1],
    ]
    for (const [path, expression, count] of SITES) expect(read(path).split(expression).length - 1, path).toBe(count)
  })

  it("les états actifs du bureau (rail, Liste/Immersion, filtres et onglets d'iCom) lisent la pastille tonale, leur facture d'origine en repli", () => {
    const ACTIVE_SITES: readonly (readonly [string, string, number])[] = [
      ["../../../social-features/src/shell/ReseauMenuRail.tsx", 'background: "var(--esp-tab-active-bg, var(--ink-0))"', 1],
      ["../../../social-features/src/shell/ReseauMenuRail.tsx", 'border: "1px solid var(--esp-chip-border, var(--primary-500))"', 1],
      ["../../../social-features/src/features/feed-immersion/immersive-styles.tsx", "background: var(--esp-tab-active-bg, var(--primary));", 1],
      ["../../../social-features/src/features/feed-immersion/immersive-styles.tsx", "background: var(--esp-chip-bg, var(--card));", 1],
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "background: var(--esp-tab-active-bg, var(--primary-100));", 2],
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "background: var(--esp-chip-bg, var(--ink-0));", 1],
      ["../../../social-features/src/shell/ReseauAgentPage.tsx", 'background: "var(--esp-header-icon-bg, var(--ink-0))"', 1],
      // Onglet courant de la page iCom et ligne choisie du lanceur d'appel (19/10/2026).
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "background: var(--esp-tab-active-bg, var(--accent)); color: var(--esp-tab-active-fg, var(--accent-foreground));", 1],
      ["../styles/communication.css", "background: var(--esp-tab-active-bg, var(--accent)); color: var(--esp-tab-active-fg, var(--accent-foreground));", 1],
    ]
    for (const [path, expression, count] of ACTIVE_SITES) expect(read(path).split(expression).length - 1, `${path} : ${expression}`).toBe(count)
  })

  it("les pastilles de décompte et les réactions de message lisent les couleurs des réactions, leur facture d'origine en repli", () => {
    const REACT_SITES: readonly (readonly [string, string, number])[] = [
      ["../../../social-features/src/shell/ReseauMenuRail.tsx", 'background: "var(--role-react-fill, var(--primary-50))"', 1],
      ["../../../social-features/src/shell/ReseauDesktopIcomLink.tsx", 'background: "var(--role-react-fill, var(--danger-fill))"', 1],
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "background: var(--role-react-soft, var(--primary-50));", 2],
      // Trois sites : les deux pastilles de décompte, et le point « non écouté » d'un message vocal (IC-02).
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "background: var(--role-react-fill, var(--danger-fill));", 3],
    ]
    for (const [path, expression, count] of REACT_SITES) expect(read(path).split(expression).length - 1, `${path} : ${expression}`).toBe(count)
  })

  it("Écrire dans les appels et le contact d'une boutique lisent les couleurs des messages, leur facture d'origine en repli", () => {
    const MESSAGE_SITES: readonly (readonly [string, string, number])[] = [
      // Scène d'appel : rond et pilule à l'aplat des messages, rendu neutre d'origine (survol compris) en repli.
      ["../styles/communication.css", "background: var(--role-message-fill, color-mix(in srgb, var(--esp-immersive-on-ink) 12%, transparent));", 1],
      ["../styles/communication.css", "background: var(--role-message-fill, color-mix(in srgb, var(--esp-immersive-on-ink) 18%, transparent));", 1],
      ["../styles/communication.css", "background: var(--role-message-fill, color-mix(in srgb, var(--esp-immersive-on-ink) 10%, transparent));", 1],
      ["../styles/communication.css", "background: var(--role-message-fill, color-mix(in srgb, var(--esp-immersive-on-ink) 16%, transparent));", 1],
      ["../styles/communication.css", "color: var(--role-message-on, var(--esp-immersive-on-ink));", 2],
      // Journal d'appels : « Écrire à » en tonal, facture du bouton en repli.
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "background: var(--role-message-soft, var(--card));", 1],
      // antsia.ga : tonal (Poser une question) et aplat (Envoyer la demande).
      ["../../../../apps/antsia_ga/src/components/shared/button-class.ts", "bg-[var(--role-message-soft,var(--card))]", 1],
      ["../../../../apps/antsia_ga/src/components/shared/button-class.ts", "bg-[var(--role-message-fill,var(--primary-fill))]", 1],
    ]
    for (const [path, expression, count] of MESSAGE_SITES) expect(read(path).split(expression).length - 1, `${path} : ${expression}`).toBe(count)
  })

  it("la bannière d'appel entrant, posée sur une carte, garde des ronds lisibles : aplat des messages dans antsia.ga, encre de la carte en repli", () => {
    // Correctif du 19/10/2026 : le rond neutre de la scène sombre (encre claire à 12 %) était blanc
    // sur blanc sur la carte claire de la bannière, partout où `--role-message-fill` est à `initial`.
    const css = read("../styles/communication.css").replace(/\/\*[\s\S]*?\*\//g, "")
    const body = (selector: string) => {
      const start = css.indexOf(`\n  ${selector} {\n`)
      if (start < 0) throw new Error(`communication.css : règle ${selector} absente`)
      const open = css.indexOf("{", start) + 1
      return css.slice(open, css.indexOf("}", open))
    }
    const declaration = (selector: string, property: string) => {
      const value = new RegExp(`\\n\\s*${property}:\\s*([^;]+);`).exec(body(selector))?.[1]
      if (!value) throw new Error(`${selector} : ${property} absent`)
      return value.trim()
    }
    const NEUTRAL = ".iappel-banner .iappel-ctl:not([data-tone])"
    const MESSAGE = '.iappel-banner .iappel-ctl[data-tone="message"]'
    // Seuls le neutre et les messages sont visés : Décrocher et Raccrocher gardent leurs aplats.
    const banner = [...css.matchAll(/\.iappel-banner \.iappel-ctl[^{,]*/g)].map((match) => match[0].trim())
    expect(banner.sort()).toEqual([NEUTRAL, `${NEUTRAL}:hover`, MESSAGE, `${MESSAGE}:hover`].sort())
    // La scène sombre garde son rond d'origine.
    expect(declaration(".iappel-ctl", "background")).toBe("color-mix(in srgb, var(--esp-immersive-on-ink) 12%, transparent)")
    expect(declaration(".iappel-ctl", "color")).toBe("var(--esp-immersive-on-ink)")

    const sheet = (charte: string) => [...BASE_SHEETS, { name: `${charte}.css`, css: read(`./${charte}.css`) }]
    const antsia = ANTSIA_THEME_IDS.map(antsiaCharteFor)
    for (const charte of ["diasporale", "diasporale-gaboma", "admin-antsia", ...antsia]) {
      const cascade = new TokenCascade(sheet(charte))
      for (const dark of [false, true]) {
        for (const nested of [false, true]) {
          const node: ChartedNode = { charte, dark, nested }
          const label = `${charte} ${dark ? "sombre" : "clair"}${nested ? " (portail)" : ""}`
          const paint = (value: string) => {
            const resolved = cascade.resolveValue(node, value)
            const parsed = resolved === undefined ? undefined : parseColor(resolved)
            if (!parsed) throw new Error(`${label} : ${value} ne se résout pas en couleur`)
            return parsed
          }
          const card = paint("var(--card)")
          const messageFill = cascade.resolve(node, "--role-message-fill")
          // DIASPORALE définit désormais aussi ses rôles ; seule la console reste au repli.
          // Une définition ne dispense jamais des contrôles de contraste ci-dessous.
          expect(messageFill === undefined, label).toBe(charte === "admin-antsia")
          if (messageFill !== undefined) expect(cascade.resolveValue(node, declaration(MESSAGE, "background")), label).toBe(messageFill)
          for (const selector of [NEUTRAL, MESSAGE]) {
            const icon = paint(declaration(selector, "color"))
            for (const state of [selector, `${selector}:hover`]) {
              // Icône d'un bouton sans libellé visible : 4,5:1 visé (WCAG 1.4.11 en exige 3).
              const ratio = contrastRatio(icon, paint(declaration(state, "background")), card)
              expect(ratio, `${label} : ${state}`).toBeGreaterThanOrEqual(4.5)
            }
          }
        }
      }
    }
  })

  it("participer (évènement, direct, candidature) prend la couleur de la participation, l'aplat d'identité en repli", () => {
    // Décision du propriétaire du 19/10/2026 : Je participe, Rejoindre la salle, Demander la parole,
    // Candidater et Envoyer ma candidature en variante `commerce` (Acheter, Participer).
    const PARTICIPATION_SITES: readonly (readonly [string, number])[] = [
      ["../../../social-features/src/features/reseau-personnel/EvenementsPanel.tsx", 1],
      ["../../../social-features/src/features/direct/DirectPage.tsx", 1],
      ["../../../social-features/src/features/direct/DirectAntennaPanel.tsx", 1],
      ["../../../../apps/antsia_ga/src/components/jobs/member-shop-jobs-screen.tsx", 1],
      ["../../../../apps/antsia_ga/src/components/jobs/job-application-form.tsx", 1],
    ]
    for (const [path, count] of PARTICIPATION_SITES) expect(read(path).split('variant="commerce"').length - 1, path).toBe(count)
  })

  it("Valider et Supprimer : les aplats lisent la couleur de leur fonction et son texte, leur facture d'origine en repli", () => {
    const STATE_SITES: readonly (readonly [string, string, number])[] = [
      ["../components/button.tsx", 'color: "var(--role-danger-on, var(--on-fill))"', 1],
      ["../components/button.tsx", 'color: "var(--role-success-on, var(--on-fill))"', 1],
      ["../components/form.tsx", "var(--role-danger-ink, var(--danger-500))", 2],
      ["../styles/communication.css", "background: var(--role-danger-fill, var(--destructive));", 2],
      ["../styles/communication.css", "color: var(--role-danger-on, var(--background));", 1],
      ["../styles/communication.css", "color: var(--role-danger-on, var(--destructive-foreground));", 1],
      ["../styles/communication.css", "background: var(--role-success-fill, var(--success));", 1],
      ["../styles/communication.css", "color: var(--role-success-on, var(--on-fill, var(--esp-immersive-on-ink)));", 1],
      ["../../../social-features/src/features/iappel/CallWaitingChip.tsx", 'background: "var(--role-danger-fill, var(--destructive))"', 1],
      ["../../../social-features/src/features/iappel/CallMinimizedPill.tsx", 'background: "var(--role-danger-fill, var(--destructive))"', 1],
      ["../../../social-features/src/features/iappel/CallMinimizedPill.tsx", 'background: "var(--role-success-fill, var(--success))"', 1],
      ["../../../social-features/src/features/iappel/HeldCallChips.tsx", 'background: "var(--role-danger-fill, var(--destructive))"', 1],
      ["../../../social-features/src/features/iappel/HeldCallChips.tsx", 'background: "var(--role-success-fill, var(--success))"', 1],
    ]
    for (const [path, expression, count] of STATE_SITES) expect(read(path).split(expression).length - 1, `${path} : ${expression}`).toBe(count)
    // Plus aucun aplat de succès ou de danger peint directement avec l'encre.
    for (const path of ["../styles/communication.css", "../../../social-features/src/features/iappel/CallWaitingChip.tsx", "../../../social-features/src/features/iappel/CallMinimizedPill.tsx", "../../../social-features/src/features/iappel/HeldCallChips.tsx"]) {
      expect(read(path), path).not.toMatch(/background: "?var\(--(destructive|success)\)/)
    }
  })

  it("aplats d'identité : les sites qui peignaient l'encre en fond lisent l'aplat et son texte, l'encre d'origine en repli", () => {
    const IDENTITY_SITES: readonly (readonly [string, string, number])[] = [
      ["../../../social-features/src/features/feed-immersion/immersive-styles.tsx", "background: var(--esp-identity-fill, var(--primary));", 1],
      ["../../../social-features/src/features/feed-immersion/immersive-styles.tsx", "color: var(--primary-fill-on, var(--primary-foreground));", 1],
      ["../styles/communication.css", "background: var(--esp-identity-fill, var(--primary));", 2],
      ["../styles/communication.css", "color: var(--primary-fill-on, var(--primary-foreground));", 2],
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "background: var(--esp-identity-fill, var(--primary-600));", 1],
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "background: var(--esp-identity-fill-hover, var(--primary-700));", 1],
      // Bouton d'enregistrement vocal : aplat de danger, texte de Supprimer.
      ["../../../social-features/src/features/messagerie/messagerie-styles.tsx", "color: var(--role-danger-on, var(--on-fill));", 1],
      // Interrupteur : le curseur prend le texte de l'aplat quand il est posé dessus.
      ["../components/form.tsx", 'background: checked ? "var(--primary-fill-on, var(--on-fill))" : "var(--on-fill)"', 1],
      // Case cochée : la coche prend le texte de l'aplat.
      ["../components/form.tsx", 'style={{ color: "var(--primary-fill-on, var(--on-fill))" }}', 1],
    ]
    for (const [path, expression, count] of IDENTITY_SITES) expect(read(path).split(expression).length - 1, `${path} : ${expression}`).toBe(count)
  })

  it("aucun aplat d'identité ne porte le texte commun `--on-fill` : le texte de l'aplat (`--primary-fill-on`), repli `--on-fill`", () => {
    // Le texte commun est blanc en clair : illisible sur la mandarine, le rose corail ou le turquoise.
    const roots = [new URL("../../../", import.meta.url), new URL("../../../../apps/", import.meta.url)]
    const offenders: string[] = []
    const walk = (dir: URL) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
        const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir)
        if (entry.isDirectory()) walk(url)
        else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const text = readFileSync(url, "utf8")
          if (/background:\s*"?var\(--primary-fill\)"?[;,]?\s*\n\s*color:\s*"?var\(--on-fill\)/.test(text)) offenders.push(url.pathname.split("/ECOSYSTEMES/ANTSIA/")[1] ?? url.pathname)
        }
      }
    }
    for (const root of roots) walk(root)
    expect(offenders).toEqual([])
  })

  it("le contrat de la base laisse DIASPORALE intact : chaque jeton du système épuré est à `initial`", () => {
    const base = new TokenCascade(BASE_SHEETS)
    const tokens = [...Object.keys(ANGLES).filter((token) => token !== "--rp-surface-radius"), "--primary-fill-on", "--esp-theme-swatch-1",
      "--ui2-button-outline-bg", "--ui2-button-outline-border", "--ui2-button-secondary-bg", "--ui2-button-secondary-border", "--ui2-button-secondary-fg",
      "--esp-chip-bg", "--esp-chip-border", "--esp-header-icon-bg", "--esp-story-ring-fill", "--esp-fab-shadow", "--esp-tab-active-bg", "--esp-tab-active-fg",
      ...["social", "message", "react", "commerce"].flatMap((role) => [`--role-${role}-fill`, `--role-${role}-on`, `--role-${role}-ink`]),
      ...["success", "danger"].flatMap((role) => [`--role-${role}-fill`, `--role-${role}-on`, `--role-${role}-ink`]),
      "--esp-identity-fill", "--esp-identity-fill-hover",
      "--role-message-soft", "--role-react-soft", "--role-react-label"]
    for (const dark of [false, true]) {
      for (const token of tokens) expect(base.resolve({ charte: "diasporale", dark, nested: false }, token), token).toBeUndefined()
    }
  })

  for (const id of ANTSIA_THEME_IDS) {
    const charte = antsiaCharteFor(id)
    const expected = EXPECTED[id]
    if (!expected) throw new Error(`${id} : couleurs attendues absentes du tableau EXPECTED`)
    const css = read(`./${charte}.css`)
    const cascade = new TokenCascade([...BASE_SHEETS, { name: `${charte}.css`, css }])
    const node = (mode: Mode, nested = false): ChartedNode => ({ charte, dark: mode === "sombre", nested })
    const value = (mode: Mode, token: string, nested = false) => {
      const resolved = cascade.resolve(node(mode, nested), token)
      if (resolved === undefined) throw new Error(`${charte} : ${token} ne se résout pas en ${mode}`)
      return resolved
    }
    const color = (mode: Mode, token: string, nested = false): Rgba => {
      const parsed = parseColor(value(mode, token, nested))
      if (!parsed) throw new Error(`${charte} : ${token} n'est pas une couleur en ${mode}`)
      return parsed
    }
    const ratio = (mode: Mode, foreground: string, background: string) =>
      contrastRatio(color(mode, foreground), color(mode, background), color(mode, "--background"))
    const luminance = (mode: Mode, token: string) => relativeLuminance(color(mode, token))

    const LIGHT = [`[data-charte="${charte}"]`]
    const DARK = [`.dark[data-charte="${charte}"]`, `.dark [data-charte="${charte}"]`]
    const BOTH = [...LIGHT, ...DARK]

    describe(`thème ${id}`, () => {
      it("trois blocs, sans recouvrement ; le bloc commun est celui de Gaboma, à ses jetons propres près", () => {
        expect(parseRules({ name: charte, css }).map((rule) => rule.selectors)).toEqual([LIGHT, DARK, BOTH])
        const [light, dark, both] = [LIGHT, DARK, BOTH].map((selectors) => new Set(declarationsOf(css, selectors).map(([token]) => token)))
        expect([...both!].filter((token) => light!.has(token) || dark!.has(token))).toEqual([])
        const shared = sharedOf(charte)
        expect([...shared.keys()].sort()).toEqual([...GABOMA_SHARED.keys()].sort())
        for (const [token, gaboma] of GABOMA_SHARED) {
          if (OWN_SHARED.has(token)) continue
          expect(shared.get(token), token).toBe(gaboma)
        }
      })

      it("le sombre redéclare chaque rôle du bloc sombre de la base, sauf les héritages de la charte du réseau", () => {
        const baseDark = parseRules({ name: "charte.css", css: BASE }).find((rule) => rule.condition === null && rule.selectors.join("|") === ".dark[data-charte]|.dark [data-charte]")
        const covered = new Set([...declarationsOf(css, DARK), ...declarationsOf(css, BOTH)].map(([token]) => token))
        const missing = [...new Set(baseDark?.declarations.map((declaration) => declaration.token))].filter((token) => !covered.has(token))
        expect(missing.sort()).toEqual([...INHERITED_IN_DARK].sort())
      })

      it("l'aperçu montre les trois couleurs retenues, dans les deux modes", () => {
        for (const mode of MODES) {
          expect(["--esp-theme-swatch-1", "--esp-theme-swatch-2", "--esp-theme-swatch-3"].map((token) => toHex(color(mode, token)))).toEqual(expected.nuancier)
        }
      })

      for (const mode of MODES) {
        describe(mode, () => {
          it("identité : une encre en texte, un aplat pour les boutons, partout la même", () => {
            for (const nested of [false, true]) {
              for (const token of ["--primary", "--accent", "--ring", "--sidebar-primary", "--status-active", "--info-500"]) {
                expect(toHex(color(mode, token, nested)), `${token}${nested ? " (portail)" : ""}`).toBe(expected.encre[at(mode)])
              }
              expect(toHex(color(mode, "--primary-fill", nested)), `--primary-fill${nested ? " (portail)" : ""}`).toBe(expected.aplat[at(mode)])
            }
          })

          it("Valider et Supprimer : aplat, texte sur l'aplat et encre des chartes ; le succès et le danger se lisent en encre", () => {
            const states = STATES[id]?.[mode]
            if (!states) throw new Error(`${id} : couleurs de Valider et Supprimer absentes de STATES`)
            for (const nested of [false, true]) {
              for (const role of ["success", "danger"] as const) {
                const [fill, on, ink] = states[role]
                const label = `${role}${nested ? " (portail)" : ""}`
                expect(toHex(color(mode, `--role-${role}-fill`, nested)), `${label} aplat`).toBe(fill)
                expect(toHex(color(mode, `--role-${role}-on`, nested)), `${label} texte sur l'aplat`).toBe(on)
                expect(toHex(color(mode, `--role-${role}-ink`, nested)), `${label} encre`).toBe(ink)
              }
              expect(toHex(color(mode, "--success-fill", nested))).toBe(states.success[0])
              expect(toHex(color(mode, "--danger-fill", nested))).toBe(states.danger[0])
              expect(toHex(color(mode, "--success", nested))).toBe(states.success[2])
              expect(toHex(color(mode, "--destructive", nested))).toBe(states.danger[2])
            }
          })

          it("chaque fonction a sa couleur, et chacune vient des trois couleurs du thème", () => {
            const swatches = new Set(expected.nuancier)
            if (mode === "clair") {
              for (const token of ["--primary-fill", "--role-social-fill", "--role-message-fill", "--role-react-fill", "--role-commerce-fill"]) {
                expect(swatches.has(toHex(color(mode, token))), token).toBe(true)
              }
            }
            const used = new Set(["--primary-fill", "--role-social-fill", "--role-message-fill", "--role-react-fill", "--role-commerce-fill"].map((token) => toHex(color(mode, token))))
            expect(used.size, "au moins trois couleurs distinctes").toBeGreaterThanOrEqual(mode === "clair" ? 3 : 2)
          })

          it("fonds neutres : blanc, gris très clair ou beige clair ; noir ou gris sombre", () => {
            for (const token of ["--background", "--card", "--popover", "--muted"]) {
              expect(chroma(color(mode, token)), token).toBeLessThanOrEqual(NEUTRAL_CHROMA)
            }
            if (mode === "clair") expect(luminance(mode, "--background")).toBeGreaterThanOrEqual(0.82)
            else expect(luminance(mode, "--background")).toBeLessThanOrEqual(0.02)
          })

          it.each(TEXT_PAIRS)("texte %s sur %s ≥ 4,5:1", (foreground, background) => {
            expect(ratio(mode, foreground, background)).toBeGreaterThanOrEqual(4.5)
          })

          it.each(NON_TEXT_PAIRS)("contour %s sur %s ≥ 3:1", (foreground, background) => {
            expect(ratio(mode, foreground, background)).toBeGreaterThanOrEqual(3)
          })

          it("titre de la couverture de repli lisible sur chaque arrêt du dégradé", () => {
            const stops = gradientStops(value(mode, "--esp-banner"))
            expect(stops).toHaveLength(2)
            for (const stop of stops) expect(contrastRatio(color(mode, "--esp-on-banner"), stop)).toBeGreaterThanOrEqual(4.5)
          })

          it("barre flottante translucide : libellés lisibles sur le fond qui défile", () => {
            const bar = color(mode, "--esp-mobilebar-bg")
            for (const label of ["--foreground", "--muted-foreground", "--primary"]) {
              expect(contrastRatio(color(mode, label), bar, color(mode, "--background")), label).toBeGreaterThanOrEqual(4.5)
            }
          })

          it("un portail qui redéclare la charte résout exactement les jetons de <html>", () => {
            expect(cascade.resolveAll(node(mode, true))).toEqual(cascade.resolveAll(node(mode)))
          })

          it("un angle par élément, identique dans tous les thèmes", () => {
            for (const [token, radius] of Object.entries(ANGLES)) expect(value(mode, token), token).toBe(radius)
          })
        })
      }

      it("clair : les cartes et le creux se distinguent du fond, ou la carte garde son filet", () => {
        const same = value("clair", "--card") === value("clair", "--background")
        if (!same) expect(ratio("clair", "--card", "--background")).toBeGreaterThanOrEqual(1.04)
        expect(ratio("clair", "--muted", "--card")).toBeGreaterThanOrEqual(1.04)
        expect(ratio("clair", "--primary-50", "--card")).toBeGreaterThanOrEqual(1.1)
      })

      it("sombre : creux, surface élevée et sélection au-dessus de la carte", () => {
        expect(luminance("sombre", "--card")).toBeGreaterThanOrEqual(luminance("sombre", "--background"))
        expect(luminance("sombre", "--popover")).toBeGreaterThan(luminance("sombre", "--card"))
        expect(luminance("sombre", "--muted")).toBeGreaterThan(luminance("sombre", "--card"))
        expect(luminance("sombre", "--primary-50")).toBeGreaterThan(luminance("sombre", "--popover"))
        expect(ratio("sombre", "--primary-50", "--card")).toBeGreaterThanOrEqual(1.2)
      })

      it("géométrie, polices et liens soulignés de la charte du réseau ; aucune ressource externe", () => {
        const network = new TokenCascade([...BASE_SHEETS, { name: "antsia.css", css: read("./antsia.css") }])
        for (const mode of MODES) {
          for (const token of ["--radius-xl", "--rp-surface-radius", "--body-font-size", "--font-sans", "--font-display", "--esp-inline-link-decoration", "--esp-sticky-header-inset"]) {
            expect(value(mode, token), `${mode} ${token}`).toBe(network.resolve({ charte: "antsia", dark: mode === "sombre", nested: false }, token))
          }
        }
        expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/@import|@font-face|url\(|prefers-color-scheme/)
      })

      it("voile des surfaces superposées : l'encre du thème à 55 %", () => {
        const ink = color("clair", "--foreground")
        for (const mode of MODES) {
          const scrim = color(mode, "--ui2-scrim")
          expect(toHex({ ...scrim, a: 1 }), mode).toBe(toHex(ink))
          expect(scrim.a, mode).toBeCloseTo(0.55, 5)
        }
      })
    })
  }
})
