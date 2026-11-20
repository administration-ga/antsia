// Dupliqué de socle/packages/agent-features/src/components/espace-kit/espace-pagination.ts @ ad2e7fdc2 — adaptations : le paquet d'interface n'a pas d'i18n — les phrases (« Aucun élément », « 1 élément », « Page X sur Y — a à b sur T », « Page N sur M », « page actuelle ») viennent de l'appelant par `EspacePaginationLabels` (nouveau type exporté, avec `PaginationRange`), passé en DERNIER paramètre de `paginationSummary` et de `pageAriaLabel` ; le module garde la décision (quelle phrase, quels nombres) ; calculs de pages inchangés ; commentaires rapportés au paquet `@antsia/ui`.
/**
 * espace-pagination — la pagination du kit d'espace, décidée hors composant.
 *
 * Ce qui se DÉCIDE ici — combien de pages, quelle page courante, quelle
 * fenêtre de numéros afficher, quelle phrase annoncer et avec quels nombres —
 * vit dans ce module pur, où c'est vérifiable sans navigateur.
 * `EspacePagination.tsx` ne fait que rendre ce que ces fonctions calculent.
 *
 * ⚠️ Le paquet `@antsia/ui` n'a PAS d'i18n : il est monté par des applications
 * différentes (le réseau ANTSIA, DIASPORA.GA), chacune avec ses langues. Les
 * PHRASES arrivent donc traduites de l'appelant (`EspacePaginationLabels`),
 * comme le `closeLabel` du tiroir et d'`Alert` ; ce module choisit laquelle
 * dire et la remplit — il n'en écrit aucune.
 *
 * Même patron que `reseau-feed-pages.ts` : aucun import React, aucune
 * dépendance au moteur.
 */

/** Une tranche de liste à annoncer : la page, le nombre de pages, ses bornes et le total. */
export interface PaginationRange {
  page: number
  count: number
  /** Rang du premier élément de la page (à partir de 1). */
  start: number
  /** Rang du dernier élément de la page, borné au total réel. */
  end: number
  total: number
}

/**
 * Les phrases de la pagination, TRADUITES PAR L'APPELANT (le paquet n'a pas
 * d'i18n). Le kit décide QUELLE phrase dire et avec quels nombres ; la langue
 * appartient à l'écran qui le monte.
 */
export interface EspacePaginationLabels {
  /** Nom accessible de la barre (`<nav>`) pour la liste nommée — ex. « Pagination — Mes groupes ». */
  navigation: (listLabel: string) => string
  /** Bouton vers la page précédente — ex. « Précédent ». */
  previous: string
  /** Bouton vers la page suivante — ex. « Suivant ». */
  next: string
  /** Nom accessible d'un numéro de page — ex. « Page 2 sur 5 ». */
  page: (page: number, count: number) => string
  /**
   * Le même, pour la page AFFICHÉE — doublé pour qui n'entend pas le visuel :
   * ex. « Page 2 sur 5, page actuelle ».
   */
  currentPage: (page: number, count: number) => string
  /** Annonce d'une liste VIDE — ex. « Aucun élément ». */
  empty: string
  /** Annonce d'une liste à UN seul élément — ex. « 1 élément ». */
  single: string
  /** Annonce d'une tranche — ex. « Page 2 sur 8 — 13 à 24 sur 87 ». */
  range: (range: PaginationRange) => string
}

/** Nombre de pages — toujours au moins 1, même sur une liste vide. */
export function pageCount(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) return 1
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

/** Borne `page` dans `[1, pageCount(totalItems, pageSize)]`. */
export function clampPage(
  page: number,
  totalItems: number,
  pageSize: number,
): number {
  const count = pageCount(totalItems, pageSize)
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.trunc(page)), count)
}

/**
 * La tranche d'`items` visible à `page`. Applique `clampPage` d'abord : une
 * page hors bornes ne rend jamais un tableau vide par accident, elle rend la
 * page valide la plus proche.
 */
