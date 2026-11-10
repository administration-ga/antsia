// @vitest-environment node
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Badge } from "../components/badge"
import { Alert } from "../components/alert"
import { Button } from "../components/button"
import { Card } from "../components/card"
import { Select, TextArea, TextInput } from "../components/form"
import { Table } from "../components/table"
import { EspaceCard } from "../espace-kit/EspaceCard"
import { EspaceKitStyles } from "../espace-kit/espace-kit-styles"
import { type ChartedNode, parseRules, TokenCascade } from "../tests/css-token-cascade"
import { ANTSIA_THEME_IDS, antsiaCharteFor } from "./antsia-themes"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const base = ["theme", "charte", "communication"].map((name) => ({ name, css: read(`../styles/${name}.css`) }))
// TokenCascade modélise le bureau ; rejouer les vraies déclarations mobiles séparément
// maintient la garantie tactile à 44 px malgré les cibles de bureau plus compactes.
const touchRule = parseRules({ name: "charte", css: read("../styles/charte.css") })
  .find((rule) => rule.condition === "@media (max-width: 1023px)" && rule.selectors.join() === "[data-charte]")
if (!touchRule) throw new Error("plancher tactile de la charte absent")
const touchSheet = { name: "plancher tactile", css: `[data-charte] { ${touchRule.declarations.map(({ token, value }) => `${token}: ${value};`).join(" ")} }` }
const styleOf = (markup: string, tag: string) => {
  const style = new RegExp(`<${tag}\\b[^>]* style="([^"]+)"`).exec(markup)?.[1]
  if (!style) throw new Error(`style absent sur ${tag}`)
  return new Map(style.split(";").filter(Boolean).map((declaration) => {
    const colon = declaration.indexOf(":")
    return [declaration.slice(0, colon), declaration.slice(colon + 1)] as const
  }))
}
const card = styleOf(renderToStaticMarkup(<Card>Contenu</Card>), "div")
const spaceCard = renderToStaticMarkup(<EspaceCard title="Titre" count={2}>Contenu</EspaceCard>)
const fields = [
  styleOf(renderToStaticMarkup(<TextInput aria-label="Nom" />), "input"),
  styleOf(renderToStaticMarkup(<TextArea aria-label="Description" />), "textarea"),
  styleOf(renderToStaticMarkup(<Select aria-label="Choix"><option>Option</option></Select>), "select"),
]
const cancel = styleOf(renderToStaticMarkup(<Button variant="outline" size="sm">Annuler</Button>), "button")
const link = styleOf(renderToStaticMarkup(<Button variant="link">Ouvrir</Button>), "button")
const badge = styleOf(renderToStaticMarkup(<Badge>État</Badge>), "span")
const alert = styleOf(renderToStaticMarkup(<Alert>Information</Alert>), "div")
const table = styleOf(renderToStaticMarkup(<Table><tbody><tr><td>Valeur</td></tr></tbody></Table>), "div")
const kit = renderToStaticMarkup(<EspaceKitStyles />).replace(/\/\*[\s\S]*?\*\//g, "")
const declarationOf = (selector: string, property: string) => {
  const start = kit.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`sélecteur absent : ${selector}`)
  const open = kit.indexOf("{", start) + 1
  const body = kit.slice(open, kit.indexOf("}", open))
  const declaration = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(body)?.[1]
  if (!declaration) throw new Error(`${selector} : propriété absente ${property}`)
  return declaration
}
const resolved = (cascade: TokenCascade, node: ChartedNode, styles: Map<string, string>, property: string) => {
  const expression = styles.get(property)
  if (!expression) throw new Error(`propriété absente : ${property}`)
  return cascade.resolveValue(node, expression)
}

