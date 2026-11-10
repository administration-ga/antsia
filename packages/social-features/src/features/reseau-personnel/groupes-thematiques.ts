// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/groupes-thematiques.ts @ ad2e7fdc2 — adaptations : bornes et rôles tirés du domaine du moteur (`@antsia/social-domain/thematicGroups`) au lieu d'un miroir recopié ; libellés par l'i18n — les constantes de texte deviennent des CLÉS qualifiées (`GROUPS_RETURN_LABEL_KEY`, `EMPTY_DISCOVER_TEXT_KEY`, `EMPTY_MY_GROUPS_TEXT_KEY`, `GROUPS_ERROR_TEXT_KEYS`, `GROUP_INVITE_OPEN_LABEL_KEY`, `GROUP_INVITE_PICKER_LABEL_KEY`, `GROUP_INVITE_EMPTY_TEXT_KEY`), les fonctions reçoivent `t` en DERNIER paramètre (clés `reseau:groupesThematiques.*`, pluriels par `count`) ; nom neutre d'une personne sans profil publié (`groupPersonName`) ; refus du moteur lus par leur code ou leur règle (`groupActionErrorText`) ; réponse d'`invite` du moteur (`alreadyInvited` toujours rendu, la lecture tolérante est gardée) ; gestion d'un groupe (PG-02) : règles à accepter avant d'entrer ou après un changement, gestes du propriétaire selon l'état du groupe, bandeau d'un groupe fermé ou archivé, confirmation de suppression par le nom du groupe.
/**
 * groupes-thematiques — ce que le volet Groupes DÉCIDE, hors de tout composant.
 *
 * Ce qui se décide — quelle surface la colonne montre, quels boutons s'offrent
 * à quel rôle, quels libellés, quels états vides — vit ici, où c'est
 * vérifiable, et non dans le corps de `GroupsPanel`.
 *
 * Les bornes et la matrice d'autorité sont celles du DOMAINE du moteur
 * (`@antsia/social-domain/thematicGroups`), importées et non recopiées : les
 * prédicats ci-dessous ne MONTRENT ou cachent que des boutons — la garde reste
 * au serveur, seul endroit où elle protège quelque chose.
 *
 * Aucune phrase n'est écrite ici : chaque libellé est une clé qualifiée
 * (`reseau:groupesThematiques.*`), traduite par le `t` reçu en dernier
 * paramètre. Aucun import React : ce module ne connaît que des données.
 */

import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import {
  canLeaveThematicGroup,
  isThematicGroupModerator,
  THEMATIC_GROUP_DESCRIPTION_MAX_LENGTH,
  THEMATIC_GROUP_NAME_MAX_LENGTH,
  THEMATIC_GROUP_NAME_MIN_LENGTH,
  THEMATIC_GROUP_RULES_MAX_LENGTH,
  type ThematicGroupRole as DomainThematicGroupRole,
} from "@antsia/social-domain/thematicGroups"
import type { TFunction } from "i18next"

/** Les bornes du domaine — le client borne pour éviter un aller-retour perdu, le serveur reste seul juge. */
export const GROUP_NAME_MIN_LENGTH = THEMATIC_GROUP_NAME_MIN_LENGTH
export const GROUP_NAME_MAX_LENGTH = THEMATIC_GROUP_NAME_MAX_LENGTH
export const GROUP_DESCRIPTION_MAX_LENGTH = THEMATIC_GROUP_DESCRIPTION_MAX_LENGTH
export const GROUP_RULES_MAX_LENGTH = THEMATIC_GROUP_RULES_MAX_LENGTH

export type ThematicGroupRole = DomainThematicGroupRole

/**
 * Ce que la colonne du volet Groupes montre : l'ANNUAIRE (mes groupes,
 * invitations, découverte, création) ou LA PAGE d'un groupe. Même patron que
 * `FeedView` — et même invariant : la page d'un groupe expose un retour vers
 * l'annuaire, à tous les paliers.
 */
export type GroupsView =
  | { kind: "list" }
  | { kind: "group"; groupId: string }

/**
 * La vue du volet, d'après l'URL (`?groupe=<id>` ouvre la page).
 *
 * ⚠️ PROJECTION, pas graine (R-13, 2026-09-06) : le volet la recalcule à
 * CHAQUE rendu depuis `?groupe=`, il n'en garde aucune copie. Le nom
 * `initialGroupsViewFor` est conservé — il est exporté et cité par les tests —
 * mais « initial » ne décrit plus qu'un état de départ : ouvrir un groupe
 * ÉCRIT l'adresse, et c'est l'adresse qui décide ensuite. Sans cela, la page
 * d'un groupe n'était ni partageable, ni atteignable deux fois de suite par
 * une notification, ni refermable par le bouton « Retour » du navigateur.
 */
