import { MEMBER_THEME_IDS } from "@antsia/social-contracts/appearance"

import { demoStorageNamespace } from "./demo-storage"

/**
 * Les motifs de fond que le membre peut activer (Préférences > Motif de fond),
 * dessinés par `@antsia/ui` (`communication.css`, `[data-motif]`). Aucun par défaut :
 * le fond reste uni (ADR-0027). Propres à l'appareil, comme le mode sombre.
 */
export const APPEARANCE_MOTIFS = ["points", "quadrillage", "grain", "projecteur"] as const
export type AppearanceMotif = (typeof APPEARANCE_MOTIFS)[number]

/**
 * L'apparence d'antsia.ga : préfixe de stockage du réseau racine, thèmes que le
 * membre choisit (le premier, Gaboma, par défaut) et motifs de fond. Une seule
 * configuration pour le fournisseur d'apparence (`components/providers.tsx`) et le
 * script d'amorçage de la mise en page (`components/appearance-boot-script.tsx`) :
 * l'un relit exactement ce que l'autre a posé.
 *
 * Module serveur autant que client : il ne lit que le contrat pur des thèmes,
 * jamais l'index de `@antsia/ui`, qui embarque des crochets React interdits à la
 * mise en page serveur. La charte suit la règle d'`antsiaCharteFor` (@antsia/ui) ;
 * `appearance-boot-script.test.tsx` vérifie que la liste reste `ANTSIA_THEMES`.
 */
export const APPEARANCE = {
  storagePrefix: `${demoStorageNamespace()}antsia:antsia:`,
  // Gaboma, premier thème et thème par défaut, est la charte du réseau (`antsia`) ; ADR-0027.
  themes: MEMBER_THEME_IDS.map((id) => ({ id, charte: id === "gaboma" ? "antsia" : `antsia-${id}` })),
  motifs: APPEARANCE_MOTIFS,
} as const
