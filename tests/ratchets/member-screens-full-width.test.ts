/**
 * Pleine largeur des écrans de membre (décisions du propriétaire du 22/10/2026 : « le design doit être
 * uniforme, s'adapter à tous les formats (responsive) et les écarts cohérents. en plein largeur. »). Aucun
 * écran de l'application ne se borne puis se centre dans sa colonne (`mx-auto` et `max-w-*` dans une même
 * chaîne de classes) ; en grande largeur, ses sections et ses champs se rangent en colonnes responsives
 * (`components/shared/screen-layout.ts`). Ne gardent une largeur bornée et centrée que les surfaces qui ne
 * sont pas un écran de membre, nommées ici avec leur raison.
 */
import { describe, expect, it } from "vitest"

import { type Finding, formatFindings, isTestFile, listFiles, readRepoFile } from "./lib/source-files"

const APP = "apps/antsia_ga/src"

/** Ce qui garde une largeur bornée et centrée, et pourquoi. */
const ALLOWED: Readonly<Record<string, string>> = {
  [`${APP}/components/access-home-screen.tsx`]: "accueil public, visiteurs sans compte",
  [`${APP}/components/public/public-shell.tsx`]: "coque publique, visiteurs sans compte",
  [`${APP}/components/public/public-routes.tsx`]: "pages publiques",
  [`${APP}/components/public/public-home-preview.tsx`]: "aperçu d'accueil public conservé localement, hors du cadre de membre",
  [`${APP}/components/public/public-legal.tsx`]: "page publique légale",
  [`${APP}/components/shops/catalog-public-route.tsx`]: "catalogue public",
  [`${APP}/components/shops/public-storefront-card.tsx`]: "vitrine publique",
  [`${APP}/components/services/provider-public-route.tsx`]: "présentation publique d'un prestataire",
  [`${APP}/components/jobs/job-public-route.tsx`]: "offre d'emploi publique",
  [`${APP}/components/professionals/public-profile-route.tsx`]: "fiche pro publique",
  [`${APP}/components/editorial/public-routes.tsx`]: "lecture publique d'un article",
  [`${APP}/components/editorial/site-content.tsx`]: "article à la largeur de lecture (76ch) ; la une ne se borne que pour la page publique",
  [`${APP}/components/editorial/article-social-actions.tsx`]: "actions alignées sur la colonne de lecture de l'article (76ch)",
  [`${APP}/components/editorial/editorial-fields.tsx`]: "aperçu d'article à la largeur de lecture",
  [`${APP}/components/member-chrome.tsx`]: "coque des réseaux sans navigation par destinations",
  [`${APP}/components/feed/feed-screen.tsx`]: "filtre invalide dans la coque sans destinations",
  [`${APP}/components/welcome-screen.tsx`]: "accueil d'un nouveau compte, hors du cadre de membre",
  [`${APP}/components/notification-open-screen.tsx`]: "carte d'état transitoire à l'ouverture d'une notification",
  [`${APP}/components/providers.tsx`]: "écran d'erreur hors du cadre",
  [`${APP}/components/session-bridge.tsx`]: "état de passage de session",
  [`${APP}/components/personal-controls.tsx`]: "page autonome des données personnelles, hors du cadre de membre",
  [`${APP}/app/sante-fonctionnelle/page.tsx`]: "page d'exploitation",
}

/** Les chaînes de classes qui bornent et centrent : `mx-auto` et `max-w-*`, avec ou sans variante. */
function detectCenteredWidths(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  for (const match of text.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)) {
    const tokens = match[2]!.split(/\s+/u)
    const widths = tokens.filter(token => /(?:^|:)max-w-/u.test(token))
    if (!widths.length || !tokens.some(token => /(?:^|:)mx-auto$/u.test(token))) continue
    findings.push({ file, line: text.slice(0, match.index).split("\n").length, message: `largeur bornée et centrée : ${widths.join(" ")}` })
  }
  return findings
}

describe("member-screens-full-width — les écrans de membre occupent toute leur colonne", () => {
  const findings = listFiles([APP], [".ts", ".tsx"]).filter(file => !isTestFile(file)).flatMap(file => detectCenteredWidths(file, readRepoFile(file)))

  it("aucun écran de membre ne se borne puis se centre", () => {
    const outside = findings.filter(finding => !(finding.file in ALLOWED))
    expect(outside, formatFindings(outside)).toEqual([])
  })

  it("chaque exception sert encore (la liste ne garde rien de périmé)", () => {
    const used = new Set(findings.map(finding => finding.file))
    expect(Object.keys(ALLOWED).filter(file => !used.has(file))).toEqual([])
  })

  it("les colonnes responsives partagées : 32rem par section, 16rem par champ, écart sur la gouttière", () => {
    const layout = readRepoFile(`${APP}/components/shared/screen-layout.ts`)
    expect(layout).toMatch(/SCREEN_SECTIONS = "[^"]*grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,32rem\),1fr\)\)\][^"]*gap-x-gutter/u)
    expect(layout).toMatch(/FORM_FIELDS = "[^"]*grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,16rem\),1fr\)\)\][^"]*gap-x-gutter/u)
    expect(layout).toMatch(/SCREEN_SUBMIT = "min-\[768px\]:\[&_form_button\[type=submit\]\]:justify-self-start"/u)
  })

  it("test du test : classes littérales, variantes et gabarits", () => {
    const source = [
      '<div className="mx-auto flex max-w-3xl flex-col" />',
      '<div className="max-w-full rounded-lg" />',
      "<div className={`grid ${reading ? \" mx-auto max-w-5xl\" : \"\"}`} />",
      '<p className="mx-auto mt-4 max-w-xs sm:max-w-md" />',
      '<div className="mx-auto w-full" />',
    ].join("\n")
    expect([...new Set(detectCenteredWidths(`${APP}/x.tsx`, source).map(finding => finding.line))]).toEqual([1, 3, 4])
  })
})
