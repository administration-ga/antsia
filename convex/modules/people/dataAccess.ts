/**
 * DP-F1 : chemins d'accès par index aux données d'une personne, dérivés du schéma réel.
 *
 * L'export et l'effacement ne balaient plus les tables : chaque référence typée vers
 * `persons` (champ simple ou imbriqué), chaque parent d'effacement (`dataPolicies.ts`)
 * et chaque copie d'un message se lisent par un index dont le premier champ est ce
 * chemin, ou `networkId` puis ce chemin (un passage par réseau). Le coût suit donc les
 * lignes de la personne, pas la base.
 *
 * Les seules exceptions sont nommées ici et justifiées : identifiants rangés dans un
 * tableau (aucun index Convex n'atteint un élément), et tables de la tranche `diaspora`
 * encore sans index, relues par un balayage résiduel jusqu'à l'ajout des index demandés
 * à DIASPORALE. `erasure.test.ts` échoue sur tout autre chemin sans index.
 */
import type { PaginationOptions, PaginationResult } from "convex/server"
import type { ValidatorJSON } from "convex/values"

import type { TableNames } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import schema from "../../schema"
import { dataTableNames, exportKeyFields, shapeFor, type DataRecord } from "./dataInventory"
import { DATA_TABLE_POLICIES } from "./dataPolicies"

export type IndexPlan = {
  table: TableNames
  /** Chemin comparé (pointé pour un champ imbriqué). */
  field: string
  index: string
  /** Égalités constantes posées avant le chemin (référence portée par une chaîne). */
  prefix: ReadonlyArray<readonly [string, string]>
  /** Index `(networkId, chemin, …)` : un passage par réseau. */
  perNetwork: boolean
}

/** Relation d'effacement ou de copie : la ligne enfant désigne une ligne marquée. */
export type ChildRelation = { parents: readonly string[] | "*"; plan: IndexPlan }

/** Tables traitées hors du parcours générique (personne, preuves, travail d'effacement lui-même). */
export const ERASURE_EXCLUDED_TABLES: ReadonlySet<string> = new Set(["persons", "idnProofs", "devOtpCodes", "dataErasureJobs", "dataErasureTargets", "dataErasureReceipts"])

/** Références de personne portées par une chaîne, qualifiées par un champ constant. */
export const STRING_PERSON_REFERENCES: ReadonlyArray<{ table: string; field: string; prefix: ReadonlyArray<readonly [string, string]> }> = [
  { table: "engineAudit", field: "subjectId", prefix: [["subjectTable", "persons"]] },
  { table: "judicialMeasures", field: "targetId", prefix: [["targetKind", "person"]] },
  { table: "reports", field: "targetId", prefix: [["targetKind", "person"]] },
]

/** Copies et réponses : la ligne d'autrui perd le contenu ou la citation d'un message effacé. */
export const DEPENDENT_REFERENCES: ReadonlyArray<{ table: string; field: string }> = [
  { table: "groupMessages", field: "forwardedFrom.messageId" },
  { table: "groupMessages", field: "replyToMessageId" },
  { table: "personalMessages", field: "forwardedFrom.messageId" },
  { table: "personalMessages", field: "replyToMessageId" },
]

/**
 * Identifiants dans un tableau, atteints par le parent d'une ligne de la personne : qui tient
 * l'attente d'un appel en est participant (`callParticipants`, `callInvites`), ou l'a créé.
 */
export const COLLECTION_REFERENCES_BY_PARENT: Readonly<Record<string, string>> = {
  "calls.heldBy[]": "tenir l'attente suppose d'être participant : l'appel est relu par la participation effacée",
}

/**
 * Identifiants dans un tableau que rien n'indexe. Ils ne désignent plus aucun document après
 * l'effacement de la personne, ne sont ni affichés ni exportés à autrui, et le texte qui les a
 * produits reste celui de son auteur. Retrait complet : table de mentions dédiée avec reprise
 * des données existantes (hors de ce lot, aucune migration permise). À valider par le propriétaire.
 */
