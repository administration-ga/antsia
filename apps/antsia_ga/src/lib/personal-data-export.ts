/**
 * DP-F1 : assemblage de l'export de « Mes données », page par page.
 *
 * Le moteur rend une table par appel, lue par l'index de la personne : le nombre de pages suit
 * ses données (≈ une par table, plus une par tranche de 100 lignes), plus celles de la base.
 * Deux gardes arrêtent un parcours défaillant :
 *   · la PROGRESSION : chaque page passe à la table suivante sans curseur, ou reste sur la même
 *     table avec un curseur neuf (même contrat que DIASPORALE) — un curseur figé s'arrête aussitôt ;
 *   · une borne de SÛRETÉ de pages : à 100 lignes par page et 80 octets au moins par ligne, la borne
 *     de 64 Mio du navigateur s'atteint avant 8 400 pages pleines ; 20 000 pages laissent la place
 *     d'une page par table et par chemin d'index sans jamais limiter un export réel.
 */
export const EXPORT_PAGE_LIMIT = 20_000
export const EXPORT_BYTE_LIMIT = 64 * 1024 * 1024

export type PersonalExportPage = { table: string; json: string; nextTableIndex: number; cursor: string | null; done: boolean }

export type PersonalExportInput = {
  accountJson: string
  tableCount: number
  readPage: (tableIndex: number, cursor: string | null) => Promise<PersonalExportPage>
  /** Faux dès que l'écran a lancé un autre export ou s'est démonté. */
  isCurrent: () => boolean
  onProgress: (value: number, max: number) => void
}

/** Les morceaux JSON du fichier, ou `null` si l'export a été abandonné. */
export async function assemblePersonalExport(input: PersonalExportInput): Promise<string[] | null> {
  const encoder = new TextEncoder()
  const chunks: string[] = [JSON.stringify({ table: "authentication", record: JSON.parse(input.accountJson) })]
  let tableIndex = 0, cursor: string | null = null, bytes = 0
  for (let pageNumber = 0; pageNumber < EXPORT_PAGE_LIMIT; pageNumber++) {
    if (!input.isCurrent()) return null
    const page = await input.readPage(tableIndex, cursor)
    if (!input.isCurrent()) return null
    const records: unknown = JSON.parse(page.json)
    if (!Array.isArray(records)) throw new Error("Invalid export")
    for (const record of records) {
      const chunk = JSON.stringify({ table: page.table, record })
      bytes += encoder.encode(chunk).byteLength
      if (bytes > EXPORT_BYTE_LIMIT) throw new Error("Export exceeds browser capacity")
      chunks.push(chunk)
    }
    input.onProgress(page.nextTableIndex, input.tableCount)
    if (page.done) return chunks
    const nextTable = page.nextTableIndex === tableIndex + 1 && page.cursor === null
    const nextPage = page.nextTableIndex === tableIndex && page.cursor !== null && page.cursor !== cursor
    if ((!nextTable && !nextPage) || page.nextTableIndex >= input.tableCount) throw new Error("Export interrupted")
    tableIndex = page.nextTableIndex
    cursor = page.cursor
  }
  throw new Error("Export page limit")
}
