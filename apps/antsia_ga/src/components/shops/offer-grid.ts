/**
 * Les grilles d'offres, sur le modèle des ventes privées (décision du propriétaire du 22/10/2026), lues sur la
 * largeur du conteneur `@container` le plus proche : deux colonnes au téléphone, jusqu'à six sur grand écran.
 * L'écart vaut la marge de la page (12 px au téléphone, la gouttière dès 768 px).
 */
export const OFFER_GRID = "grid min-w-0 grid-cols-2 gap-3 min-[768px]:gap-gutter @min-[40rem]:grid-cols-3 @min-[54rem]:grid-cols-4 @min-[70rem]:grid-cols-5 @min-[90rem]:grid-cols-6"

/** La même liste en lignes (photo à gauche) : une colonne au téléphone, deux puis trois sur grand écran. */
export const OFFER_LIST = "grid min-w-0 grid-cols-1 gap-3 min-[768px]:gap-gutter @min-[48rem]:grid-cols-2 @min-[80rem]:grid-cols-3"
