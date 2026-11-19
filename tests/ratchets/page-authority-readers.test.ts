/**
 * page-authority-readers — CE QU'IL INTERDIT (AS-10 / PG-08, décision du 19/11/2026) : qu'un
 * fichier du moteur ouvre au MODÉRATEUR d'une page un droit de ses signataires sans qu'on l'ait
 * décidé. L'équipe d'une page compte trois rôles (`admin`, `signatory`, `moderator`) ; seuls les
 * deux premiers parlent au nom de la page.
 *
 *  · `livePageTeamRole` et `requirePageTeam` (`convex/modules/pages/access.ts`) VOIENT le
 *    modérateur : leurs lecteurs forment une LISTE BLANCHE (`TEAM_READERS`), chacun pour un droit
 *    de toute l'équipe (voir l'équipe, se retirer, lire une note aux abonnés, retirer un
 *    commentaire, être partie liée en modération). En ajouter un est une décision : la ligne
 *    se déclare ici, avec sa raison.
 *  · `liveSignatoryRole` ne rend jamais un modérateur (défaut fermé) : l'inventaire de ses
 *    lecteurs est FIGÉ (`SIGNATORY_READERS`), pour qu'un nouveau lecteur soit relu — sa polarité
 *    (`=== null` refuse : autorité ; `!== null` refuse : partie liée) dit s'il doit rester fermé
 *    au modérateur ou passer au lecteur d'équipe.
 *  · une lecture DIRECTE de la table `pageSignatories` (`.query("pageSignatories")`) voit toutes
 *    les lignes, modérateurs compris : l'inventaire en est FIGÉ (`DIRECT_TABLE_READERS`) ; une
 *    lecture neuve filtre le rôle ou relit un lecteur vivant.
 *
 * COMMENT IL LIT : par l'arbre syntaxique des fichiers du moteur hors tests — toute référence à
 * l'identifiant (appel, passage en argument, alias), hors de sa déclaration et des imports ; tout
 * appel `….query("pageSignatories")`. Les commentaires ne comptent pas.
 */
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { isTestFile, listFiles, parseSource, readRepoFile, walk } from "./lib/source-files"

/** Le module qui DÉFINIT les lecteurs de rôle (il se lit lui-même). */
const DEFINER = "convex/modules/pages/access.ts"

/** Les lecteurs du rôle d'ÉQUIPE (modérateur compris), et le droit de toute l'équipe que chacun ouvre. */
const TEAM_READERS: Record<string, string> = {
  "convex/modules/pages/signatories.ts": "voir l'équipe et s'en retirer, quel que soit son rôle",
  "convex/modules/pages/pages.ts": "`viewer.teamRole` de la fiche et « Mes pages » de l'équipe (`myTeamPages`)",
  "convex/modules/posts/access.ts": "lire une note réservée aux abonnés de la page",
  "convex/modules/engagement/engagement.ts": "retirer un commentaire sous une publication de la page (`commentRemovalRight`)",
  "convex/modules/moderation/cases.ts": "partie liée : ne tranche pas un dossier du contenu de sa page",
  "convex/modules/moderation/moderation.ts": "partie liée : ne tranche pas le dossier d'une publication de sa page",
  "convex/modules/diaspora/moderationDesk.ts": "partie liée : le bureau de modération annonce le conflit (« page »)",
}

/** Inventaire figé des lecteurs de `liveSignatoryRole` au 19/11/2026 (décision AS-10). */
const SIGNATORY_READERS = [
  "convex/modules/commercialMessaging/access.ts",
  "convex/modules/commercialMessaging/team.ts",
  "convex/modules/contextualMessaging/access.ts",
  "convex/modules/contextualMessaging/threads.ts",
  "convex/modules/diaspora/arrivalKit.ts",
  "convex/modules/diaspora/associationGroups.ts",
  "convex/modules/diaspora/associations.ts",
  "convex/modules/diaspora/communityNotifications.ts",
  "convex/modules/diaspora/facts.ts",
  "convex/modules/diaspora/hubPages.ts",
  "convex/modules/diaspora/jobs.ts",
  "convex/modules/diaspora/moderationTargets.ts",
  "convex/modules/diaspora/mutualAid.ts",
  "convex/modules/diaspora/serviceNotifications.ts",
  "convex/modules/diaspora/serviceRequests.ts",
  "convex/modules/diaspora/serviceReviews.ts",
  "convex/modules/diaspora/services.ts",
  "convex/modules/editorial/access.ts",
  "convex/modules/events/pageEventAccess.ts",
  "convex/modules/live/access.ts",
  "convex/modules/moderation/cases.ts",
  "convex/modules/moderation/targets.ts",
  "convex/modules/notifications/policy.ts",
  "convex/modules/notifications/targets.ts",
  "convex/modules/pages/access.ts",
  "convex/modules/pages/admin.ts",
  "convex/modules/pages/claims.ts",
  "convex/modules/pages/closedByBlocks.ts",
  "convex/modules/pages/pages.ts",
  "convex/modules/posts/authorModeration.ts",
  "convex/modules/posts/feedPolicy.ts",
  "convex/modules/posts/postWrite.ts",
  "convex/modules/posts/posts.ts",
  "convex/modules/professionals/read.ts",
  "convex/modules/shops/access.ts",
  "convex/modules/shops/catalogRead.ts",
  "convex/modules/shops/demoCatalog.ts",
  "convex/modules/shops/jobRead.ts",
  "convex/modules/shops/shops.ts",
  "convex/modules/thematicGroups/access.ts",
]

