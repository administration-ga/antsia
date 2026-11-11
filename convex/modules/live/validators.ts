// Dupliqué de socle/convex/modules/direct/validators.ts @ ad2e7fdc2 — adaptations : validateurs PRÉCIS dérivés des listes du domaine (`@antsia/social-domain/live/domain` et `/live/antenna`, une seule source pour les littéraux) ; ceux dont le vocabulaire est un TYPE d'un module pur porté tel quel (format de scène et état de capture de `replayComposition`, genre de délégation de `permissions`, rôle de connexion de `grants`) vérifiés contre lui À LA COMPILATION, dans les deux sens (`exactly`) ; audience « organisation » retirée, remplacée par `followers` — les abonnés et signataires vivants de la page qui signe la conférence (V36) ; invité désigné par une PERSONNE (`personId`) ; réactions et visibilité de rediffusion sur les validateurs communs du moteur (`reactionKindValidator`, `reachAudienceValidator`) ; ajouts : réponse de l'hôte à une main levée (le validateur local d'`antenna.ts`), décision de l'hôte sur l'enregistrement, rôle de CONNEXION rendu par `authorizeToken`.
/**
 * Validateurs du DIRECT (module `convex/modules/live`).
 *
 * Module sans fonction Convex enregistrée : les littéraux viennent du domaine
 * pur, que l'écran importe aussi — une seule définition de chaque vocabulaire.
 *
 * Le vocabulaire d'AUDIENCE prolonge celui de la PORTÉE (`public` |
 * `connections`, `PERSONAL_REACH_AUDIENCES`) : le direct appartient à une
 * personne, et son audience se juge avec les mêmes liens que le fil. Les deux
 * audiences de plus — `followers` (la page qui signe) et `invitees` (la liste
 * nominative) — arrivent chacune AVEC sa garde (`access.ts`) et ses refus de
 * forme ; c'est l'audience sans garde qui est interdite, pas l'audience de plus.
 */
import { DIRECT_ANTENNA_INVITE_STATES, DIRECT_ANTENNA_REQUEST_STATUSES, DIRECT_ANTENNA_RESPONSES } from "@antsia/social-domain/live/antenna"
import {
  DIRECT_ANTENNA_INVITATION_STATUSES,
  DIRECT_AUDIENCES,
  DIRECT_CHAT_MODES,
  DIRECT_COMMENT_STATUSES,
  DIRECT_END_REASONS,
  DIRECT_HOST_HEARTBEAT_STATES,
  DIRECT_HOST_LEASE_STATES,
  DIRECT_HOST_STATES,
  DIRECT_INVITEE_STAGE_ROLES,
  DIRECT_REPLAY_DECISIONS,
  DIRECT_REPLAY_PUBLICATIONS,
  DIRECT_REPLAY_STATUSES,
  DIRECT_SPEAKER_ROLES,
  DIRECT_STAGE_LAYOUTS,
  DIRECT_STATUSES,
} from "@antsia/social-domain/live/domain"
import type { DirectDelegationKind } from "@antsia/social-domain/live/permissions"
import { DIRECT_REPLAY_CAPTIONS_LANGS, DIRECT_REPLAY_FAILURE_REASONS } from "@antsia/social-domain/live/replayComposition"
import type { DirectReplayEgressState, DirectStageFormat } from "@antsia/social-domain/live/replayComposition"
import { v } from "convex/values"

import { literals, reachAudienceValidator, reactionKindValidator } from "../../lib/validators"
import type { DirectConnectionRole } from "./grants"

/**
 * La liste des littéraux d'un vocabulaire porté par un TYPE du domaine (module
 * pur gardé tel quel, sans liste) : elle ne compile que si elle le couvre
 * EXACTEMENT — un littéral en trop, ou un membre du type oublié, est refusé.
 */
function exactly<Domain extends string>() {
  return <const T extends readonly [Domain, ...Domain[]]>(values: T & ([Domain] extends [T[number]] ? unknown : never)): T => values
}

/** L'audience d'un DIRECT — `public`, `connections`, `followers` (page), `invitees`. */
export const directAudienceValidator = literals(DIRECT_AUDIENCES)

