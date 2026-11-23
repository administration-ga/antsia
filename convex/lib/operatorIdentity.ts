/**
 * PA7 : l'autorité de console appartient à une session IDN, pas à un ancien lien de profil.
 * ADR-0039 : le niveau de garantie exigé est `CONSOLE_MIN_LOA` (1), non plus 2.
 * ADR-0042 : la vivacité d'une preuve de session (`isLiveIdnSession`, `liveIdnSessionProofOrNull`)
 * est COMMUNE à la console et à l'administration d'un réseau (`lib/networkAdminIdentity.ts`).
 * Revue CH-815, constat F3 : la console est LIÉE à son application. Une preuve n'ouvre la console que
 * si elle a été scellée pour l'application que le catalogue déclare console (`operator_console`,
 * `betterAuth/settings.isOperatorConsoleApplication`) ; une preuve d'une application des membres, du
 * site public, de l'administration d'un réseau, du natif ou d'avant ADR-0042 (sans application) ne
 * l'ouvre jamais, même si son accès avait été journalisé.
 */
import { CONSOLE_MIN_LOA } from "@antsia/social-domain/badges"

import { components } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { isOperatorConsoleApplication } from "../betterAuth/settings"
import { fail } from "./errors"
import { getActiveIdentity } from "./session"

type IdentityCtx = Pick<QueryCtx, "db" | "runQuery">

export function requirePlatformAdmin(actor: { operator: Doc<"operators"> }): void {
  if (actor.operator.role !== "platform_admin") fail("operatorRequired")
}

export async function hasCurrentIdnLink(ctx: Pick<QueryCtx, "db">, person: Doc<"persons">, subject: string): Promise<boolean> {
  const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", person._id).eq("provider", "idn")).unique()
  const proof = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", subject)).unique()
  // Un lien ou une preuve sans niveau reste refusé : `0` n'atteint jamais le seuil.
  return Boolean(link && link.revokedAt === undefined && link.subject === subject && (link.loa ?? 0) >= CONSOLE_MIN_LOA && (proof?.loa ?? 0) >= CONSOLE_MIN_LOA)
}

/**
 * La preuve est-elle VIVANTE pour cette personne : même utilisateur, garantie au seuil de la console,
 * non expirée, lien IDN courant au même sujet, aucune suspension à la racine, session Better Auth
 * vivante ? Ni la console, ni l'administration d'un réseau : la seule vivacité, que chacune complète.
 */
export async function isLiveIdnSession(ctx: IdentityCtx, person: Doc<"persons">, proof: Doc<"operatorSessionProofs"> | null): Promise<boolean> {
  if (!proof || proof.authUserId !== person.authUserId || proof.loa < CONSOLE_MIN_LOA || proof.expiresAt <= Date.now() || !await hasCurrentIdnLink(ctx, person, proof.idnSubject)) return false
  const root = await ctx.db.query("networks").withIndex("by_kind_and_status", (q) => q.eq("kind", "root").eq("status", "active")).unique()
  const membership = root ? await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root._id).eq("personId", person._id)).unique() : null
  if (membership?.status === "suspendue" || membership?.status === "partie") return false
  const session = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: proof.sessionId }] })
  return Boolean(session && session._id === proof.sessionId && session.userId === person.authUserId && session.expiresAt > Date.now())
}

/**
 * Revue CH-815, constat F3 : la preuve a-t-elle été scellée pour la console du moteur ? Le sceau
 * vient de l'état OAuth que le serveur a enregistré au départ, épinglé à l'entrée exacte de la console
 * (`betterAuth/settings.applicationOfOAuthState`), jamais d'un argument du client.
 */
export function sealedForOperatorConsole(proof: Doc<"operatorSessionProofs">): boolean {
  return isOperatorConsoleApplication(proof.application)
}

/** Une preuve de CONSOLE vivante : scellée pour la console, et vivante. */
export async function isLiveOperatorSession(ctx: IdentityCtx, person: Doc<"persons">, proof: Doc<"operatorSessionProofs"> | null): Promise<boolean> {
  return proof !== null && sealedForOperatorConsole(proof) && await isLiveIdnSession(ctx, person, proof)
}

/** La preuve VIVANTE de la session appelante (scellée par le retour IDN), quelle que soit son application, ou `null` — sans lever. */
export async function liveIdnSessionProofOrNull(ctx: QueryCtx | MutationCtx, person: Doc<"persons">): Promise<Doc<"operatorSessionProofs"> | null> {
  const identity = await getActiveIdentity(ctx)
  if (!identity || typeof identity.sessionId !== "string") return null
  const proof = await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", identity.sessionId as string)).unique()
  return proof && await isLiveIdnSession(ctx, person, proof) ? proof : null
}

/** La preuve de session de CONSOLE vivante de la session appelante (scellée pour la console par le retour IDN), ou `null` — sans lever. */
export async function liveOperatorSessionOrNull(ctx: QueryCtx | MutationCtx, person: Doc<"persons">): Promise<Doc<"operatorSessionProofs"> | null> {
  const proof = await liveIdnSessionProofOrNull(ctx, person)
  return proof && sealedForOperatorConsole(proof) ? proof : null
}

export async function requireOperatorSession(ctx: QueryCtx | MutationCtx, person: Doc<"persons">): Promise<Doc<"operatorSessionProofs">> {
  return (await liveOperatorSessionOrNull(ctx, person)) ?? fail("operatorRequired")
}

/** La personne est créée seulement par son geste d'entrée ; la preuve peut la précéder. */
export async function bindOperatorSession(ctx: MutationCtx, sessionId: unknown, person: Doc<"persons">): Promise<void> {
  if (typeof sessionId !== "string") return
  const proof = await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).unique()
  if (proof && proof.authUserId === person.authUserId && proof.personId === undefined) await ctx.db.patch(proof._id, { personId: person._id })
}