/** Inventaire figé des lectures directes de la table `pageSignatories` au 19/11/2026. */
const DIRECT_TABLE_READERS = [
  "convex/modules/diaspora/arrivalKit.ts",
  "convex/modules/diaspora/demoAccounts.ts",
  "convex/modules/diaspora/mutualAid.ts",
  "convex/modules/editorial/media.ts",
  "convex/modules/notifications/fanout.ts",
  "convex/modules/pages/access.ts",
  "convex/modules/pages/admin.ts",
  "convex/modules/pages/pages.ts",
  "convex/modules/pages/signatories.ts",
  "convex/modules/platform/demoAccounts.ts",
  "convex/modules/posts/feedMaterialization.ts",
  "convex/modules/professionals/read.ts",
  "convex/modules/shops/shops.ts",
  "convex/seeds/demoContent.ts",
]

const TEAM_READER_NAMES = new Set(["livePageTeamRole", "requirePageTeam"])

type Reads = { signatoryReader: boolean; teamReader: boolean; directTableRead: boolean }

function isInsideImport(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) if (ts.isImportDeclaration(current)) return true
  return false
}

function isDeclarationName(node: ts.Identifier): boolean {
  return ts.isFunctionDeclaration(node.parent) && node.parent.name === node
}

/** Ce qu'un fichier lit : la référence à l'identifiant (hors déclaration et import), l'appel `query("pageSignatories")`. */
function readsOf(file: string, text: string): Reads {
  const reads: Reads = { signatoryReader: false, teamReader: false, directTableRead: false }
  walk(parseSource(file, text), (node) => {
    if (ts.isIdentifier(node) && !isInsideImport(node) && !isDeclarationName(node)) {
      if (node.text === "liveSignatoryRole") reads.signatoryReader = true
      if (TEAM_READER_NAMES.has(node.text)) reads.teamReader = true
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "query") {
      const [first] = node.arguments
      if (first && ts.isStringLiteralLike(first) && first.text === "pageSignatories") reads.directTableRead = true
    }
  })
  return reads
}

function engineFiles(): { file: string; reads: Reads }[] {
  return listFiles(["convex"], [".ts"])
    .filter((file) => !isTestFile(file))
    .map((file) => ({ file, reads: readsOf(file, readRepoFile(file)) }))
}

describe("page-authority-readers — le modérateur d'une page n'hérite d'aucun droit de signataire par mégarde", () => {
  it("le détecteur voit les références, les alias et la lecture directe ; il ignore imports, déclarations et commentaires", () => {
    const fabricated = [
      `import { liveSignatoryRole, livePageTeamRole } from "../pages/access"`,
      `// liveSignatoryRole(ctx, page, personId) dans un commentaire ne compte pas`,
      `export async function liveSignatoryRole() { return null }`,
    ].join("\n")
    expect(readsOf("convex/modules/x/quiet.ts", fabricated)).toEqual({ signatoryReader: false, teamReader: false, directTableRead: false })
    const reader = [
      `const role = await liveSignatoryRole(ctx, page, personId)`,
      `const reader = requirePageTeam`,
      `const rows = await ctx.db.query("pageSignatories").withIndex("by_page_role", (q) => q.eq("pageId", pageId)).take(10)`,
    ].join("\n")
    expect(readsOf("convex/modules/x/reader.ts", reader)).toEqual({ signatoryReader: true, teamReader: true, directTableRead: true })
    expect(readsOf("convex/modules/x/insert.ts", `await ctx.db.insert("pageSignatories", row)`).directTableRead).toBe(false)
  })

  it("le lecteur d'ÉQUIPE ne sort pas de sa liste blanche, et la liste n'a pas d'entrée morte", () => {
    const readers = engineFiles().filter(({ reads }) => reads.teamReader).map(({ file }) => file)
    const outside = readers.filter((file) => file !== DEFINER && !(file in TEAM_READERS))
    expect(outside, `lecteur du rôle d'équipe hors liste blanche : ${outside.join(", ")} — décider le droit de toute l'équipe qu'il ouvre et le déclarer dans TEAM_READERS`).toEqual([])
    expect(Object.keys(TEAM_READERS).filter((file) => !readers.includes(file))).toEqual([])
    expect(Object.keys(TEAM_READERS)).toHaveLength(7)
  })

  it("l'inventaire des lecteurs de `liveSignatoryRole` est figé : un lecteur neuf se relit (polarité) avant d'entrer", () => {
    const readers = engineFiles().filter(({ reads }) => reads.signatoryReader).map(({ file }) => file)
    expect(readers, "inventaire des lecteurs de liveSignatoryRole changé : relire la polarité du nouveau lecteur (le modérateur y est nul), puis mettre SIGNATORY_READERS à jour").toEqual(SIGNATORY_READERS)
  })

  it("l'inventaire des lectures directes de `pageSignatories` est figé : une lecture neuve filtre le rôle ou relit un lecteur vivant", () => {
    const readers = engineFiles().filter(({ reads }) => reads.directTableRead).map(({ file }) => file)
    expect(readers, "lecture directe de pageSignatories ajoutée ou retirée : les modérateurs y figurent, filtrer le rôle, puis mettre DIRECT_TABLE_READERS à jour").toEqual(DIRECT_TABLE_READERS)
  })
})
