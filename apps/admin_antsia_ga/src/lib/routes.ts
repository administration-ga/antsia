/**
 * Table des routes de la console du moteur — le SEUL fichier de l'application où une URL
 * s'écrit (cliquet `no-hardcoded-urls`). Les paquets du moteur ne connaissent
 * aucune URL : l'application leur passe cet adaptateur (PA6).
 */
export const CONSOLE_SECTIONS = ["networks", "teams", "appeals", "measures", "federation", "pages", "incidents", "audit", "health", "files", "export"] as const
export type ConsoleSection = (typeof CONSOLE_SECTIONS)[number]

/** Un paramètre ne devient jamais un Id : seule la liste canonique du moteur le résout. */
export function readConsoleState(search: string): { section: ConsoleSection; networkId: string } {
  const params = new URLSearchParams(search)
  return { section: CONSOLE_SECTIONS.find((section) => section === params.get("section")) ?? "networks", networkId: params.get("network") ?? "" }
}

const HOME_PATH = "/"
export const routes = {
  home: () => HOME_PATH,
  consoleState: (section: ConsoleSection, networkId?: string) => {
    const params = new URLSearchParams({ section })
    if (networkId) params.set("network", networkId)
    return HOME_PATH + "?" + params.toString()
  },
  signIn: () => "/entrer",
  signedOut: (incomplete = false) => incomplete ? "/entrer?deconnexion=incomplete" : "/entrer",
  health: () => "/sante-fonctionnelle",
  healthApi: () => "/api/sante-fonctionnelle",
} as const
