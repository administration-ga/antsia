// Dupliqué de socle/convex/modules/direct/hostPresence.ts @ ad2e7fdc2 — adaptations : constructeurs `networkMutation` / `networkQuery` — les refus du CONSTRUCTEUR (non-membre, suspendu) lèvent comme partout dans le moteur, le battement garde son silence uniforme au-delà ; session lue DANS le réseau de l'appel (inconnue, d'un autre réseau : le même `{ accepted: false }`, sans écriture) ; table `liveHostPresence` (avec `networkId`, copié de la session), personne (`hostPersonId`) au lieu de l'utilisateur ; débit `live.hostPresence` (D14) consommé juste AVANT l'écriture, son refus ATTRAPÉ et rendu comme les autres refus (`beatWithinRateLimit`, `lib/rateLimit.ts`) ; `presence` reçoit l'instant de l'ÉCRAN (`now`, D16 : plus de `Date.now()` dans une query — l'écran l'arrondit à la seconde et re-dérive de toute façon à sa montre) et voit par le lecteur du réseau (`assertVisibleDirectSession(ctx, directCaller(ctx), …)`, refus indistinct `notFound`) ; `loadHostLease` / `leaseFacts` désormais AUSSI lus par la récolte (la raison du socle pour s'en passer — des tests du client qui importaient `reap` — n'existe pas dans le moteur) ; commentaires rapportés au moteur.
/**
 * Le BAIL DE PRÉSENCE DE L'HÔTE — D-14.
 * API publique : `api.modules.live.hostPresence.*`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UNE TABLE À PART, ET PAS UN CHAMP SUR LA SESSION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `reap.ts` refusait tout battement, et sa raison était juste : écrire
 * `liveSessions` toutes les quinze secondes ferait re-tourner la souscription
 * `sessions.get` de CHAQUE spectateur, à chaque pulsation. La conclusion tirée
 * à l'époque ne l'était pas : on en avait déduit qu'il ne fallait pas de
 * présence du tout, alors qu'il fallait seulement ne pas l'écrire là. Le bail
 * vit donc dans `liveHostPresence` (une ligne par session, index `by_session`)
 * — même doctrine que la présence des appels, sans portée d'organisation.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX FONCTIONS, DEUX PUBLICS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  · `heartbeat` — L'HÔTE SEUL, et il ne LÈVE jamais (passé la garde du
 *    constructeur, celle de toute fonction du moteur). Un battement est un
 *    bruit de fond : le refuser par une exception ferait remonter une erreur
 *    toutes les quinze secondes à qui vient d'être rétrogradé, dont le direct
 *    vient de finir, ou qui a changé d'onglet. Il rend `{ accepted: false }`,
 *    LE MÊME pour « session inconnue », « autre réseau », « pas l'hôte », « pas
 *    en direct » et « battement de trop » (seau `live.hostPresence`) — ce
 *    silence uniforme est aussi l'anti-énumération du module.
 *  · `presence` — TOUTE la salle, sous la garde de visibilité de
 *    `sessions.get` (`assertVisibleDirectSession`) : qui ne voit pas la
 *    session ne saura pas non plus si son hôte est là.
 *
 * ⚠️ `presence` ne rend qu'un INSTANTANÉ de `hostState`, dérivé à l'instant que
 * l'ÉCRAN fournit (`now`) : une query Convex ne re-tourne pas parce que
 * l'horloge avance, et elle ne lit pas l'horloge (D16). Elle rend donc AUSSI
 * les faits bruts du bail (`state`, `leaseUntil`, `lastSeenAt`), et c'est le
 * client qui re-dérive à chaque tick — sans quoi un hôte disparu resterait « En
 * direct » à l'écran jusqu'à la prochaine écriture.
 */
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { networkMutation, networkQuery } from "../../lib/functions"
import { beatWithinRateLimit } from "../../lib/rateLimit"
import { assertVisibleDirectSession, directCaller } from "./access"
import { DIRECT_HOST_LEASE_MS, deriveDirectHostState, type DirectHostLease, type DirectHostPresenceView } from "./domain"
import { directHostHeartbeatStateValidator } from "./validators"

/**
 * La ligne de bail d'une session — lecture INDEXÉE (`by_session`), jamais un
 * balayage, et UNE seule ligne par construction. Un seul chemin de lecture,
 * partagé par la query de présence, le battement et la récolte.
 */
