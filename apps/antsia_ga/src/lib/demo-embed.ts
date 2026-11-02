import { appBasePath } from "./app-path"

/** Ancien jeton conservé pour compatibilité ; la notice ne le lit ni ne l'écrit. */
export const DEMO_BANNER_HEIGHT_PROPERTY = "--antsia-demo-banner-height"

/** La notice démo flotte : elle ne retranche aucune hauteur au workspace. */
export function demoWorkspaceHeight(): string | undefined {
  return appBasePath() ? "100dvh" : undefined
}

/** Entrée publique du build principal ; le backend est choisi au déploiement. */
export function demoEntryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_ENTRY_ENABLED === "true"
}