export function initialGroupsViewFor(groupId: string | null): GroupsView {
  return groupId === null ? { kind: "list" } : { kind: "group", groupId }
}

/** L'invariant de `FeedView`, repris : toute vue ≠ annuaire expose un retour. */
export function groupsViewNeedsReturn(view: GroupsView): boolean {
  return view.kind !== "list"
}

export const GROUPS_RETURN_LABEL_KEY = "reseau:groupesThematiques.returnLabel"

/** Le rôle, tel que l'écran le nomme. `null` : pas membre. */
export function groupRoleLabel(role: ThematicGroupRole | null, t: TFunction): string | null {
  switch (role) {
    case "owner":
      return t("reseau:groupesThematiques.role.owner")
    case "moderator":
      return t("reseau:groupesThematiques.role.moderator")
    case "member":
      return t("reseau:groupesThematiques.role.member")
    case null:
      return null
  }
}

/**
 * MONTRER les actes de modération (épingler, retirer une publication) ?
 * La règle du domaine (`isThematicGroupModerator`) — le serveur re-vérifie.
 */
export function canModerateGroup(role: ThematicGroupRole | null): boolean {
  return role !== null && isThematicGroupModerator(role)
}

/** MONTRER la gestion des rôles ? Le seul owner en a l'autorité. */
export function canManageGroupRoles(role: ThematicGroupRole | null): boolean {
  return role === "owner"
}

/**
 * MONTRER « Quitter » ? L'owner ne quitte pas son groupe (le serveur le
 * refuse) : ne pas offrir un bouton qui ne peut qu'échouer.
 */
export function canLeaveGroup(role: ThematicGroupRole | null): boolean {
  return role !== null && canLeaveThematicGroup(role)
}

/** Inviter est un acte de MEMBRE — tout rôle vivant. */
export function canInviteToGroup(role: ThematicGroupRole | null): boolean {
  return role !== null
}

/**
 * Le nom proposé est-il recevable ? Miroir ALLÉGÉ d'`assertThematicGroupName`
 * — `null` quand ça passe, la phrase du refus sinon.
 */
export function validateGroupName(raw: string, t: TFunction): string | null {
  const name = raw.trim()
  if (name.length < GROUP_NAME_MIN_LENGTH || name.length > GROUP_NAME_MAX_LENGTH) {
    return t("reseau:groupesThematiques.nameLength", { min: GROUP_NAME_MIN_LENGTH, max: GROUP_NAME_MAX_LENGTH })
  }
  return null
}

/** « 12 membres » — le chiffre seul ne dit pas de quoi. */
export function memberCountLabel(count: number, t: TFunction): string {
  return t("reseau:groupesThematiques.memberCount", { count })
}

/**
 * L'état vide du MUR d'un groupe — il dépend de qui regarde : un membre est
 * invité à publier, la phrase le dit.
 */
export function emptyGroupWallText(isMember: boolean, t: TFunction): string {
  return isMember ? t("reseau:groupesThematiques.emptyWall.member") : t("reseau:groupesThematiques.emptyWall.visitor")
}

/** L'état vide de l'annuaire découverte. */
export const EMPTY_DISCOVER_TEXT_KEY = "reseau:groupesThematiques.emptyDiscover"

/** L'état vide de « Mes groupes ». */
export const EMPTY_MY_GROUPS_TEXT_KEY = "reseau:groupesThematiques.emptyMyGroups"

/** Les sources d'un volet de groupes qui peuvent tomber en panne, chacune avec sa phrase. */
export type GroupsErrorSource = "invites" | "mine" | "discover" | "group" | "members" | "wall" | "candidates" | "transfer"

function errorKeys(source: GroupsErrorSource): { title: string; message: string } {
  return {
    title: `reseau:groupesThematiques.errors.${source}.title`,
    message: `reseau:groupesThematiques.errors.${source}.message`,
  }
}

/**
 * Ce qu'une PANNE dit, source par source — jamais l'état vide (R-08) : créer
 * un groupe n'est pas la réponse à une lecture qui a échoué, et un groupe
 * dont la fiche n'a pas pu être lue n'est pas « plus accessible ».
 *
 * Le vivier d'invitation (`candidates`, R-13) : une panne de lecture ne se dit
 * pas « vous n'avez aucune relation à inviter » — ce serait faux, et le geste
 * de réparation (chercher, réessayer) disparaîtrait avec la phrase.
 */
