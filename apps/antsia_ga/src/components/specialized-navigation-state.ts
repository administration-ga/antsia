import { specializedProfessionalRoute, specializedShopRoute } from "@/lib/routes"

type NavigationLink = { id: string; href: string }
type SpecializedKind = "shop" | "provider" | "professional" | "media"

/** Une fiche est un enfant de son menu ; une sous-route ne laisse plus le dock sans repère. */
export function activeSpecializedDestination(kind: SpecializedKind, pathname: string, links: readonly NavigationLink[]): string | null {
  const exact = links.find(link => pathname === link.href.split("?")[0])
  if (exact) return exact.id
  if (kind === "shop" || kind === "provider") {
    const space = specializedShopRoute(pathname)
    if (space) {
      if (space.section === "catalog" || space.section === "offer" || space.section === "service") return kind === "provider" ? "services" : "catalog"
      if (space.section === "checkout") return kind === "provider" ? "services" : "cart"
      return kind === "provider" ? "providerHome" : "home"
    }
  }
  if (kind === "professional") {
    const section = specializedProfessionalRoute(pathname)
    if (section === "editor") return "profile"
    if (section === "profile" || section === "directory") return "directory"
    if (section === "collaborations") return "collaborations"
  }
  return [...links].sort((left, right) => right.href.length - left.href.length).find(link => pathname.startsWith(`${link.href.split("?")[0]}/`))?.id ?? null
}
