import aggregate from "@convex-dev/aggregate/convex.config.js"
import betterAuth from "@convex-dev/better-auth/convex.config"
import migrations from "@convex-dev/migrations/convex.config.js"
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js"
import resend from "@convex-dev/resend/convex.config.js"
import { defineApp } from "convex/server"

/**
 * Composants du moteur (cahier §11 et §14) :
 * - betterAuth : sessions, IDN (genericOAuth), codes à usage unique (PA4) ;
 * - rateLimiter : limitation de débit de TOUTES les écritures sociales (PA2, PA5) ;
 * - migrations : migrations de données répétées sur instantané (§11) ;
 * - aggregate : compteurs fragmentés et agrégats matérialisés (PA3, PA10) —
 *   une instance nommée par usage s'ajoute ici, jamais d'instance anonyme ;
 * - resend : courriels (codes à usage unique, digests) (PA4, PA5).
 * Fichier partagé avec la session DIASPORA.GA : modifié par la session ANTSIA
 * seulement, sur demande.
 */
const app = defineApp()
app.use(betterAuth)
app.use(rateLimiter)
app.use(migrations)
app.use(resend)
app.use(aggregate, { name: "engineCounters" })
// Abonnés d'une personne dans un réseau (graphe, PA3 lot 4) : un décompte sans balayage (R8).
app.use(aggregate, { name: "followerCounts" })

export default app
