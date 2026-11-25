/**
 * idn-prefill-writer — ADR-0044 (lot M1). CE QU'IL INTERDIT : que le pré-remplissage IDN de l'accueil
 * (`idnPrefills`) soit écrit ailleurs que par la tranche `people/idnPrefill.ts`, et que son écrivain
 * (`recordIdnPrefill`) soit appelé ailleurs que par le rappel OIDC (`betterAuth/auth.ts`, greffon
 * `engine-idn-session-proof`). Un autre écrivain recopierait un nom civil sans retour d'IDN.
 *
 * COMMENT IL LIT : par le texte des sources du moteur, des applications et des paquets (les tests posent
 * leurs fixtures directement et ne sont pas balayés). Seuls les fichiers nommés ci-dessous nomment la
 * table ; parmi eux, seule la tranche l'écrit (insertion, remplacement, modification). Les autres la
 * classent (cliquets de données) ou la lisent pour l'export ; la suppression passe par la tranche.
 */
import { describe, expect, it } from "vitest"

import { isTestFile, listFiles, readRepoFile } from "./lib/source-files"

/** L'UNIQUE écrivain de la table. */
const WRITER_MODULE = "convex/modules/people/idnPrefill.ts"
/** L'UNIQUE appelant de l'écrivain : le rappel OIDC. */
const CALLBACK = "convex/betterAuth/auth.ts"

/** Les seuls fichiers qui nomment la table : la tranche, le schéma, et les cliquets de données. */
const TABLE_READERS = new Set([
  WRITER_MODULE,
  "convex/modules/people/tables.ts",
  "convex/modules/people/dataPolicies.ts",
  "convex/modules/people/dataAccess.ts",
  "convex/modules/people/dataInventory.ts",
  "convex/modules/people/erasure.ts",
])

const sources = () => listFiles(["convex", "apps", "packages"], [".ts", ".tsx", ".mjs"]).filter((file) => !isTestFile(file) && !file.startsWith("convex/_generated/"))

/** Insertion, remplacement ou modification visant la table par son nom (le seul accès possible à une table neuve). */
export function writesIdnPrefills(text: string): boolean {
  return /\.(?:insert|replace|patch)\(\s*["'`]idnPrefills["'`]/.test(text) || /\[\s*["'`](?:insert|replace|patch)["'`]\s*\]\(\s*["'`]idnPrefills["'`]/.test(text)
}

describe("idn-prefill-writer — un seul écrivain, un seul appelant", () => {
  it("seuls les fichiers nommés nomment la table, et seule la tranche l'écrit", () => {
    const files = sources()
    expect(files.filter((file) => !TABLE_READERS.has(file) && readRepoFile(file).includes("idnPrefills"))).toEqual([])
    expect(files.filter((file) => file !== WRITER_MODULE && writesIdnPrefills(readRepoFile(file)))).toEqual([])
    expect(writesIdnPrefills(readRepoFile(WRITER_MODULE))).toBe(true)
  })

  it("seul le rappel OIDC appelle `recordIdnPrefill`", () => {
    const callers = sources().filter((file) => file !== WRITER_MODULE && readRepoFile(file).includes("recordIdnPrefill"))
    expect(callers).toEqual([CALLBACK])
  })

  it("voit une écriture directe, y compris par crochets", () => {
    expect(writesIdnPrefills('await ctx.db.insert("idnPrefills", row)')).toBe(true)
    expect(writesIdnPrefills("await db.patch( 'idnPrefills', id, {})")).toBe(true)
    expect(writesIdnPrefills('await ctx.db["insert"]("idnPrefills", row)')).toBe(true)
    expect(writesIdnPrefills('await ctx.db.delete(row._id)')).toBe(false)
    expect(writesIdnPrefills('ctx.db.query("idnPrefills")')).toBe(false)
  })
})