export async function loadHostLease(ctx: Pick<QueryCtx, "db">, sessionId: Id<"liveSessions">): Promise<Doc<"liveHostPresence"> | null> {
  return await ctx.db
    .query("liveHostPresence")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique()
}

/** La ligne réduite à ce que le domaine juge — jamais le document entier. */
export function leaseFacts(row: Doc<"liveHostPresence"> | null): DirectHostLease | null {
  if (row === null) return null
  return {
    state: row.state,
    lastSeenAt: row.lastSeenAt,
    leaseUntil: row.leaseUntil,
    ...(row.absentSince !== undefined ? { absentSince: row.absentSince } : {}),
  }
}

export type DirectHostPresenceDto = DirectHostPresenceView & {
  /**
   * Les faits BRUTS du bail — c'est avec eux que le client re-dérive à sa
   * montre. `null` quand aucune ligne n'existe : l'écran ne prétend rien, et
   * la règle des 4 h reste seule juge (fail-open, cf. `reap.ts`).
   */
  lease: {
    state: "connected" | "reconnecting" | "absent"
    lastSeenAt: number
    leaseUntil: number
    absentSince: number | null
  } | null
}

/**
 * BATTRE. L'hôte, sur une session EN DIRECT de ce réseau, et personne d'autre.
 *
 * Ne lève jamais (passé le constructeur) : `{ accepted: false }` couvre
 * indistinctement la session inconnue ou d'un autre réseau, l'appelant qui
 * n'est pas l'hôte, la session qui n'est plus en direct et le battement de
 * trop. Une ligne UNIQUE par session — insérée au premier battement, puis
 * réécrite ; jamais empilée.
 */
export const heartbeat = networkMutation({
  args: {
    sessionId: v.id("liveSessions"),
    state: directHostHeartbeatStateValidator,
  },
  handler: async (ctx, args): Promise<{ accepted: boolean; leaseUntil: number | null }> => {
    const refused = { accepted: false, leaseUntil: null } as const
    const session = await ctx.db.get(args.sessionId)
    if (session === null || session.networkId !== ctx.networkId) return refused
    // L'ANCRAGE : le battement est un acte de l'hôte SUR SA session. Cette
    // comparaison est plus stricte que la garde de visibilité — un hôte voit
    // toujours sa session —, et elle ne lève pas, ce qu'il faut ici.
    if (session.hostPersonId !== ctx.person._id) return refused
    if (session.status !== "live") return refused

    // DÉBIT (D14) — juste avant l'écriture : un refus ne coûte rien, et le
    // battement de trop se tait comme les autres.
    if (!(await beatWithinRateLimit(ctx, "live.hostPresence", ctx.person._id))) return refused

    const now = Date.now()
    const leaseUntil = now + DIRECT_HOST_LEASE_MS
    const existing = await loadHostLease(ctx, args.sessionId)

    if (existing === null) {
      await ctx.db.insert("liveHostPresence", {
        networkId: session.networkId,
        sessionId: args.sessionId,
        hostPersonId: ctx.person._id,
        state: args.state,
        lastSeenAt: now,
        leaseUntil,
        updatedAt: now,
      })
      return { accepted: true, leaseUntil }
    }

    await ctx.db.patch(existing._id, {
      hostPersonId: ctx.person._id,
      state: args.state,
      lastSeenAt: now,
      leaseUntil,
      // L'hôte est REVENU : l'absence constatée n'a plus cours. La laisser
      // ferait dire « interrompue » à une conférence qui parle.
      absentSince: undefined,
      updatedAt: now,
    })
    return { accepted: true, leaseUntil }
  },
})

/**
 * LIRE la présence de l'hôte, à l'instant fourni par l'écran (arrondi à la
 * seconde : la souscription reste cachable ; un `now` mensonger ne trompe que
 * celui qui le ment, et l'écran re-dérive de toute façon). Même garde de
 * visibilité que `sessions.get` : un tiers hors audience reçoit le refus
 * indistinct (`notFound`).
 */
export const presence = networkQuery({
  args: { sessionId: v.id("liveSessions"), now: v.number() },
  handler: async (ctx, args): Promise<DirectHostPresenceDto> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)

    const row = await loadHostLease(ctx, session._id)

    const view = deriveDirectHostState(leaseFacts(row), args.now)
    return {
      ...view,
      lease:
        row === null
          ? null
          : {
              state: row.state,
              lastSeenAt: row.lastSeenAt,
              leaseUntil: row.leaseUntil,
              absentSince: row.absentSince ?? null,
            },
    }
  },
})