export const COLLECTION_REFERENCE_EXCEPTIONS: Readonly<Record<string, string>> = {
  "postComments.mentionedPersonIds[]": "cache des mentions du texte de l'auteur, relu seulement pour ne pas renotifier à la modification",
  "posts.mentionedPersonIds[]": "cache des mentions du texte de l'auteur, relu seulement pour ne pas renotifier à la modification",
  "personalMessages.hiddenForPersonIds[]": "masquage « pour moi » : comparé au seul lecteur, qui n'existe plus",
}

/**
 * Tranche `diaspora` (écrite par la session DIASPORALE) : tables encore sans index pour l'un de
 * leurs chemins de personne ou de parent. Elles gardent le balayage de leur seule table, dans le
 * réseau DIASPORALE, jusqu'à l'ajout de l'index demandé. Le test retire toute entrée devenue inutile.
 */
export const RESIDUAL_SCAN_TABLES: Readonly<Record<string, string>> = {
  associationMemberships: "index demandé : by_decidedByPersonId (decidedByPersonId)",
  foundingAdmissions: "index demandés : by_admittedByPersonId, by_withdrawnByPersonId",
  jobApplications: "index demandé : by_decidedByPersonId (decidedByPersonId)",
  kitOutdatedFlags: "index demandé : by_personId (personId)",
  kitResourceReviews: "index demandé : by_reviewerPersonId (reviewerPersonId)",
  kitResources: "index demandés : by_authorPersonId, by_revisedByPersonId, by_reviewedByPersonId",
  mentorListings: "index demandé : by_personId (personId)",
  mentoringRequests: "index demandé : by_mentorProfileId (mentorProfileId)",
  serviceProposals: "index demandé : by_authorPersonId (authorPersonId)",
  serviceRequests: "index demandé : by_closedByPersonId (closedByPersonId)",
  serviceReviewReplies: "index demandé : by_authorPersonId (authorPersonId)",
  serviceReviews: "index demandés : by_authorPersonId (authorPersonId), by_requestId (requestId)",
}

export const isResidualScanTable = (table: string): boolean => Object.prototype.hasOwnProperty.call(RESIDUAL_SCAN_TABLES, table)

type IdPath = { path: string; tables: Set<string>; inCollection: boolean }
type IndexDefinition = { indexDescriptor: string; fields: string[] }

function collectIdPaths(shape: ValidatorJSON, path: string, inCollection: boolean, out: Map<string, IdPath>): void {
  switch (shape.type) {
    case "id": {
      const key = inCollection ? `${path}[]` : path
      const known = out.get(key) ?? { path, tables: new Set<string>(), inCollection }
      known.tables.add(shape.tableName)
      out.set(key, known)
      return
    }
    case "array": collectIdPaths(shape.value, path, true, out); return
    case "record": collectIdPaths(shape.values.fieldType, path, true, out); return
    case "object":
      for (const [key, field] of Object.entries(shape.value)) collectIdPaths(field.fieldType, path ? `${path}.${key}` : key, inCollection, out)
      return
    case "union": for (const member of shape.value) collectIdPaths(member, path, inCollection, out); return
    default: return
  }
}

const idPathCache = new Map<string, Map<string, IdPath>>()
function idPaths(table: string): Map<string, IdPath> {
  let paths = idPathCache.get(table)
  if (!paths) {
    paths = new Map()
    collectIdPaths(shapeFor(table), "", false, paths)
    idPathCache.set(table, paths)
  }
  return paths
}

/** Chemins simples (hors tableaux) qui désignent une personne. */
export function scalarPersonPaths(table: string): string[] {
  return [...idPaths(table).entries()].filter(([, item]) => !item.inCollection && item.tables.has("persons")).map(([key]) => key).sort()
}

/** Chemins rangés dans un tableau ou un enregistrement, notés `champ[]`. */
export function collectionPersonPaths(table: string): string[] {
  return [...idPaths(table).entries()].filter(([, item]) => item.inCollection && item.tables.has("persons")).map(([key]) => key).sort()
}

