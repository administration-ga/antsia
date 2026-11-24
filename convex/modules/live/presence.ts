// Dupliqué de socle/convex/modules/direct/presence.ts @ ad2e7fdc2 — adaptations : constructeur `networkMutation` (battre exige l'adhésion `declaree`, celle du jeton ; partir, qui ne fait que rendre, est ouvert à tout membre actif `en_attente`) — les refus du CONSTRUCTEUR (non-membre, suspendu) lèvent comme partout dans le moteur, le silence uniforme vaut au-delà ; session lue DANS le réseau de l'appel (inconnue, d'un autre réseau, plus en direct : le même `{ accepted: false }`, sans écriture) ; table `liveViewerGrants`, personne (`personId`) au lieu de l'utilisateur ; débit `live.presence` (D14) consommé juste AVANT l'écriture du battement, son refus ATTRAPÉ et rendu comme tous les autres refus (aucune écriture, jamais une exception : `enforceRateLimit` lève) par `beatWithinRateLimit`, partagé avec le bail de l'hôte ; `leave` sans seau (il n'écrit qu'après un battement ou un jeton, eux bornés) ; compteurs servis par `liveSessionCounters` (écrivain unique `reap`, D28) au lieu de la session ; commentaires rapportés au moteur.
/**
 * LE BAIL DE PRÉSENCE DES SPECTATEURS — D-09.
 * API publique : `api.modules.live.presence.*`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'IL CORRIGE : « 200 SPECTATEURS » ÉTAIT UN CUMUL D'ENTRÉES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rien ne disait à ce module qu'une personne était PARTIE : pas de webhook
 * LiveKit de participant, pas de battement, pas de `leave`. La capacité se
 * jugeait donc sur le cumul des personnes distinctes admises depuis le début,
 * si bien qu'un direct de 200 places refusait le 201ᵉ visiteur devant une salle
 * vide, et que l'écran annonçait « 200 spectateurs » là où il n'en restait trois.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OÙ LE BATTEMENT S'ÉCRIT — ET SURTOUT OÙ IL NE S'ÉCRIT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ces deux mutations n'écrivent QUE la ligne `liveViewerGrants` de l'appelant.
 * Jamais `liveSessions` : chaque écriture de la session fait re-tourner la
 * souscription `sessions.get` de TOUS les spectateurs — deux cents personnes
 * réveillées trois fois par minute pour un chiffre qui n'a pas bougé. Jamais
 * `liveSessionCounters` non plus : c'est la même règle que les réactions
 * (chacun sa ligne) et que le bail de l'hôte (sa table), et c'est elle qui rend
 * la présence possible du tout. Le TOTAL est recomposé ailleurs, par l'écrivain
 * unique (`reap.recomputeAggregates`, D28).
 *
 * Corollaire : AUCUNE query de ce module n'expose `liveViewerGrants` aux
 * spectateurs. Un abonnement sur cette table s'invaliderait à chaque battement
 * de chaque personne — leçon de la présence des appels. Le nombre de présents
 * voyage dans les compteurs de la session (`liveSessionCounters`), qui ne
 * bougent qu'à la recomposition.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NE LÈVE JAMAIS — ET NE GARDE POURTANT RIEN D'OUVERT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un battement est un bruit de fond : lever une exception toutes les trente
 * secondes à qui vient d'être exclu, dont le direct vient de finir ou dont
 * l'onglet a été rouvert sur une session inconnue ne réparerait rien et
 * remplirait les journaux. Les deux fonctions rendent donc une VALEUR
 * (`accepted` / `released`), la même pour tous les refus — ce silence uniforme
 * est aussi l'anti-énumération du module. Le seau de débit (`live.presence`)
 * n'y fait pas exception : au-delà du seuil, le battement est refusé comme les
 * autres, sans écrire.
 *
 * ⚠️ Seule la garde du CONSTRUCTEUR lève (réseau inconnu, non-membre,
 * adhésion suspendue ou insuffisante) — c'est la règle de toute fonction du
 * moteur, et l'écran tire ce battement sans rien attendre de sa réponse.
 *
 * ⚠️ Ce n'est pas une porte ouverte, et c'est ce qui permet de se passer ici
 * d'`assertVisibleDirectSession` (qui, elle, refuse en levant) : le battement
 * ne fait qu'écrire la ligne de l'APPELANT, et cette ligne n'existe que si
 * `authorizeToken` l'a créée — après adhésion, session live du réseau,
 * audience, blocage, exclusion, débit, rôle et capacité. Sans admission, no-op.
 * Le lien à l'objet est donc porté par la lecture indexée sur
 * `ctx.person._id`, écrite VISIBLEMENT dans chaque handler (la déporter dans un
 * helper la rendrait invisible au lecteur).
 *
 * ⚠️ MULTI-ONGLETS : dédoublonné par construction. Une personne = une ligne ;
 * deux onglets écrivent la même. Un `leave` émis par l'un est effacé par le
 * battement suivant de l'autre (≤ 30 s) — la place n'est jamais perdue par
 * celui qui est resté.
 *
 * ⚠️ EXCLUSION : ces mutations ne relisent PAS l'exclusion, à dessein — une
 * lecture de plus sur le chemin chaud, deux fois par minute et par personne.
 * L'exclusion sort l'exclu de la salle du serveur multimédia : son client cesse
 * d'être connecté, donc de battre, et sa place revient au TTL. Il ne peut de
 * toute façon plus obtenir de jeton.
 */
