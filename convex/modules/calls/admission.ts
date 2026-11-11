// Dupliqué de socle/convex/modules/iappel/admission.ts @ ad2e7fdc2 — adaptations : décideur PUR du moteur ; ordre `outside_relations` → `dnd` → `in_meeting` → `busy` → `offline` conservé ; horaires de poste, passe-droits d'autorité et de priorité, portée poste / personnel du silence (`silenceApplies`) et secrétariat retirés ; plus de phrase composée pour l'appelant (`callerMessageFor`, `labelOf`, `secretariatUnavailableMessage`, `filteredPosteMessage`) : la décision rend la RAISON, l'écran la dit dans sa langue avec le nom qu'il affiche ; « hors ligne » constaté sur la présence du RÉSEAU de l'appel (le socle le réservait au poste). ; IC-04 : « hors de mes relations » n'est plus dit à l'appelant (écran neutre « sans réponse »), ce qui est révélé est documenté ci-dessous.
/**
 * Appels — UN APPEL DOIT-IL SONNER ?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN REFUS EST UNE VALEUR, PAS UNE EXCEPTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La décision est prise AVANT d'insérer l'appel. Quand elle refuse, la mutation
 * n'échoue pas : elle inscrit l'appel déjà terminé (le journal des deux côtés)
 * et RETOURNE la raison. Un refus porté par une exception arriverait comme une
 * panne ; et un appel refusé DOIT laisser une trace, sans quoi l'appelé ne
 * saurait jamais qu'on a cherché à le joindre pendant son silence.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ON RÉVÈLE À L'APPELANT — ET CE QU'ON TAIT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  · la DURÉE d'un « ne pas déranger » : NON — dire « jusqu'à 14 h » renseignerait
 *    sur l'emploi du temps de qui vient de demander qu'on le laisse en paix ;
 *  · « déjà en ligne » : OUI, c'est la tonalité « occupé » de tout téléphone —
 *    et le défaut ADMET l'appel en attente : seul qui a coupé ce signal la reçoit ;
 *  · « en réunion » : seulement si la personne a activé le silence automatique ;
 *  · « hors ligne » : OUI — prévenir tout de suite vaut mieux que deux minutes de
 *    sonnerie dans le vide ; posé preuves en main seulement (`evaluate.ts`) ;
 *  · « ne reçoit les appels que de ses relations » : NON depuis IC-04 — c'est
 *    le défaut du moteur (décision du propriétaire du 9/11/2026) ; la raison
 *    reste rendue à l'écran, qui la dit à l'appelant comme un appel SANS
 *    RÉPONSE (écran de fin, journal de l'appelant : `history.ts`), et seul
 *    l'appelé lit pourquoi son téléphone n'a pas sonné. Aucune messagerie
 *    vocale n'est offerte sur ce refus.
 *
 * Module PUR : aucun `ctx`. Le serveur rassemble les faits, ce module tranche.
 */
import type { CallAdmissionReason } from "@antsia/social-domain/callJournal"

/** Les réglages d'appel du DESTINATAIRE, tels que la table les porte. */
export interface AdmissionPreferences {
  dnd?: { until: number } | null
  callWaiting?: boolean
  autoMeetingDnd?: { enabled: boolean } | null
}

export interface AdmissionInput {
  now: number
  prefs: AdmissionPreferences | null
  /** Appels déjà tenus par le destinataire dans le réseau (décrochés ou parqués). */
  calleeActiveCallCount: number
  /** Un évènement ACCEPTÉ de son agenda est-il en cours ? (calculé par le serveur, seulement si le réglage est actif) */
  inMeeting?: boolean
  /**
   * Le serveur a la PREUVE que le destinataire est hors ligne. Absent ou
   * `false` = on ne sait pas = l'appel sonne : le fail-open est ici un contrat.
   */
  calleeKnownOffline?: boolean
  /**
   * Le réglage « hors de mes relations » de l'appelé, et ce que le serveur sait
   * de l'appelant face à lui. `callerIsRelation: null` = on ne sait pas — l'appel
   * sonne (même contrat que `calleeKnownOffline`).
   */
  strangerPolicy?: { silent: boolean; callerIsRelation: boolean | null }
}

export type AdmissionDecision = { admitted: true } | { admitted: false; reason: CallAdmissionReason }

/**
 * L'appel passe-t-il ? Ordre d'évaluation, du plus explicite au plus
 * circonstanciel — le premier refus l'emporte :
 *   0. « hors de mes relations » : un périmètre déclaré, qui se prononce avant
 *      tout état — dire « indisponible » à un inconnu lui ferait croire qu'il
 *      rappellera plus tard avec succès ;
 *   1. « ne pas déranger », posé à la main : une volonté déclarée ;
 *   2. le silence automatique de réunion : une volonté déléguée à l'agenda ;
 *   3. « déjà en ligne » : une circonstance, la plus faible des réglages ;
 *   4. « hors ligne » : un état TECHNIQUE, constaté et jamais choisi — tout
 *      réglage délibéré parle donc avant lui.
 */
export function decideCallAdmission(input: AdmissionInput): AdmissionDecision {
  const prefs = input.prefs

  const stranger = input.strangerPolicy ?? null
  if (stranger !== null && stranger.silent && stranger.callerIsRelation === false) return { admitted: false, reason: "outside_relations" }

  // Un `until` dépassé est simplement ignoré : on ne nettoie pas la base depuis
  // une décision, et un réglage expiré n'a plus d'effet.
  const dnd = prefs?.dnd ?? null
  if (dnd !== null && dnd.until > input.now) return { admitted: false, reason: "dnd" }

  const auto = prefs?.autoMeetingDnd ?? null
  if (input.inMeeting === true && auto !== null && auto.enabled) return { admitted: false, reason: "in_meeting" }

  // Le défaut ADMET : le second appel se présente « en attente », et c'est le
  // destinataire qui arbitre. Seul un réglage explicite renvoie « occupé ».
  if (input.calleeActiveCallCount > 0 && prefs?.callWaiting === false) return { admitted: false, reason: "busy" }

  // La sémantique aval est « manqué », pas « refusé » : être absent n'est pas refuser.
  if (input.calleeKnownOffline === true) return { admitted: false, reason: "offline" }

  return { admitted: true }
}