/** Tables désignées par un chemin d'identifiant ; `*` pour un identifiant porté par une chaîne. */
export function referencedTables(table: string, path: string): readonly string[] | "*" {
  const item = idPaths(table).get(path)
  return item ? [...item.tables].sort() : "*"
}

function indexesOf(table: string): IndexDefinition[] {
  const definitions = schema.tables as unknown as Record<string, { " indexes"(): IndexDefinition[] } | undefined>
  return definitions[table]?.[" indexes"]() ?? []
}

function requiresNetwork(table: string): boolean {
  const shape = shapeFor(table)
  if (shape.type !== "object") return false
  const network = shape.value.networkId
  return network !== undefined && !network.optional
}

const startsWith = (fields: readonly string[], expected: readonly string[]) => expected.every((field, index) => fields[index] === field)

/** Le meilleur index pour un chemin : premier champ, sinon `(networkId, chemin)`. */
export function indexPlan(table: string, field: string, prefix: ReadonlyArray<readonly [string, string]> = []): IndexPlan | null {
  const indexes = indexesOf(table)
  const direct = indexes.find((index) => startsWith(index.fields, [...prefix.map(([name]) => name), field]))
  if (direct) return { table: table as TableNames, field, index: direct.indexDescriptor, prefix, perNetwork: false }
  if (prefix.length > 0 || !requiresNetwork(table)) return null
  const scoped = indexes.find((index) => startsWith(index.fields, ["networkId", field]))
  return scoped ? { table: table as TableNames, field, index: scoped.indexDescriptor, prefix, perNetwork: true } : null
}

function plansFor(table: string, fields: readonly string[]): IndexPlan[] {
  return fields.flatMap((field) => {
    const plan = indexPlan(table, field)
    return plan ? [plan] : []
  })
}

const memo = <T>(build: (table: string) => T) => {
  const cache = new Map<string, T>()
  return (table: string): T => {
    let value = cache.get(table)
    if (value === undefined) { value = build(table); cache.set(table, value) }
    return value
  }
}

/** Champs qui rendent une ligne propriété de la personne (repli : toutes ses références). */
export function ownerFields(table: string): readonly string[] {
  const policy = DATA_TABLE_POLICIES[table]
  if (!policy || policy.shared) return []
  return policy.owners ?? scalarPersonPaths(table)
}

const ownerPlanCache = memo((table) => plansFor(table, ownerFields(table)))
export function ownerPlans(table: string): IndexPlan[] { return ownerPlanCache(table) }

const referencePlanCache = memo((table) => {
  const plans = plansFor(table, scalarPersonPaths(table))
  for (const reference of STRING_PERSON_REFERENCES) {
    if (reference.table !== table) continue
    const plan = indexPlan(table, reference.field, reference.prefix)
    if (plan) plans.push(plan)
  }
  return plans
})
/** Toutes les références de la personne dans une table, pour l'anonymisation. */
export function referencePlans(table: string): IndexPlan[] { return referencePlanCache(table) }

const exportPlanCache = memo((table) => plansFor(table, exportKeyFields(table)))
/** Les chemins qui ouvrent l'export d'une table (`exportKeyFields`). */
export function exportPlans(table: string): IndexPlan[] { return exportPlanCache(table) }

let childRelationCache: ChildRelation[] | null = null
/** Lignes qui disparaissent avec une ligne marquée (`parents` des politiques). */
export function childRelations(): ChildRelation[] {
  if (childRelationCache) return childRelationCache
  childRelationCache = dataTableNames().flatMap((table) => (DATA_TABLE_POLICIES[table]?.parents ?? []).flatMap((field) => {
    const plan = indexPlan(table, field)
    return plan ? [{ parents: referencedTables(table, field), plan }] : []
  }))
  return childRelationCache
}