export function pageSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  if (pageSize <= 0) return [...items]
  const clamped = clampPage(page, items.length, pageSize)
  const start = (clamped - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/** Une pagination a-t-elle lieu d'être ? Faux à l'égalité — une seule page
 *  pleine n'a rien à découper. */
export function shouldPaginate(totalItems: number, pageSize: number): boolean {
  if (pageSize <= 0) return false
  return totalItems > pageSize
}

function range(start: number, end: number): number[] {
  const length = Math.max(0, end - start + 1)
  return Array.from({ length }, (_, index) => index + start)
}

/**
 * La fenêtre de numéros à afficher autour de `current`, avec des trous
 * (`"gap"`) là où au moins deux numéros sont omis.
 *
 * Invariants garantis (couverts par les tests) : la page 1 et la dernière
 * page sont toujours présentes, `current` est toujours présent, jamais deux
 * `"gap"` adjacents, et la longueur totale ne dépasse jamais `width + 2`.
 *
 * ⚠️ `width` est supposé ≥ 3 (la valeur par défaut, 5, convient à l'usage
 * normal du kit) : la fonction se protège contre une valeur plus basse en la
 * relevant à 3 en interne, mais la borne `width + 2` n'est alors garantie
 * que pour ce plancher, pas pour la valeur demandée.
 */
export function pageWindow(
  current: number,
  count: number,
  width = 5,
): Array<number | "gap"> {
  const total = Math.max(1, Math.trunc(count))
  const cur = Math.min(Math.max(1, Math.trunc(current)), total)
  // Nombre de pages voisines montrées de chaque côté de `cur`, en plus de
  // `cur` elle-même — dérivé de `width` pour garder la longueur totale
  // (bornes + trous + voisinage) sous `width + 2` dans le pire cas.
  const siblingCount = Math.max(0, Math.floor((Math.max(3, width) - 3) / 2))

  // Pire cas si on affichait les deux trous : 1 + gap + (2*sibling+1) + gap + 1.
  const worstCaseLength = siblingCount * 2 + 5
  if (worstCaseLength >= total) {
    return range(1, total)
  }

  const leftSiblingIndex = Math.max(cur - siblingCount, 3)
  const rightSiblingIndex = Math.min(cur + siblingCount, total - 2)

  const showLeftGap = leftSiblingIndex > 3
  const showRightGap = rightSiblingIndex < total - 2

  if (!showLeftGap && showRightGap) {
    const leftCount = 3 + siblingCount * 2
    return [...range(1, leftCount), "gap", total]
  }
  if (showLeftGap && !showRightGap) {
    const rightCount = 3 + siblingCount * 2
    return [1, "gap", ...range(total - rightCount + 1, total)]
  }
  return [1, "gap", ...range(leftSiblingIndex, rightSiblingIndex), "gap", total]
}

/**
 * La phrase annoncée par la région `aria-live` sous la pagination, dans la
 * langue de l'appelant (`labels`).
 *
 * Deux cas particuliers déclarés à part plutôt que dérivés de la formule
 * générale : une liste VIDE n'a pas de page à énoncer, et une liste à UN
 * seul élément n'a rien à situer entre deux bornes.
 */
export function paginationSummary(
  page: number,
  pageSize: number,
  totalItems: number,
  labels: Pick<EspacePaginationLabels, "empty" | "single" | "range">,
): string {
  if (totalItems <= 0) return labels.empty
  if (totalItems === 1) return labels.single
  const count = pageCount(totalItems, pageSize)
  const clamped = clampPage(page, totalItems, pageSize)
  const start = pageSize > 0 ? (clamped - 1) * pageSize + 1 : 1
  const end = pageSize > 0 ? Math.min(clamped * pageSize, totalItems) : totalItems
  return labels.range({ page: clamped, count, start, end, total: totalItems })
}

/** Le libellé accessible d'un numéro de page, doublé pour la page courante. */
export function pageAriaLabel(
  page: number,
  count: number,
  current: boolean,
  labels: Pick<EspacePaginationLabels, "page" | "currentPage">,
): string {
  return current ? labels.currentPage(page, count) : labels.page(page, count)
}
