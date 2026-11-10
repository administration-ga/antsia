import { createHealthProbe, type HealthEnv } from "@antsia/api/health"

/**
 * Sonde du site (EX-03), une par instance : la route `/api/sante-fonctionnelle`
 * et la page `/sante-fonctionnelle` partagent le même résultat récent.
 */
export const probeSiteHealth = createHealthProbe("antsia-ga")

/** Configuration lue à chaque requête : références LITTÉRALES, que Next inscrit au build (jamais `process.env` entier). */
export function siteHealthEnv(): HealthEnv {
  return {
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA,
  }
}