export const GROUPS_ERROR_TEXT_KEYS: Readonly<Record<GroupsErrorSource, { title: string; message: string }>> = Object.freeze({
  invites: errorKeys("invites"),
  mine: errorKeys("mine"),
  discover: errorKeys("discover"),
  group: errorKeys("group"),
  members: errorKeys("members"),
  wall: errorKeys("wall"),
  candidates: errorKeys("candidates"),
  // PG-02 : les modérateurs à qui transmettre la propriété — une panne n'est pas « aucun modérateur ».
  transfer: errorKeys("transfer"),
})

/**
 * Le libellé du bouton d'adhésion d'une carte, selon MON état vis-à-vis du
 * groupe. `null` : pas de bouton (déjà membre — la carte s'OUVRE, elle ne se
 * rejoint pas deux fois).
 */
export function joinCtaLabel(
  input: {
    myRole: ThematicGroupRole | null
    invited: boolean
    /** La version des règles en vigueur (PG-02) : un groupe qui en a ne se rejoint pas sans les lire. */
    rulesVersion?: number | null
  },
  t: TFunction,
): string | null {
  if (input.myRole !== null) return null
  if (entryRequiresRules(input.rulesVersion)) return t("reseau:groupesThematiques.join.readRules")
  return input.invited ? t("reseau:groupesThematiques.join.acceptInvite") : t("reseau:groupesThematiques.join.join")
}

/** « 3 invitations de groupe » — le bandeau au-dessus de l'annuaire. */
export function groupInvitesBannerLabel(count: number, t: TFunction): string | null {
  if (count <= 0) return null
  return t("reseau:groupesThematiques.invitesBanner", { count })
}

/**
 * Une personne sans profil publié n'a pas de nom à montrer : le moteur rend
 * `null` (jamais un état civil), l'écran dit un libellé neutre.
 */
export function groupPersonName(displayName: string | null, t: TFunction): string {
  const name = displayName?.trim()
  return name !== undefined && name.length > 0 ? name : t("reseau:groupesThematiques.unnamedPerson")
}

/** Les codes qui disent moins que la phrase du geste (refus indistinct, argument, conflit). */
const SILENT_ENGINE_CODES: readonly string[] = Object.freeze(["notFound", "invalidArgument", "conflict"])

/**
 * Le texte d'un geste refusé : la RÈGLE du domaine enfreinte (avec ses bornes),
 * sinon un code PARLANT du moteur (débit, rôle, adhésion…), sinon la phrase du
 * geste (`fallbackKey`, clé qualifiée). Jamais le message brut d'une erreur
 * serveur, qui porte une trace en développement et « Server Error » en
 * production.
 */
export function groupActionErrorText(error: unknown, fallbackKey: string, t: TFunction): string {
  const rule = engineErrorRule(error)
  if (rule !== null) return t(`rules:${rule.rule}`, rule.params)
  const code = engineErrorCode(error)
  if (code !== null && !SILENT_ENGINE_CODES.includes(code)) return t(`errors:${code}`)
  return t(fallbackKey)
}

// ═══════════════════════════════════════════════════════════════
// Inviter — le sélecteur de relations (R-13, 2026-09-06)
// ═══════════════════════════════════════════════════════════════
//
// L'invitation se faisait par HANDLE EXACT : il fallait connaître
// « @prenom.nom » par cœur, et le serveur rendait le même refus qu'on se soit
// trompé d'une lettre ou qu'on ait visé quelqu'un hors de son réseau. On
// choisit désormais dans SES relations, et l'écran dit ce qui est déjà fait —
// déjà membre, invitation en attente.

/**
 * La borne du vivier serveur (`INVITE_CANDIDATES_MAX` de
 * `thematicGroups.listInviteCandidates`) : au-delà, le vivier est TRONQUÉ — le
 * serveur le dit (`truncated`) — et la recherche serveur devient la seule voie
 * vers le reste (défaut IC-05).
 */
export const GROUP_INVITE_CANDIDATES_MAX = 200

/** Le bouton qui ouvre le sélecteur, dans la fiche du groupe. */
export const GROUP_INVITE_OPEN_LABEL_KEY = "reseau:groupesThematiques.invite.open"

/** L'intitulé de la surface elle-même (groupe de cases à cocher). */
export const GROUP_INVITE_PICKER_LABEL_KEY = "reseau:groupesThematiques.invite.picker"

/** Ce que dit le sélecteur quand il n'y a personne à proposer. */
export const GROUP_INVITE_EMPTY_TEXT_KEY = "reseau:groupesThematiques.invite.empty"

/**
 * La réponse du serveur à UNE invitation, rangée dans exactement une case.
 *
 * Le moteur rend toujours `alreadyInvited` ; la lecture reste tolérante à son
 * absence — une invitation, jamais un rappel inventé.
 */