import { v } from "convex/values"

import { networkMutation } from "../../lib/functions"
// Le seau d'un battement, consommé sans lever : un seul endroit, partagé avec la présence des appels.
import { beatWithinRateLimit } from "../../lib/rateLimit"
import { DIRECT_PRESENCE_TTL_MS } from "./domain"

/**
 * BATTRE. Le spectateur admis, sur une session EN DIRECT de ce réseau.
 *
 * `{ accepted: false }` couvre indistinctement la session inconnue, celle d'un
 * autre réseau, la session qui n'est plus en direct, l'appelant sans admission
 * (jamais entré, ou entré sur une autre session) et le battement de trop (seau
 * `live.presence`). Aucune écriture dans ces cas — un battement ne CRÉE jamais
 * une place, il ne fait que tenir celle qui a été accordée.
 */
export const heartbeat = networkMutation({
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ accepted: boolean; presentUntil: number | null }> => {
    const refused = { accepted: false, presentUntil: null } as const
    const session = await ctx.db.get(args.sessionId)
    if (session === null || session.networkId !== ctx.networkId) return refused
    // Battre sur une conférence terminée ne tient aucune place : la
    // recomposition met les présents à zéro dès la transition.
    if (session.status !== "live") return refused

    // ⚠️ Lecture ANCRÉE sur l'appelant, écrite ici et non dans un helper : le
    // lien à l'objet doit rester sous les yeux du lecteur.
    const grant = await ctx.db
      .query("liveViewerGrants")
      .withIndex("by_session_person", (q) => q.eq("sessionId", args.sessionId).eq("personId", ctx.person._id))
      .unique()
    if (grant === null) return refused

    // DÉBIT (D14) — juste avant l'écriture : un refus ne coûte rien, et le
    // battement de trop se tait comme les autres.
    if (!(await beatWithinRateLimit(ctx, "live.presence", ctx.person._id))) return refused

    const now = Date.now()
    // Revenir après un départ volontaire est un RETOUR : la ligne est la
    // même, `leftAt` tombe. La place, elle, a pu être reprise entre-temps —
    // c'est `authorizeToken` qui en juge, jamais un battement.
    await ctx.db.patch(grant._id, {
      lastSeenAt: now,
      leftAt: undefined,
    })
    return { accepted: true, presentUntil: now + DIRECT_PRESENCE_TTL_MS }
  },
})

/**
 * PARTIR. Le départ VOLONTAIRE — la seule chose qui libère une place sans
 * attendre les quatre-vingt-dix secondes du bail.
 *
 * Idempotente et silencieuse : sans admission, sans session (ou session d'un
 * autre réseau), ou déjà partie, elle rend `{ released: false }` et n'écrit rien.
 *
 * ⚠️ Aucune condition de statut, contrairement au battement : une conférence
 * peut se terminer pendant qu'on la quitte, et refuser d'enregistrer le départ
 * laisserait une ligne « présente » sur une session close.
 *
 * ⚠️ Pas de seau : partir n'écrit que si la ligne n'est pas DÉJÀ partie, et
 * seuls un battement ou un jeton — tous deux bornés — la font revenir. Ouvert à
 * tout membre actif (`en_attente` compris) : rendre sa place ne donne rien.
 */
export const leave = networkMutation({
  writeBucket: "live.leave",
  minStatus: "en_attente",
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ released: boolean }> => {
    const session = await ctx.db.get(args.sessionId)
    if (session === null || session.networkId !== ctx.networkId) return { released: false }

    const grant = await ctx.db
      .query("liveViewerGrants")
      .withIndex("by_session_person", (q) => q.eq("sessionId", args.sessionId).eq("personId", ctx.person._id))
      .unique()
    if (grant === null || grant.leftAt !== undefined) {
      return { released: false }
    }

    // ⚠️ On ne SUPPRIME pas la ligne : elle porte l'admission
    // (`firstGrantedAt`), que la console de modération lit et que l'agrégat des
    // admissions compte. Partir n'efface pas être venu — même doctrine que
    // `removedAt` sur un intervenant et `liftedAt` sur une exclusion.
    await ctx.db.patch(grant._id, { leftAt: Date.now() })
    return { released: true }
  },
})