/**
 * Ce qu'un INVITÉ fait à la conférence (ADR-0150) : il la regarde, ou il y
 * intervient. `speaker` ne crée AUCUNE ligne `liveSpeakers` à la création :
 * la promotion a lieu au passage en live, après que ses gardes ont été
 * rejouées.
 */
export const directInviteeStageRoleValidator = literals(DIRECT_INVITEE_STAGE_ROLES)

/** Une entrée de la liste d'invités reçue à la création. */
export const directInviteeInputValidator = v.object({
  personId: v.id("persons"),
  stageRole: directInviteeStageRoleValidator,
})

/** Cycle de vie d'une session : `scheduled` → `live` → `ended` (`DIRECT_STATUSES`). */
export const directStatusValidator = literals(DIRECT_STATUSES)

/**
 * L'état du BAIL de présence de l'hôte (`liveHostPresence`, D-14).
 *
 * `connected` et `reconnecting` sont DÉCLARÉS par le client à chaque
 * battement ; `absent` est CONSTATÉ par la récolte quand le bail s'éteint —
 * jamais reçu du client, qui par définition ne bat plus.
 */
export const directHostPresenceStateValidator = literals(DIRECT_HOST_LEASE_STATES)

/** Ce que le client a le droit de DÉCLARER — `absent` ne se déclare pas. */
export const directHostHeartbeatStateValidator = literals(DIRECT_HOST_HEARTBEAT_STATES)

/**
 * Pourquoi une session s'est terminée. Champ OPTIONNEL : l'écran doit savoir
 * dire « terminée » sans raison plutôt qu'en inventer une.
 */
export const directEndReasonValidator = literals(DIRECT_END_REASONS)

/**
 * L'état de l'hôte RENDU à l'écran — dérivé du bail, jamais stocké.
 * `unknown` = aucune ligne de bail : la règle des 4 h reste seule juge, et
 * l'écran ne prétend rien.
 */
export const directHostStateValidator = literals(DIRECT_HOST_STATES)

/** Le chat du direct : ouvert à l'audience, ou fermé (personne n'écrit, pas même l'hôte). */
export const directChatModeValidator = literals(DIRECT_CHAT_MODES)

/**
 * Format de scène choisi par l'hôte à la création du direct — la SOURCE émise.
 * Vocabulaire volontairement fermé : il pilote une composition d'interface et
 * celle de l'enregistrement (`replayComposition`), pas une chaîne libre.
 */
export const directStageFormatValidator = literals(exactly<DirectStageFormat>()(["television", "computer", "mobile"]))

/**
 * Disposition de la scène chez le LECTEUR — un choix de l'hôte, pas un ratio.
 * ⚠️ À ne pas confondre avec `stageFormat`, qui décrit la SOURCE émise.
 */
export const directStageLayoutValidator = literals(DIRECT_STAGE_LAYOUTS)

/**
 * Rôle d'un INTERVENANT (table `liveSpeakers`). Le spectateur n'y figure
 * jamais : il n'a pas de ligne durable, seulement un jeton borné (1 h).
 */
export const directSpeakerRoleValidator = literals(DIRECT_SPEAKER_ROLES)

/**
 * Le GENRE d'une délégation de gestion (table `liveDelegations`, D-11).
 *
 * ⚠️ Volontairement DISJOINT de `directSpeakerRoleValidator` : celui-ci dit qui
 * PUBLIE, celui-là qui GÈRE. Le genre ne DÉCIDE aucune permission (cf.
 * `permissions.ts`) : les trois drapeaux de la ligne le font. Il nomme la
 * fonction et fixe les défauts.
 */
export const directDelegationKindValidator = literals(exactly<DirectDelegationKind>()(["cohost", "moderator"]))

/** Statut d'une MAIN LEVÉE. */
export const directAntennaRequestStatusValidator = literals(DIRECT_ANTENNA_REQUEST_STATUSES)

/** Ce que l'hôte RÉPOND à une main levée. */
export const directAntennaResponseValidator = literals(DIRECT_ANTENNA_RESPONSES)