export type InviteOutcomeKind = "invited" | "alreadyInvited" | "alreadyMember"

export function classifyInviteResult(result: { invited: boolean; alreadyInvited?: boolean }): InviteOutcomeKind {
  if (!result.invited) return "alreadyMember"
  return result.alreadyInvited === true ? "alreadyInvited" : "invited"
}

/** Le décompte d'un envoi groupé — une case par personne, jamais deux. */
export interface GroupInviteOutcome {
  invited: number
  alreadyInvited: number
  alreadyMember: number
  failed: number
}

/**
 * Ce que l'envoi a produit, en une phrase — dire « Invitations envoyées »
 * quand deux des trois personnes étaient déjà membres serait un mensonge
 * poli, et l'inviteur recommencerait.
 */
export function groupInviteReportLabel(outcome: GroupInviteOutcome, t: TFunction): string {
  const parts: string[] = []
  if (outcome.invited > 0) parts.push(t("reseau:groupesThematiques.inviteReport.invited", { count: outcome.invited }))
  if (outcome.alreadyInvited > 0) parts.push(t("reseau:groupesThematiques.inviteReport.alreadyInvited", { count: outcome.alreadyInvited }))
  if (outcome.alreadyMember > 0) parts.push(t("reseau:groupesThematiques.inviteReport.alreadyMember", { count: outcome.alreadyMember }))
  if (outcome.failed > 0) parts.push(t("reseau:groupesThematiques.inviteReport.failed", { count: outcome.failed }))
  if (parts.length === 0) return t("reseau:groupesThematiques.inviteReport.none")
  return t("reseau:groupesThematiques.inviteReport.sentence", { parts: parts.join(", ") })
}

// ═══════════════════════════════════════════════════════════════
// Gérer un groupe (PG-02)
// ═══════════════════════════════════════════════════════════════
//
// Le propriétaire pose des règles, transmet son rôle, ferme, archive ou
// supprime. Ces prédicats ne font que MONTRER : chaque geste est re-jugé au
// serveur (propriétaire vivant d'un groupe qui n'est pas celui d'une page).

/** L'état d'un groupe tel que le moteur le rend. */
export type GroupState = "active" | "closed" | "archived"

/**
 * Entrer exige-t-il d'accepter des règles ? Oui dès qu'une version est en
 * vigueur : la personne les voit AVANT « Rejoindre » (ou avant d'accepter une
 * invitation), et le serveur refuse une adhésion sans la version en vigueur.
 * Une réponse d'un moteur d'avant les règles (champ absent) n'en a pas.
 */
export function entryRequiresRules(rulesVersion: number | null | undefined): boolean {
  return typeof rulesVersion === "number"
}

/**
 * Un MEMBRE doit-il prendre connaissance de règles nouvelles ? Une version
 * nouvelle ne renvoie personne : la fiche la lui montre jusqu'à ce qu'il
 * l'accepte.
 */
export function memberMustReviewRules(input: { myRole: ThematicGroupRole | null; rulesVersion: number | null | undefined; myAcceptedRulesVersion: number | null | undefined }): boolean {
  return input.myRole !== null && entryRequiresRules(input.rulesVersion) && input.myAcceptedRulesVersion !== input.rulesVersion
}

/**
 * Le groupe ouvre-t-il encore ses actes de membre (publier, lire le mur,
 * inviter, voir les membres) ? Fermé ou archivé, le serveur les refuse tous.
 */
export function isGroupOpen(state: GroupState): boolean {
  return state === "active"
}

/** Ce que l'écran « Gérer le groupe » offre selon l'état : un groupe gelé garde l'archivage et la suppression. */
export function groupManageActions(state: GroupState): { rules: boolean; transfer: boolean; close: boolean; archive: boolean; delete: boolean } {
  const open = isGroupOpen(state)
  return { rules: open, transfer: open, close: open, archive: state !== "archived", delete: true }
}

/** Le bandeau d'un groupe fermé ou archivé (clé qualifiée) — `null` pour un groupe actif. */
export function groupStateNoticeKey(state: GroupState): string | null {
  switch (state) {
    case "closed":
      return "reseau:groupsPanel.state.closed"
    case "archived":
      return "reseau:groupsPanel.state.archived"
    case "active":
      return null
  }
}

/**
 * La suppression se confirme en saisissant le NOM du groupe (le motif de
 * l'effacement d'un compte, qui fait saisir un mot) : exact, espaces de bord
 * ignorés. Un nom vide ne confirme jamais rien.
 */
export function deleteConfirmationMatches(typed: string, groupName: string): boolean {
  const expected = groupName.trim()
  return expected.length > 0 && typed.trim() === expected
}
