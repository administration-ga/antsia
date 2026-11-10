// Réécrit d'après socle/packages/agent-features/src/features/reseau-personnel/PagesSuggestionsRail.tsx @ ad2e7fdc2 — ce qui change : annuaire BORNÉ du moteur (`pages.pages.discover`, réseau courant ; ordre confiance puis récence au lieu des plus suivies) ; pages de toute nature (institution, association, entreprise, média, collectif) au lieu des seules administrations : le badge posé est celui que le serveur a CALCULÉ (Officiel, Vérifié, Communauté — `pageBadgeView`), plus un « Page officielle » sur toute page ; le rail (présentation `rail`) passe par `suggestionsForRail` ; adresses par la table des routes injectée (`pageHref(handle, routes.page)`, volet par `reseauAgentHref("pages", routes.home())`) ; textes traduits (clés `pagesSuggestionsRail.…`) ; feuille de style sortie du JSX dans une constante de module (un littéral enfant de `<style>` passerait pour une chaîne d'interface) — règles inchangées ; props inchangés.
"use client"

/**
 * « Pages à suivre » — des pages du réseau, jamais des personnes.
 *
 * Même source (`discover`) et même état partagé bureau/mobile : pile verticale
 * limitée à trois dans le rail, carrousel à défilement magnétique dans le fil
 * mobile. Chaque page peut être masquée pour le montage courant, sans écriture
 * serveur.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Badge, Button, Card, Icon, SkeletonCard } from "@antsia/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { RESEAU_SURFACE_STYLE } from "../../shell/design-styles"
import { reseauAgentHref } from "../../shell/reseau-agent-nav"
import { pageHref } from "./author-link"
import { Avatar } from "./Avatar"
import { DiscoveryEmptyCard } from "./DiscoveryEmptyCard"
import { PageFollowButton } from "./PageFollowButton"
import { pageBadgeView, suggestionsForRail } from "./pages-panel"
import type { DiscoveryPresentation } from "./suggestions-actions"

const RAIL_TITLE_STYLE = {
  margin: "0 0 12px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--ink-500)",
} as const

const CAROUSEL_TITLE_STYLE = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "var(--ink-900)",
} as const

const SEE_ALL_STYLE = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--primary-600)",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
} as const

/** Combien le carrousel du fil mobile propose — le rail, lui, s'en tient à trois (`suggestionsForRail`). */
const CAROUSEL_LIMIT = 6

/**
 * La feuille du rail, hors du JSX : un littéral enfant de `<style>` passerait
 * pour une chaîne d'interface (cliquet `no-hardcoded-strings`). Jetons de la
 * charte seulement, aucune couleur littérale.
 */
const PAGES_RAIL_CSS = `
        .rp-discovery-module { --ui2-button-sm-min-h: 44px; }
        .rp-discovery-dismiss:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .rp-discovery-module * { scroll-behavior: auto !important; }
        }
      `

