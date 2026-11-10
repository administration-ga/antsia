/** Projections PA8 pures : aucun identifiant civil, stockage, signataire ou état de lecteur. */
import type { Badge } from "@antsia/social-domain/badges"
import type { ProvinceSlug } from "@antsia/social-domain/provinces"

import type { PostMediaDto } from "./media"

export type PublicOrigin = { slug: string; name: string }
export type PublicAuthor = {
  kind: "person" | "page"
  handle: string | null
  displayName: string | null
  badges: Badge[]
  avatarUrl: string | null
}
export type PublicSharedPost = { available: false } | {
  available: true
  id: string
  body: string
  publishedAt: number
  author: PublicAuthor
  origin: PublicOrigin
  media: PostMediaDto[]
}
export type PublicPost = {
  id: string
  body: string
  publishedAt: number
  editedAt: number | null
  tags: string[]
  province: ProvinceSlug | null
  author: PublicAuthor
  origin: PublicOrigin
  media: PostMediaDto[]
  shared: PublicSharedPost | null
  /** P09 : seule une référence existe ; le slot relit l'offre via sa porte publique. */
  hasCommerceOffer?: boolean
}
export type PublicAgentAffiliation = {
  administrationName: string
  administrationHandle: string
  roleLabel: string
}
export type PublicProfile = {
  handle: string
  displayName: string
  headline: string | null
  avatarUrl: string | null
  badges: Badge[]
  publicAgent?: PublicAgentAffiliation | null
}
export type PublicPage = {
  id: string
  handle: string
  name: string
  shortName: string | null
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  badge: "official"
  origin: PublicOrigin
}
export type PublicNetworkSnapshot = {
  generatedAt: number | null
  periodStart: number | null
  periodEnd: number | null
  publishedPosts: number | null
  officialPages: number | null
  networks: PublicOrigin[]
  trends: { tag: string; posts: number }[]
  bounded: boolean
}
export type PublicTransparency = {
  periods: { periodStart: number; periodEnd: number; cases: number | null }[]
  threshold: number
}
/**
 * SU01d — les échéances légales tombées pendant chaque période close : tenues, manquées, chacune
 * `null` sous le seuil (« moins de »), jamais leur base ; `legal: null` quand rien n'est publié.
 */
export type PublicLegalDeadlines = { met: number | null; missed: number | null }
export type PublicTransparencyDeadlines = {
  periods: { periodStart: number; periodEnd: number; legal: PublicLegalDeadlines | null }[]
  threshold: number
}
export type PublicPagination<T> = { page: T[]; isDone: boolean; continueCursor: string }
