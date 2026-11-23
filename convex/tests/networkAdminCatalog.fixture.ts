/**
 * ADR-0042 (CH-815) — l'entrée du catalogue de l'application d'administration de DIASPORA.GA, telle
 * que le contrat entre lots la fixe (`admin_diaspora_ga`, lot A4). Le catalogue réel la reçoit avec le
 * dossier de l'application, en couple (sinon le cliquet `deploy-catalog` est rouge) ; d'ici là, les
 * recettes du moteur la posent par `vi.mock` du catalogue. L'entrée RÉELLE, dès qu'elle existe,
 * l'emporte : la recette éprouve alors le vrai catalogue.
 *
 * Aucun import : ce module est chargé DANS la fabrique d'un `vi.mock` du catalogue, il ne doit
 * dépendre d'aucun module qui lirait le catalogue. Deux points dans le nom : ignoré par le bundler
 * de Convex.
 */
export const NETWORK_ADMIN_APPLICATION_KEY = "admin_diaspora_ga"

export const NETWORK_ADMIN_APPLICATION = {
  platform: "web",
  package: "admin-diaspora-ga",
  path: "../DIASPORA_GA/apps/admin_diaspora_ga",
  service: "admin-diaspora-ga",
  dockerfile: "DIASPORA_GA/apps/admin_diaspora_ga/Dockerfile",
  site_url: "https://admin.diaspora.ga",
  dev_port: 3033,
  administers_network: "diaspora-ga",
  entry_path: "/entrer",
  build_args: ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BUILD_SHA", "NEXT_PUBLIC_MEMBERS_SITE_URL"],
  runtime_env: ["CONVEX_SITE_URL"],
} as const

type CatalogModule = { default: { applications: Record<string, unknown> } }

/** Le module du catalogue, augmenté de l'application d'administration si elle n'y est pas encore. */
export function withNetworkAdminApplication<Module extends CatalogModule>(module: Module): Module {
  const applications = { [NETWORK_ADMIN_APPLICATION_KEY]: NETWORK_ADMIN_APPLICATION, ...module.default.applications }
  return { ...module, default: { ...module.default, applications }, applications }
}