let dependentRelationCache: ChildRelation[] | null = null
export function dependentRelations(): ChildRelation[] {
  if (dependentRelationCache) return dependentRelationCache
  dependentRelationCache = DEPENDENT_REFERENCES.flatMap((reference) => {
    const plan = indexPlan(reference.table, reference.field)
    return plan ? [{ parents: referencedTables(reference.table, reference.field), plan }] : []
  })
  return dependentRelationCache
}

/** Relations dont le parent porte un tableau atteint par ses enfants (`COLLECTION_REFERENCES_BY_PARENT`). */
export function carrierRelations(): Array<{ table: string; field: string; parent: string }> {
  const parents = new Set(Object.keys(COLLECTION_REFERENCES_BY_PARENT).map((key) => key.split(".")[0]))
  return dataTableNames().flatMap((table) => (DATA_TABLE_POLICIES[table]?.parents ?? []).flatMap((field) => {
    const targets = referencedTables(table, field)
    return targets === "*" ? [] : targets.filter((parent) => parents.has(parent)).map((parent) => ({ table, field, parent }))
  }))
}

export const relationsFor = (relations: readonly ChildRelation[], table: string): ChildRelation[] =>
  relations.filter((relation) => relation.parents === "*" || relation.parents.includes(table))

let gapCache: string[] | null = null
/** Les chemins de données personnelles sans index ni exception nommée (doit rester vide). */
export function accessGaps(): string[] {
  return gapCache ??= computeAccessGaps()
}

function computeAccessGaps(): string[] {
  const gaps: string[] = []
  for (const table of dataTableNames()) {
    const residual = isResidualScanTable(table)
    for (const path of scalarPersonPaths(table)) if (!residual && !indexPlan(table, path)) gaps.push(`${table}.${path}`)
    for (const field of DATA_TABLE_POLICIES[table]?.parents ?? []) if (!residual && !indexPlan(table, field)) gaps.push(`${table}.${field} (parent)`)
    for (const path of collectionPersonPaths(table)) {
      const key = `${table}.${path}`
      if (!Object.prototype.hasOwnProperty.call(COLLECTION_REFERENCES_BY_PARENT, key) && !Object.prototype.hasOwnProperty.call(COLLECTION_REFERENCE_EXCEPTIONS, key)) gaps.push(key)
    }
    // Repli de propriété sans champ nommé : un tableau ne peut pas donner la propriété par index.
    const policy = DATA_TABLE_POLICIES[table]
    if (policy && !policy.shared && !policy.owners && collectionPersonPaths(table).length > 0) gaps.push(`${table} (propriété par tableau)`)
  }
  for (const reference of STRING_PERSON_REFERENCES) if (!indexPlan(reference.table, reference.field, reference.prefix)) gaps.push(`${reference.table}.${reference.field} (chaîne)`)
  for (const reference of DEPENDENT_REFERENCES) if (!indexPlan(reference.table, reference.field)) gaps.push(`${reference.table}.${reference.field} (copie)`)
  return gaps
}