export function PagesSuggestionsRail({ presentation = "rail" }: { presentation?: DiscoveryPresentation }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const isCarousel = presentation === "carousel"
  const discovered = useAuthenticatedConvexQuery(api.modules.pages.pages.discover, {
    networkId,
    limit: isCarousel ? 8 : 6,
  })
  // Une page suivie à l'instant quitte le rail avant même que la requête n'ait
  // rafraîchi — posé APRÈS la réponse du serveur via `onFollowChange`, jamais
  // avant.
  const [justFollowed, setJustFollowed] = useState<ReadonlySet<string>>(new Set())
  const [dismissedPageIds, setDismissedPageIds] = useState<ReadonlySet<string>>(new Set())

  const remaining = (discovered.data ?? []).filter((page) => !justFollowed.has(page.pageId) && !dismissedPageIds.has(page.pageId))
  const candidates = isCarousel ? remaining.filter((page) => !page.following).slice(0, CAROUSEL_LIMIT) : suggestionsForRail(remaining)

  if (discovered.isLoading) return <SkeletonCard />
  if (discovered.isError) {
    return (
      <Card padded style={RESEAU_SURFACE_STYLE}>
        <p style={{ margin: 0, color: "var(--ink-700)", fontSize: 13 }}>{t("pagesSuggestionsRail.unavailable")}</p>
        <Button variant="secondary" size="sm" style={{ minHeight: 44, marginTop: 8 }} onClick={() => void discovered.refetch()}>
          {t("pagesSuggestionsRail.retry")}
        </Button>
      </Card>
    )
  }
  if (candidates.length === 0) {
    return <DiscoveryEmptyCard title={t("pagesSuggestionsRail.title")} message={t("pagesSuggestionsRail.empty")} presentation={presentation} />
  }

  const content = (
    <section className="rp-discovery-module" style={{ padding: isCarousel ? "2px 0" : 20 }}>
      <header
        style={{
          display: "flex",
          minHeight: 44,
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2 style={isCarousel ? CAROUSEL_TITLE_STYLE : RAIL_TITLE_STYLE}>{t("pagesSuggestionsRail.title")}</h2>
        <Link href={reseauAgentHref("pages", routes.home())} style={SEE_ALL_STYLE}>
          {t("pagesSuggestionsRail.seeAll")}
        </Link>
      </header>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: "4px 0 0",
          display: "flex",
          flexDirection: isCarousel ? "row" : "column",
          gap: 12,
          overflowX: isCarousel ? "auto" : undefined,
          overscrollBehaviorInline: isCarousel ? "contain" : undefined,
          scrollSnapType: isCarousel ? "x mandatory" : undefined,
          scrollbarWidth: isCarousel ? "none" : undefined,
        }}
        aria-label={t("pagesSuggestionsRail.listLabel")}
      >
        {candidates.map((page) => {
          const href = pageHref(page.handle, routes.page)
          const badge = pageBadgeView(page.badge)
          return (
            <li
              key={page.pageId}
              style={{
                position: "relative",
                display: "flex",
                flex: isCarousel ? "0 0 min(220px, 78vw)" : undefined,
                flexDirection: "column",
                gap: 8,
                minWidth: 0,
                padding: isCarousel ? "var(--esp-card-padding, 10px)" : "0 44px 0 0",
                border: isCarousel ? "1px solid var(--esp-primitive-surface-border, var(--ink-200))" : undefined,
                borderRadius: isCarousel ? "var(--esp-primitive-card-radius, var(--radius-md))" : undefined,
                scrollSnapAlign: isCarousel ? "start" : undefined,
                background: isCarousel ? "var(--ink-0)" : undefined,
              }}
            >
              <button
                type="button"
                className="rp-discovery-dismiss"
                aria-label={t("pagesSuggestionsRail.dismiss", { name: page.name })}
                onClick={() => setDismissedPageIds((current) => new Set([...current, page.pageId]))}
                style={{
                  position: "absolute",
                  top: isCarousel ? 2 : -5,
                  right: isCarousel ? 2 : -5,
                  display: "inline-flex",
                  width: 44,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  border: 0,
                  borderRadius: "var(--esp-primitive-button-radius, var(--radius-lg))",
                  background: "transparent",
                  color: "var(--ink-500)",
                  cursor: "pointer",
                }}
              >
                <Icon name="x" size={16} />
              </button>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                <Link href={href} aria-label={t("pagesSuggestionsRail.pageLink", { name: page.name })} style={{ display: "inline-flex", flexShrink: 0 }}>
                  <Avatar displayName={page.name} avatarUrl={page.logoUrl} shape="square" size={isCarousel ? 44 : 34} />
                </Link>
                <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                  {/* Le NOM se replie (un intitulé d'institution doit se lire en
                      entier) ; l'IDENTIFIANT, lui, s'ellipse — insécable, il
                      déborderait de sa boîte. */}
                  <Link
                    href={href}
                    style={{
                      display: "block",
                      color: "var(--ink-900)",
                      textDecoration: "none",
                      fontSize: 12.5,
                      fontWeight: 700,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {page.name}
                  </Link>
                  <p
                    style={{
                      margin: "0 0 5px",
                      color: "var(--ink-500)",
                      fontSize: 10.5,
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    @{page.handle}
                  </p>
                  <Badge tone={badge.tone} size="sm" icon={badge.icon}>
                    {t(badge.labelKey)}
                  </Badge>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <PageFollowButton
                  pageId={page.pageId}
                  handle={page.handle}
                  following={page.following}
                  onFollowChange={(following) => {
                    if (following) setJustFollowed((current) => new Set([...current, page.pageId]))
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )

  return (
    <>
      {isCarousel ? (
        content
      ) : (
        <Card padded={false} style={RESEAU_SURFACE_STYLE}>
          {content}
        </Card>
      )}
      <style href="rp-discovery-controls" precedence="default">
        {PAGES_RAIL_CSS}
      </style>
    </>
  )
}
