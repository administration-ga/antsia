import { createEngineNextConfig } from "@antsia/api/next-config"

import { appBasePath } from "./src/lib/app-path"
import { demoRuntimeOrigin } from "./src/lib/demo-proxy"

/**
 * Configuration Next.js 16 de l'application — commune au moteur
 * (`@antsia/api/next-config`) : racine ECOSYSTEMES, sortie standalone, paquets
 * du moteur en sources, en-têtes de sécurité, déploiement Convex lu dans
 * `ANTSIA/.env.local` en développement et dans les ARG du Dockerfile en production.
 */
const common = createEngineNextConfig({
  appDir: process.cwd(),
  developmentCacheGc: true,
  usageAnalytics: { host: process.env.NEXT_PUBLIC_POSTHOG_HOST, projectToken: process.env.NEXT_PUBLIC_POSTHOG_KEY, euRelayOrigin: process.env.NEXT_PUBLIC_POSTHOG_EU_RELAY_ORIGIN },
})
export default {
  ...common,
  basePath: appBasePath(),
  async headers() {
    const headers = await common.headers?.() ?? []
    // Chaque zone délivre sa propre CSP : le principal ne ferme pas le WebSocket
    // du backend démo. Sans relais configuré, le repli conserve ses en-têtes.
    return appBasePath() || !demoRuntimeOrigin() ? headers : headers.map((entry) => ({ ...entry, source: "/((?!demo(?:/|$)).*)" }))
  },
}