export function valueAt(row: Record<string, unknown>, path: string): unknown {
  let value: unknown = row
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

export const matchesPlan = (plan: IndexPlan, row: Record<string, unknown>, value: string): boolean =>
  valueAt(row, plan.field) === value && plan.prefix.every(([field, constant]) => valueAt(row, field) === constant)

/** Position dans une liste de plans : plan, réseau en cours, curseur de la page. */
export type UnitCursor = { p: number; n: string | null; c: string | null }
/** Budget d'une transaction : sondes d'index et une seule pagination (règle de Convex). */
export type ReadBudget = { ops: number; paginated: boolean; readonly maxOps: number }
export type UnitRead = { rows: DataRecord[]; planIndex: number; next: UnitCursor | null; stop: boolean }

// Table et index choisis à l'exécution : le typage statique de Convex ne les connaît pas.
type DynamicRange = { eq(field: string, value: unknown): DynamicRange }
type DynamicIndexedQuery = { first(): Promise<DataRecord | null>; paginate(options: PaginationOptions): Promise<PaginationResult<DataRecord>> }
type DynamicTableQuery = { withIndex(index: string, range: (q: DynamicRange) => DynamicRange): DynamicIndexedQuery }

function unitRange(db: QueryCtx["db"], plan: IndexPlan, value: string, networkId: string | null): DynamicIndexedQuery {
  const query = db.query(plan.table) as unknown as DynamicTableQuery
  return query.withIndex(plan.index, (q) => {
    let range = networkId === null ? q : q.eq("networkId", networkId)
    for (const [field, constant] of plan.prefix) range = range.eq(field, constant)
    return range.eq(plan.field, value)
  })
}

/** Réseaux dans l'ordre de leur identifiant, sans borne ni pagination. */
async function nextNetworkId(db: QueryCtx["db"], after: string | null): Promise<string | null> {
  const id = after === null ? null : db.normalizeId("networks", after)
  if (after !== null && id === null) return fail("policyRefused")
  const row = await db.query("networks").withIndex("by_id", (q) => (id === null ? q : q.gt("_id", id))).first()
  return row?._id ?? null
}

async function advance(db: QueryCtx["db"], plan: IndexPlan, state: UnitCursor, budget: ReadBudget): Promise<UnitCursor> {
  if (!plan.perNetwork) return { p: state.p + 1, n: null, c: null }
  budget.ops += 1
  const network = await nextNetworkId(db, state.n)
  return network === null ? { p: state.p + 1, n: null, c: null } : { p: state.p, n: network, c: null }
}

/**
 * Lit la prochaine page non vide d'une liste de plans. Les unités vides sont sondées (`first`) ;
 * une seule est paginée par transaction. Rend `next: null` quand la liste est épuisée, `stop`
 * quand la transaction doit s'arrêter (budget atteint, ou une autre unité non vide attend).
 */
export async function readUnits(db: QueryCtx["db"], plans: readonly IndexPlan[], value: string, from: UnitCursor | null, budget: ReadBudget, options: { numItems: number; maximumBytesRead: number }): Promise<UnitRead> {
  let state: UnitCursor = from ?? { p: 0, n: null, c: null }
  let rows: DataRecord[] = [], planIndex = -1
  for (;;) {
    const plan = plans[state.p]
    if (!plan) return { rows, planIndex, next: null, stop: false }
    if (plan.perNetwork && state.n === null) {
      if (budget.ops >= budget.maxOps) return { rows, planIndex, next: state, stop: true }
      budget.ops += 1
      const network = await nextNetworkId(db, null)
      state = network === null ? { p: state.p + 1, n: null, c: null } : { ...state, n: network }
      continue
    }
    // Une requête Convex ne sert qu'une fois : une par sonde, une par page.
    const range = () => unitRange(db, plan, value, plan.perNetwork ? state.n : null)
    if (state.c === null) {
      if (budget.ops >= budget.maxOps) return { rows, planIndex, next: state, stop: true }
      budget.ops += 1
      if (await range().first() === null) { state = await advance(db, plan, state, budget); continue }
    }
    if (budget.paginated) return { rows, planIndex, next: state, stop: true }
    budget.paginated = true
    const page = await range().paginate({ numItems: options.numItems, cursor: state.c, maximumRowsRead: options.numItems, maximumBytesRead: options.maximumBytesRead })
    rows = page.page
    planIndex = state.p
    if (!page.isDone) return { rows, planIndex, next: { ...state, c: page.continueCursor }, stop: true }
    state = await advance(db, plan, state, budget)
  }
}

/** Curseur lu depuis un client ou un travail : forme stricte, plan existant, réseau réel. */
export function parseUnitCursor(db: QueryCtx["db"], value: unknown, plans: readonly IndexPlan[]): UnitCursor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("policyRefused")
  const fields = value as Record<string, unknown>
  const p = fields.p, n = fields.n, c = fields.c
  if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > plans.length) return fail("policyRefused")
  if (n !== null && (typeof n !== "string" || db.normalizeId("networks", n) === null)) return fail("policyRefused")
  if (c !== null && typeof c !== "string") return fail("policyRefused")
  return { p, n, c }
}