describe("système commun réellement consommé par les primitives (ADR-0027)", () => {
  for (const id of ANTSIA_THEME_IDS) {
    const charte = antsiaCharteFor(id)
    const cascade = new TokenCascade([...base, { name: charte, css: read(`./${charte}.css`) }])
    for (const dark of [false, true]) {
      for (const nested of [false, true]) {
        const node: ChartedNode = { charte, dark, nested }
        const label = `${id} ${dark ? "sombre" : "clair"}${nested ? " portail" : ""}`

        it(`${label} : carte 16 px, géométrie et profondeur historiques du kit en repli`, () => {
          expect(resolved(cascade, node, card, "border-radius")).toBe("16px")
          expect(resolved(cascade, node, card, "padding")).toBe("24px")
          expect(resolved(cascade, node, card, "box-shadow")).toBe(cascade.resolve(node, "--shadow-xs"))
          expect(resolved(cascade, node, styleOf(spaceCard, "div"), "border-radius")).toBe("18px")
          expect(resolved(cascade, node, styleOf(spaceCard, "section"), "padding")).toBe("18px 20px")
          expect(resolved(cascade, node, table, "border-radius")).toBe("8px")
          for (const field of fields) expect(resolved(cascade, node, field, "border-radius")).toBe("6px")
          expect(cascade.resolveValue(node, declarationOf(".esk-card-head", "margin-bottom"))).toBe("12px")
          expect(resolved(cascade, node, alert, "border-radius")).toBe("6px")
          expect(resolved(cascade, node, alert, "padding")).toBe("12px 16px")
          expect(resolved(cascade, node, alert, "border")).toBe(`1px solid ${cascade.resolve(node, "--primary-300")}`)
          expect(resolved(cascade, node, alert, "border-left")).toBe(`4px solid ${cascade.resolve(node, "--primary-300")}`)
        })

        it(`${label} : Annuler gris plein, boutons pilule et cibles bureau et tactiles`, () => {
          expect(resolved(cascade, node, cancel, "border-radius")).toBe("999px")
          expect(resolved(cascade, node, cancel, "background")).toBe(cascade.resolve(node, "--muted"))
          expect(resolved(cascade, node, cancel, "border")).toBe("1px solid transparent")
          expect(resolved(cascade, node, cancel, "min-height")).toBe("32px")
          expect(resolved(cascade, node, link, "min-height")).toBe("auto")
          expect(resolved(cascade, node, fields[0]!, "min-height")).toBe("38px")
          const touch = new TokenCascade([...base, touchSheet, { name: charte, css: read(`./${charte}.css`) }])
          for (const styles of [cancel, link, fields[0]!]) expect(resolved(touch, node, styles, "min-height")).toBe("44px")
          expect(resolved(touch, node, card, "padding")).toBe("16px")
          expect(resolved(cascade, node, badge, "border-radius")).toBe("6px")
        })

        it(`${label} : le kit suit les surfaces et la géométrie des chartes`, () => {
          const css = (selector: string, property: string) => cascade.resolveValue(node, declarationOf(selector, property))
          for (const selector of [".esk-card", ".esk-strip", ".esk-tabpanel", ".esk-empty", ".esk-dialog"]) {
            expect(css(selector, "border-radius"), selector).toBe("18px")
          }
          for (const [selector, padding] of [[".esk-strip", "16px 18px"], [".esk-tabpanel", "20px 24px 24px"], [".esk-empty", "24px"], [".esk-dialog-body", "16px 20px"]] as const) {
            expect(css(selector, "padding"), selector).toBe(padding)
          }
          expect(css(".esk-count", "border-radius")).toBe("999px")
          expect(css(".esk-btn", "border-radius")).toBe("11px")
          expect(css(".esk-btn", "min-height")).toBe("38px")
          expect(css(".esk-btn", "background")).toBe(cascade.resolve(node, "--card"))
          expect(css(".esk-dialog-close", "width")).toBe("32px")
          expect(css(".esk-dialog", "border")).toBe(`1px solid ${cascade.resolve(node, "--border")}`)
          const border = cascade.resolve(node, "--card") === cascade.resolve(node, "--background")
            ? cascade.resolve(node, "--border") : "transparent"
          expect(css(".esk-card", "border")).toBe(`1px solid ${border}`)
          expect(css('.esk-tab[aria-selected="true"]', "background")).toBe(cascade.resolve(node, "--esp-surface-card"))
          expect(css('.esk-tab[aria-selected="true"]', "color")).toBe(cascade.resolve(node, "--ink-900"))
        })
      }
    }
  }

  for (const charte of ["diasporale", "admin-antsia"]) {
    const cascade = new TokenCascade([...base, { name: charte, css: read(`./${charte}.css`) }])
    for (const dark of [false, true]) {
      it(`${charte} ${dark ? "sombre" : "clair"} : les primitives gardent leur géométrie historique`, () => {
        const node: ChartedNode = { charte, dark, nested: false }
        expect(resolved(cascade, node, card, "padding")).toBe("24px")
        expect(resolved(cascade, node, card, "box-shadow")).toBe(cascade.resolve(node, "--shadow-xs"))
        expect(resolved(cascade, node, styleOf(spaceCard, "div"), "border-radius")).toBe("18px")
        expect(resolved(cascade, node, styleOf(spaceCard, "div"), "border")).toBe(`1px solid ${cascade.resolve(node, "--border")}`)
        expect(resolved(cascade, node, styleOf(spaceCard, "section"), "padding")).toBe("18px 20px")
        for (const field of fields) expect(resolved(cascade, node, field, "border-radius")).toBe("6px")
        expect(resolved(cascade, node, table, "border-radius")).toBe("8px")
        expect(resolved(cascade, node, alert, "border-radius")).toBe("6px")
        expect(resolved(cascade, node, alert, "padding")).toBe("12px 16px")
        expect(resolved(cascade, node, alert, "border-left")).toBe(`4px solid ${cascade.resolve(node, "--primary-300")}`)
        expect(cascade.resolveValue(node, declarationOf(".esk-dialog-close", "width"))).toBe("32px")
        expect(cascade.resolveValue(node, declarationOf(".esk-btn", "min-height"))).toBe("38px")
        expect(cascade.resolveValue(node, declarationOf(".esk-strip", "border"))).toBe(`1px solid ${cascade.resolve(node, "--border")}`)
        expect(cascade.resolveValue(node, declarationOf(".esk-tabpanel", "padding"))).toBe("20px 24px 24px")
        expect(cascade.resolveValue(node, declarationOf('.esk-tab[aria-selected="true"]', "background"))).toBe(cascade.resolve(node, "--esp-surface-card"))
      })
    }
  }
})
