/**
 * person-block — ce que dit la confirmation d'un blocage ou d'un déblocage
 * (PF-01, brique commune « Bloquer une personne » du plan directeur, § 5.1).
 *
 * Le GESTE lui-même est celui du moteur, et lui seul :
 * `graph.connections.blockPerson` / `unblockPerson` ({ networkId,
 * targetPersonId }), seau de débit `connection.block`. Bloquer ferme la paire
 * dans tous les réseaux et retire les abonnements dans les deux sens (D1 du
 * plan 05) ; débloquer ne rétablit ni relation ni abonnement. Aucune annonce
 * n'est faite à la personne bloquée.
 *
 * Ce module porte la COPIE de la confirmation, une fois : la fiche, le menu
 * d'une publication et, demain, la conversation (IC-03) la lisent par
 * `BlockPersonDialog`. La conséquence et la réversibilité viennent de
 * `profile-visibility-copy.ts` (le geste `bloquer`) : une seule phrase pour
 * dire ce que fait le blocage, où qu'on la lise.
 *
 * Module PUR : `t` en DERNIER paramètre, clés qualifiées.
 */
import type { TFunction } from "i18next"

import { visibilityAction } from "./profile-visibility-copy"

export type PersonBlockMode = "block" | "unblock"

export interface PersonBlockCopy {
  title: string
  /** Ce que le geste produit — le nom accessible secondaire de la boîte. */
  description: string
  /** Ce qu'il laisse intact, et où l'on revient dessus. */
  details: readonly string[]
  confirm: string
  /** Le toast du succès. */
  done: string
  /** La phrase de l'écran quand le refus du moteur n'a ni règle ni code. */
  failedKey: string
}

/** Un nom affiché vide vaut absence : jamais « Bloquer  ? ». */
function cleanName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}

/** La copie de la confirmation, dans la langue de l'écran. */
export function personBlockCopy(mode: PersonBlockMode, name: string | null | undefined, t: TFunction): PersonBlockCopy {
  const named = cleanName(name)
  if (mode === "block") {
    const action = visibilityAction("bloquer", t)
    return {
      title: named === null ? t("reseau:personBlock.blockTitleUnnamed") : t("reseau:personBlock.blockTitle", { name: named }),
      description: action.consequence,
      details: [action.reversibilite, t("reseau:personBlock.listHint")],
      confirm: t("reseau:personBlock.confirmBlock"),
      done: named === null ? t("reseau:personBlock.blockedUnnamed") : t("reseau:personBlock.blocked", { name: named }),
      failedKey: "reseau:personBlock.blockFailed",
    }
  }
  return {
    title: named === null ? t("reseau:personBlock.unblockTitleUnnamed") : t("reseau:personBlock.unblockTitle", { name: named }),
    description: t("reseau:peoplePanel.blocks.confirmBody"),
    details: [],
    confirm: t("reseau:personBlock.confirmUnblock"),
    done: t("reseau:personBlock.unblocked"),
    failedKey: "reseau:personBlock.unblockFailed",
  }
}
