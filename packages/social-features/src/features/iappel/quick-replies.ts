/**
 * IC-04 — les réponses rapides proposées quand la personne n'en a JAMAIS réglé (le moteur rend
 * alors `null`, et l'écran propose les siennes, traduites). Module pur : la sonnerie
 * (`use-incoming-calls.ts`) et la rubrique iCom des réglages d'antsia.ga lisent la même liste ;
 * la rubrique ne les enregistre que si la personne les change.
 */
export const DEFAULT_QUICK_REPLY_KEYS = [
	"iappel:useIncomingCalls.defaultQuickReplies.callBack",
	"iappel:useIncomingCalls.defaultQuickReplies.inMeeting",
	"iappel:useIncomingCalls.defaultQuickReplies.cannotAnswer",
] as const