/**
 * Statut d'une INVITATION à l'antenne : `revoked` (acte de l'hôte) et
 * `expired` (écoulement du temps) ne disent pas la même chose que `declined`
 * (acte de l'invité). Aucun ne consomme une place.
 */
export const directAntennaInvitationStatusValidator = literals(DIRECT_ANTENNA_INVITATION_STATUSES)

/**
 * L'état d'une personne VIS-À-VIS d'une invitation à l'antenne — ce que la
 * console de l'hôte affiche par ligne (D-10) : éligibilité et intention déjà
 * exprimée dans une seule union.
 */
export const directAntennaInviteStateValidator = literals(DIRECT_ANTENNA_INVITE_STATES)

/** Statut d'un commentaire — retiré, pas supprimé (même règle que le fil) ; DL-03 : retenu pour relecture. */
export const directCommentStatusValidator = literals(DIRECT_COMMENT_STATUSES)

/**
 * Genres de réaction : LES MÊMES que le fil. Un cinquième genre ici créerait
 * deux vocabulaires pour un même geste social.
 */
export const directReactionKindValidator = reactionKindValidator

/**
 * Visibilité du REPLAY. Même vocabulaire que la portée (`public` |
 * `connections`) — la règle (« ne peut que restreindre ») est jugée par le
 * domaine (`isReplayVisibilityAllowed`), pas par le validateur.
 */
export const directReplayVisibilityValidator = reachAudienceValidator

/**
 * Ce que l'HÔTE a décidé de l'enregistrement une fois la conférence terminée
 * (ADR-0158) : `undecided`, `private`, `published`. ABSENT = `published`
 * (`effectiveReplayPublication`).
 */
export const directReplayPublicationValidator = literals(DIRECT_REPLAY_PUBLICATIONS)

/** La RÉPONSE de l'hôte à « que faire de l'enregistrement ? » — `discard` est le retrait. */
export const directReplayDecisionValidator = literals(DIRECT_REPLAY_DECISIONS)

/** Statut du replay — piloté par l'Egress LiveKit via le webhook HTTP. */
export const directReplayStatusValidator = literals(DIRECT_REPLAY_STATUSES)

/**
 * L'état OPÉRATIONNEL de la capture — le cycle de vie de l'Egress LUI-MÊME,
 * distinct du statut durable du fichier ci-dessus (D-12) :
 *  · `requested` — `attachEgress` a posé la corrélation, LiveKit n'a rien confirmé ;
 *  · `active`    — `egress_started`/`egress_updated` reçus : la capture tourne ;
 *  · `stopping`  — un arrêt a été demandé (réconciliation d'un Egress orphelin) ;
 *  · `stopped`   — `egress_ended` traité ; le fichier suit ou ne viendra pas.
 *
 * La vue rendue à l'écran est DÉRIVÉE de ce champ et du statut
 * (`replayComposition.directReplayEgressView`), jamais stockée deux fois.
 */
export const directReplayEgressStateValidator = literals(exactly<DirectReplayEgressState>()(["requested", "active", "stopping", "stopped"]))

/**
 * La COMPOSITION effectivement demandée à LiveKit, photographiée au démarrage
 * de l'Egress — pour qu'une recette puisse comparer le FICHIER à la DÉCISION.
 */
export const directReplayCompositionValidator = v.object({
  layout: v.string(),
  width: v.number(),
  height: v.number(),
})

/**
 * Le rôle de CONNEXION à la salle (`grants.DirectConnectionRole`) — pas le rôle
 * durable : `speaker` publie (hôte et intervenants), `viewer` regarde.
 */
export const directConnectionRoleValidator = literals(exactly<DirectConnectionRole>()(["viewer", "speaker"]))

/** POURQUOI aucune rediffusion ne sera produite — un code du vocabulaire fermé, jamais une phrase. */
export const directReplayFailureReasonValidator = literals(DIRECT_REPLAY_FAILURE_REASONS)

/** La langue DÉCLARÉE d'une piste de sous-titres — un code du vocabulaire fermé. */
export const directReplayCaptionsLangValidator = literals(DIRECT_REPLAY_CAPTIONS_LANGS)
