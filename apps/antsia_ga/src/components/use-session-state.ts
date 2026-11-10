"use client"

import { useStableConvexAuth } from "@antsia/api/hooks"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { ROOT_NETWORK_SLUG } from "@antsia/social-domain/network"
import { api } from "@convex/_generated/api"
import type { FunctionReturnType } from "convex/server"
import { useQuery } from "convex/react"

type MyPerson = NonNullable<FunctionReturnType<typeof api.modules.people.persons.getMyPerson>>
type RootNetwork = NonNullable<FunctionReturnType<typeof api.modules.networks.networks.getBySlug>>

/**
 * Où en est la personne qui ouvre l'application :
 *  · `signedOut` : aucune session ;
 *  · `welcome` : session ouverte, mais profil non publié ou racine pas encore rejointe ;
 *  · `member` : membre actif de la racine, prête pour le fil ;
 *  · `rootMissing` : la racine n'existe pas (graine non jouée en développement).
 */
export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "rootMissing" }
  | { status: "welcome"; person: MyPerson | null; root: RootNetwork }
  | { status: "restricted"; person: MyPerson; root: RootNetwork }
  | { status: "member"; person: MyPerson; root: RootNetwork }

export function useSessionState(): SessionState {
  const auth = useStableConvexAuth()
  const signedIn = auth.isAuthenticated
  const root = useQuery(api.modules.networks.networks.getBySlug, { slug: ROOT_NETWORK_SLUG })
  const person = useQuery(api.modules.people.persons.getMyPerson, signedIn ? {} : "skip")
  const memberships = useQuery(api.modules.people.memberships.myMemberships, signedIn ? {} : "skip")

  // La révocation retire d'abord les projections privées, avant la purge du
  // SDK et du reçu HTTP. Aucune porte ne doit alors naviguer vers l'accueil
  // et remonter un pont qui remplacerait la génération possédée par la sortie.
  if (isSigningOutEverywhere() || auth.isPending) return { status: "loading" }
  if (auth.isUnauthenticated) return { status: "signedOut" }
  if (root === undefined || person === undefined || memberships === undefined) return { status: "loading" }
  if (root === null) return { status: "rootMissing" }
  const rootMembership = memberships.find((membership) => membership.networkId === root._id)
  if (person && rootMembership?.status === "suspendue") return { status: "restricted", person, root }
  const activeMember = rootMembership !== undefined && rootMembership.status !== "suspendue"
  if (!person || !person.published || !activeMember) return { status: "welcome", person, root }
  return { status: "member", person, root }
}
