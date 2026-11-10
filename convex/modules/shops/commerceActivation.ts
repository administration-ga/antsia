/**
 * P16 — décisions de mise en service encore ouvertes dans les rapports P12–P16.
 * Aucune bascule de console ne remplace une politique de conservation validée
 * ou une recette croisée. Ce registre ferme seulement les NOUVEAUX effets ;
 * suivi, retrait, annulation et résolution d'obligations gardent leurs portes.
 * Changer une valeur exige une décision documentée et les contrôles différés.
 * Module pur : utilisable par les surfaces de console sans importer de serveur.
 */
export const COMMERCE_ACTIVATION_DECISIONS = {
  storefrontAutomatic: { ready: false, reference: "P16-D2-DP05" },
  payments: { ready: false, reference: "P12-P13-recette" },
  services: { ready: false, reference: "P16-D5-P14-recette" },
  applications: { ready: false, reference: "P16-D5-P15-recette" },
} as const

export type CommerceActivation = keyof typeof COMMERCE_ACTIVATION_DECISIONS

export function commerceActivationReady(capability: CommerceActivation): boolean {
  return COMMERCE_ACTIVATION_DECISIONS[capability].ready
}
