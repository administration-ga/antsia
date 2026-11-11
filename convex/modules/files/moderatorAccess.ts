/**
 * Garde des fichiers — QUI tranche sur un fichier retenu (libération, lecture
 * du rapport détaillé).
 *
 * Deux qualités, et deux seulement :
 *   - l'opérateur de plateforme, avec la MÊME preuve que la console : session
 *     scellée par le retour IDN, accès journalisé (`liveOperatorOrNull`) ;
 *   - le modérateur ou l'administrateur du réseau du fichier, au statut d'accès
 *     EFFECTIF de ce réseau : adhésion propre, adhésion racine (une suspension à
 *     la racine vaut partout), sanction globale vivante, réseau actif
 *     (`memberHasStatus`).
 * Un fichier sans réseau (profil) ne relève que de l'opérateur. `null` sinon :
 * l'appelant rend son refus indistinct.
 */
import type { AuditCapacity } from "@antsia/social-domain/audit"

import type { Doc } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { getMembership, memberHasStatus } from "../../lib/access"
import { liveOperatorOrNull } from "../../lib/functions"
import { networkRoleCapacity, operatorCapacity } from "../platform/audit"

export async function fileDecisionCapacity(ctx: QueryCtx, scan: Doc<"fileScans">, person: Doc<"persons">): Promise<AuditCapacity | null> {
  const operator = await liveOperatorOrNull(ctx, person)
  if (operator) return operatorCapacity(operator)
  if (!scan.networkId) return null
  if (!(await memberHasStatus(ctx, scan.networkId, person._id, "declaree"))) return null
  const membership = await getMembership(ctx, scan.networkId, person._id)
  return membership ? networkRoleCapacity(membership.role) : null
}
