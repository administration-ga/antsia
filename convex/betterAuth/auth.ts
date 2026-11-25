// Dupliqué de socle/convex/betterAuth/auth.ts @ ad2e7fdc2 — adaptations : PA4, IDN avec PKCE et preuve serveur minimale, comptes légers par OTP e-mail/SMS, aucune route de mot de passe ; origines du catalogue et de l'environnement ; session sept jours et JWT trente minutes avec sessionId contrôlé côté serveur ; OTT trois minutes ; délivrance locale bornée ou transport configuré, erreurs et limitation de débit du moteur ; refus ou abandon chez IDN renvoyé à la porte de départ de confiance (issue #122) ; refus de débit porteur du délai restant, `retryAfterMs` et `Retry-After` (EA-08, issue #151) ; preuve de session IDN scellée avec l'application où la session est livrée, prise de l'état OAuth enregistré au départ (ADR-0042, CH-815) ; rappel IDN central web sans aucun cookie ni jeton porteur, la session ne passant que par le jeton à usage unique (revue CH-815 A1b, constat F1) ; routes `check-verification-otp` et `verify-email` du greffon e-mail fermées pour toutes les adresses, et garde de la porte des comptes de démonstration sur l'envoi du code et la connexion de sa famille d'adresses, avant les seaux (CH-817 E5, constat 1) ; surface des routes classée route par route (`AUTH_ROUTE_SURFACE`), figée par le cliquet `authSurface.test.ts` (CH-817 E5) ; routes du cœur `/sign-in/social` et `/callback/:id`, où `generic-oauth` inscrit IDN, fermées pour tous : IDN n'entre que par `/sign-in/oauth2` et son rappel central (CH-817 E5, écart du cliquet). Pré-remplissage éphémère de l'accueil (nom civil, identifiant IDN) extrait au mapping et déposé par le greffon de preuve une fois la session ouverte, jamais dans Better Auth ni dans la preuve, sans jamais faire échouer la connexion (ADR-0044, lot M1).
/**
 * Better Auth du moteur — l'émetteur UNIQUE des jetons Convex (ADR-0002).
 *
 * Les applications parlent à Better Auth par leur propre origine (proxy Next
 * `/api/auth/*` → actions HTTP Convex) ; le greffon `crossDomain` garde la
 * session par origine et `oneTimeToken` prépare le passage entre applications
 * avec un jeton à usage unique de trois minutes.
 */
import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex, crossDomain } from "@convex-dev/better-auth/plugins"
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api"
import { betterAuth } from "better-auth/minimal"
import { bearer, emailOTP, genericOAuth, oneTimeToken, phoneNumber } from "better-auth/plugins"
import { idn } from "@idn-ga/better-auth"

import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { DEMO_GATE_TOKEN_HEADER, DEMO_GATE_TOKEN_PATTERN, type DemoGateScope } from "@antsia/social-contracts/demoGate"

import { components, internal } from "../_generated/api"
import type { DataModel } from "../_generated/dataModel"
import authConfig from "../auth.config"
import { demoGateDigest, demoGateGoverns, demoGateSecret, demoGateState } from "../lib/demoGate"
import { devToolsAllowed } from "../lib/devTools"
import { deliverOtp, type OtpRequest } from "./delivery"
import { idnRefusalReturn } from "./idnRefusalReturn"
import { idnWebCallbackWithoutCookies } from "./idnWebCallback"
import { isNativeIdnOAuth, nativeIdn } from "./nativeIdn"
import { applicationOfOAuthState, authenticationConfiguration, idnConfiguration, idnEntryPrefill, idnProfileProof, isE164Phone, OTP_TTL_SECONDS, trustedOrigins, type IdnEntryPrefill } from "./settings"

// Durée de vie d'un code à usage unique : la constante vit dans `settings.ts`, que lit aussi la configuration publique (EA-08).
export { OTP_TTL_SECONDS, parseOriginList, trustedOrigins } from "./settings"

export const authComponent = createClient<DataModel>(components.betterAuth)

/** L'origine principale, lue dans le déploiement — jamais une adresse écrite ici (dépôt public). */
function primarySiteUrl(): string {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error("[Auth] SITE_URL manquant : variable du déploiement Convex.")
  return new URL(siteUrl).origin
}

/**
 * L'origine qui demande, si elle est de confiance ; sinon l'origine principale.
 * Le greffon `crossDomain` y renvoie la personne après un parcours de connexion.
 */
export function resolveSiteUrl(origin: string | null | undefined, allowlist: string[], fallback: string): string {
  if (origin) {
    try {
      const normalized = new URL(origin).origin
      if (allowlist.includes(normalized)) return normalized
    } catch {
      // origine illisible : repli
    }
  }
  return fallback
}

/** Valide que BETTER_AUTH_SECRET est présent et assez long. */
function validateAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("[Auth] BETTER_AUTH_SECRET manquant.")
  if (secret.length < 32) throw new Error(`[Auth] BETTER_AUTH_SECRET trop court (${secret.length} caractères, 32 requis).`)
  return secret
}

type RunMutationCtx = { runMutation: (reference: never, args: never) => Promise<unknown> }

function canRunMutation(ctx: unknown): ctx is RunMutationCtx {
  return typeof ctx === "object" && ctx !== null && "runMutation" in ctx && typeof (ctx as RunMutationCtx).runMutation === "function"
}

type RunQueryCtx = { runQuery: (reference: never, args: never) => Promise<unknown> }

function canRunQuery(ctx: unknown): ctx is RunQueryCtx {
  return typeof ctx === "object" && ctx !== null && "runQuery" in ctx && typeof (ctx as RunQueryCtx).runQuery === "function"
}

// CH-817 E5 (relecture de sécurité, constat 1) — la porte des comptes de démonstration verrouillait
// la LECTURE du code, pas la connexion : un anonyme demandait un code pour une adresse réservée et
// l'essayait sans jamais le lire, et vidait au passage les seaux par adresse des invités. Porte
// `gated` ou `unavailable`, l'envoi du code (tout type) et la connexion d'une adresse de la famille
// de la portée exigent l'en-tête `DEMO_GATE_TOKEN_HEADER` d'une session de porte valide. Ni greffon,
// ni route, ni table (ADR-0029) : la garde ne fait que refuser ; porte `closed` (production) ou
// `open`, elle ne s'applique pas.
export const DEMO_GATED_AUTH_PATHS: ReadonlySet<string> = new Set<string>(["/email-otp/send-verification-otp", "/sign-in/email-otp"])

/** La portée de porte qui gouverne cette requête de connexion, ou `null` : la garde ne s'applique pas. */
function demoGatedScopeOf(hookCtx: { path?: string; body?: unknown }): DemoGateScope | null {
  if (!DEMO_GATED_AUTH_PATHS.has(hookCtx.path ?? "")) return null
  const body = hookCtx.body
  if (typeof body !== "object" || body === null || !("email" in body) || typeof body.email !== "string") return null
  return demoGateGoverns(body.email)
}

/**
 * Admise si et seulement si la porte est `gated`, l'en-tête a la forme d'un jeton et ce jeton ouvre
 * une session de porte valide pour la portée (`platform/demoGate.sessionAdmits`). L'empreinte se
 * calcule ICI : le jeton en clair ne passe jamais en argument. `unavailable`, contexte sans
 * `runQuery`, ou toute erreur : refus.
 */
async function demoGateAdmitsSignIn(ctx: unknown, scope: DemoGateScope, headers: Headers | null | undefined): Promise<boolean> {
  if (demoGateState() !== "gated") return false
  const token = headers?.get(DEMO_GATE_TOKEN_HEADER) ?? null
  if (token === null || !DEMO_GATE_TOKEN_PATTERN.test(token)) return false
  const secret = demoGateSecret()
  if (secret === null || !canRunQuery(ctx)) return false
  try {
    const tokenDigest = await demoGateDigest(secret, "demo-gate-session", token)
    return (await ctx.runQuery(internal.modules.platform.demoGate.sessionAdmits as never, { scope, tokenDigest } as never)) === true
  } catch {
    return false
  }
}

// Limitation de débit : avant l'envoi d'un code et avant une connexion. Clé =
// adresse normalisée ; au-delà du quota, 429 avec le code `rateLimited` et le délai restant.
export const RL_LOGIN_PATHS: ReadonlySet<string> = new Set<string>(["/sign-in/email-otp", "/phone-number/verify"])
export const RL_OTP_SEND_PATHS: ReadonlySet<string> = new Set<string>(["/email-otp/send-verification-otp", "/phone-number/send-otp"])
// Les plugins OTP exposent aussi des réinitialisations capables de créer un
// compte `credential`, même si emailAndPassword.enabled est false.
export const PASSWORD_PATHS: ReadonlySet<string> = new Set([
  "/sign-in/email", "/sign-up/email", "/sign-in/phone-number",
  "/request-password-reset", "/reset-password", "/change-password", "/verify-password", "/set-password",
  "/email-otp/request-password-reset", "/email-otp/reset-password", "/forget-password/email-otp",
  "/phone-number/request-password-reset", "/phone-number/reset-password",
])

// Routes sans appelant, fermées pour TOUS, production comprise (404 `routeDisabled`, avant tout seau) :
// une route sans appelant se ferme, elle ne se limite pas. Restriction pure.
// - CH-817 E5 (relecture de sécurité, constat 1) : deux routes du greffon e-mail qu'aucune application
//   n'appelle (elles n'envoient que `sign-in`). `check-verification-otp` échappait au seau de connexion
//   (trois essais par code, autant de codes qu'en permet l'envoi) ; `verify-email` consommait un code
//   hors de toute connexion.
// - CH-817 E5 (écart relevé par le cliquet `authSurface.test.ts`) : avec IDN, `generic-oauth` inscrit IDN
//   parmi les fournisseurs sociaux du cœur. `/sign-in/social` partait chez IDN sans `prompt=login` ni
//   crochet natif de départ ; `/callback/:id` pouvait ouvrir une session IDN hors des crochets du rappel
//   central (sans cookie, retour natif lié à S256, retour de refus). Aucune application ne les appelle :
//   toutes partent par `/sign-in/oauth2`, et le client IDN n'a pour retour que `/oauth2/callback/idn`.
//   Le crochet voit le GABARIT de la route (`endpoint.path`, Better Auth 1.6) : une requête `/callback/idn`
//   y arrive sous `/callback/:id` ; l'égalité exacte ne vise pas `/oauth2/callback/:providerId`.
export const DISABLED_ROUTE_PATHS: ReadonlySet<string> = new Set<string>([
  "/email-otp/check-verification-otp", "/email-otp/verify-email",
  "/sign-in/social", "/callback/:id",
])

export function isPasswordRequest(hookCtx: { path?: string; body?: unknown }): boolean {
  const path = hookCtx.path ?? ""
  if (PASSWORD_PATHS.has(path) || path.startsWith("/reset-password/")) return true
  return path === "/email-otp/send-verification-otp" && typeof hookCtx.body === "object" && hookCtx.body !== null && "type" in hookCtx.body && hookCtx.body.type === "forget-password"
}

/** Un seau par adresse de `checkAuthRateLimit` (`modules/platform/authRateLimit`), choisi par le crochet des seaux. */
export type AuthRateBucket = "auth.login" | "auth.otp.send"

/**
 * Le classement d'une route : `closed` (404 des crochets : `password` = `isPasswordRequest`,
 * `routeDisabled` = `DISABLED_ROUTE_PATHS`), `demoGated` (garde de la porte puis seau), `rateLimited`
 * (seau par adresse), `sessionRequired` (intergiciel de session de Better Auth, ou contrôle dans le
 * gestionnaire), `serverOnly` (`metadata.SERVER_ONLY` : le routeur ne l'expose pas), `public`
 * (justification écrite).
 */
export type AuthRouteClassification =
  | { kind: "closed"; by: "password" | "routeDisabled"; reason: string }
  | { kind: "demoGated"; bucket: AuthRateBucket; reason: string }
  | { kind: "rateLimited"; bucket: AuthRateBucket; reason: string }
  | { kind: "sessionRequired"; guard: "middleware" | "handler"; reason: string }
  | { kind: "serverOnly"; reason: string }
  | { kind: "public"; reason: string }

/**
 * CH-817 E5 — la surface d'authentification FIGÉE : chaque chemin de l'instance Better Auth (tous les
 * greffons, IDN configuré), avec sa classe et sa raison. Les crochets n'en lisent rien : la garde, les
 * fermetures et les seaux visent une liste fixe de chemins. Le cliquet `authSurface.test.ts` énumère
 * les routes de l'instance RÉELLE et échoue si une route n'est pas classée ici, si une ligne n'a plus
 * de route, ou si une classe ne correspond pas aux ensembles ci-dessus. Une mise à jour de Better Auth
 * qui ajouterait une façon d'obtenir ou de vérifier un code, ou de se connecter, ne passe donc plus à
 * côté de la porte : elle arrête le cliquet jusqu'à ce qu'on la classe.
 */
export const AUTH_ROUTE_SURFACE: Readonly<Record<string, AuthRouteClassification>> = {
  // Cœur de Better Auth.
  // `generic-oauth` inscrit IDN parmi les fournisseurs sociaux (seul fournisseur, vérifié par le cliquet) :
  // ces deux routes du cœur atteignaient IDN hors des crochets liés à `/sign-in/oauth2` et
  // `/oauth2/callback/...`. Les classer `public` était faux (le cliquet l'a montré) : fermées (CH-817 E5).
  "/sign-in/social": { kind: "closed", by: "routeDisabled", reason: "Départ IDN du cœur (`provider: \"idn\"`) : partait SANS `prompt=login` ni crochet natif de départ ; aucune application ne l'appelle (toutes passent par `/sign-in/oauth2`)." },
  "/callback/:id": { kind: "closed", by: "routeDisabled", reason: "Rappel du cœur (`id` « idn ») : ouvrait une session IDN hors des crochets du rappel central (sans cookie, retour natif, refus) ; IDN ne renvoie qu'à `/oauth2/callback/idn`." },
  "/get-session": { kind: "public", reason: "Relit la session présentée ; sans session, rend null. N'émet ni code ni session." },
  "/sign-out": { kind: "public", reason: "Ferme la session présentée ; sans session, sans effet." },
  "/sign-up/email": { kind: "closed", by: "password", reason: "Inscription par mot de passe : aucune route de mot de passe dans le moteur." },
  "/sign-in/email": { kind: "closed", by: "password", reason: "Connexion par mot de passe : aucune route de mot de passe dans le moteur." },
  "/reset-password": { kind: "closed", by: "password", reason: "Réinitialisation de mot de passe : créerait un compte `credential`." },
  "/verify-password": { kind: "closed", by: "password", reason: "Vérification de mot de passe : aucun mot de passe n'existe." },
  "/verify-email": { kind: "public", reason: "Jeton JWT signé du secret, émis par le seul envoi de vérification (aucun expéditeur, vérifié) ; aucune connexion automatique (vérifié)." },
  "/send-verification-email": { kind: "public", reason: "Aucun expéditeur `emailVerification.sendVerificationEmail` (vérifié par le cliquet) : la route refuse, rien ne part." },
  "/change-email": { kind: "sessionRequired", guard: "middleware", reason: "Session sensible exigée ; `user.changeEmail` n'est pas activé (vérifié par le cliquet)." },
  "/change-password": { kind: "closed", by: "password", reason: "Changement de mot de passe : aucun mot de passe n'existe." },
  "/update-session": { kind: "sessionRequired", guard: "middleware", reason: "Met à jour les champs de la session présentée." },
  "/update-user": { kind: "sessionRequired", guard: "middleware", reason: "Met à jour l'utilisateur de la session ; ni courriel ni mot de passe." },
  "/delete-user": { kind: "sessionRequired", guard: "middleware", reason: "Session sensible exigée ; `user.deleteUser` n'est pas activé (vérifié par le cliquet)." },
  "/request-password-reset": { kind: "closed", by: "password", reason: "Demande de réinitialisation de mot de passe." },
  "/reset-password/:token": { kind: "closed", by: "password", reason: "Lien de réinitialisation de mot de passe (préfixe `/reset-password/`)." },
  "/list-sessions": { kind: "sessionRequired", guard: "middleware", reason: "Liste les sessions de l'utilisateur présent." },
  "/revoke-session": { kind: "sessionRequired", guard: "middleware", reason: "Révoque une session de l'utilisateur présent." },
  "/revoke-sessions": { kind: "sessionRequired", guard: "middleware", reason: "Révoque toutes les sessions de l'utilisateur présent (se déconnecter partout)." },
  "/revoke-other-sessions": { kind: "sessionRequired", guard: "middleware", reason: "Révoque les autres sessions de l'utilisateur présent." },
  "/link-social": { kind: "sessionRequired", guard: "middleware", reason: "Lie un fournisseur social (IDN seul, inscrit par `generic-oauth`) au compte présent." },
  "/list-accounts": { kind: "sessionRequired", guard: "middleware", reason: "Liste les comptes liés de l'utilisateur présent." },
  "/delete-user/callback": { kind: "sessionRequired", guard: "handler", reason: "Suppression non activée (404) ; sinon session et jeton exigés par le gestionnaire." },
  "/unlink-account": { kind: "sessionRequired", guard: "middleware", reason: "Délie un compte de l'utilisateur présent (session fraîche)." },
  "/refresh-token": { kind: "sessionRequired", guard: "handler", reason: "Jeton du fournisseur : le gestionnaire refuse toute requête HTTP sans session (401)." },
  "/get-access-token": { kind: "sessionRequired", guard: "handler", reason: "Jeton du fournisseur : le gestionnaire refuse toute requête HTTP sans session (401)." },
  "/account-info": { kind: "sessionRequired", guard: "handler", reason: "Profil du fournisseur : le gestionnaire refuse toute requête HTTP sans session (401)." },
  // Greffon `convex` : les JWT Convex.
  "/convex/.well-known/openid-configuration": { kind: "public", reason: "Découverte OpenID des JWT Convex : métadonnées publiques, n'émet rien." },
  "/convex/jwks": { kind: "public", reason: "Clés PUBLIQUES de vérification des JWT Convex." },
  "/convex/latest-jwks": { kind: "serverOnly", reason: "Réservée au serveur (`SERVER_ONLY`) : le routeur ne l'expose pas (vérifié : 404)." },
  "/convex/rotate-keys": { kind: "serverOnly", reason: "Réservée au serveur (`SERVER_ONLY`) : le routeur ne l'expose pas (vérifié : 404)." },
  "/convex/token": { kind: "sessionRequired", guard: "middleware", reason: "Émet le JWT Convex de la session présentée (trente minutes)." },
  // Greffons `oneTimeToken` et `crossDomain` (la vérification du second, même clé, est remplacée par celle du premier).
  "/one-time-token/verify": { kind: "public", reason: "OUVRE UNE SESSION sans seau ni porte : jeton aléatoire de 32 caractères émis à une session, trois minutes, usage unique." },
  "/one-time-token/generate": { kind: "sessionRequired", guard: "middleware", reason: "Émet le jeton de passage de la session présentée." },
  // Greffon `engine-native-idn`.
  "/native-idn/exchange": { kind: "public", reason: "OUVRE UNE SESSION sans seau : code de 43 caractères déposé par le rappel IDN, 90 s, usage unique, lié à un vérificateur S256." },
  // Greffon `generic-oauth` (IDN seulement, quand il est configuré).
  "/sign-in/oauth2": { kind: "public", reason: "Départ vers IDN : rend l'URL d'autorisation (état et PKCE enregistrés), aucune session ; la personne s'authentifie chez IDN." },
  "/oauth2/callback/:providerId": { kind: "public", reason: "OUVRE UNE SESSION sans seau : état OAuth enregistré au départ (usage unique), code échangé chez IDN avec secret client et PKCE." },
  "/oauth2/link": { kind: "sessionRequired", guard: "middleware", reason: "Lie IDN au compte présent (rattachement explicite)." },
  // Greffon `email-otp`.
  "/email-otp/send-verification-otp": { kind: "demoGated", bucket: "auth.otp.send", reason: "Envoi du code : garde de la porte, disponibilité, seau d'envoi ; le type `forget-password` est fermé (mot de passe)." },
  "/email-otp/check-verification-otp": { kind: "closed", by: "routeDisabled", reason: "Échappait au seau de connexion (trois essais par code) ; aucune application ne l'appelle." },
  "/email-otp/verify-email": { kind: "closed", by: "routeDisabled", reason: "Consommait un code hors de toute connexion ; aucune application ne l'appelle." },
  "/sign-in/email-otp": { kind: "demoGated", bucket: "auth.login", reason: "Connexion par code e-mail : garde de la porte, puis seau de connexion par adresse." },
  "/email-otp/request-password-reset": { kind: "closed", by: "password", reason: "Réinitialisation par code : créerait un compte `credential`." },
  "/forget-password/email-otp": { kind: "closed", by: "password", reason: "Réinitialisation par code (ancien chemin) : créerait un compte `credential`." },
  "/email-otp/reset-password": { kind: "closed", by: "password", reason: "Réinitialisation par code : créerait un compte `credential`." },
  "/email-otp/request-email-change": { kind: "sessionRequired", guard: "middleware", reason: "Session sensible exigée ; `changeEmail` du greffon n'est pas activé (vérifié par le cliquet)." },
  "/email-otp/change-email": { kind: "sessionRequired", guard: "middleware", reason: "Session sensible exigée ; `changeEmail` du greffon n'est pas activé (vérifié par le cliquet)." },
  // Greffon `phone-number`.
  "/sign-in/phone-number": { kind: "closed", by: "password", reason: "Connexion par téléphone et mot de passe : aucun mot de passe n'existe." },
  "/phone-number/send-otp": { kind: "rateLimited", bucket: "auth.otp.send", reason: "Envoi du code SMS : disponibilité du relais, puis seau d'envoi par numéro." },
  "/phone-number/verify": { kind: "rateLimited", bucket: "auth.login", reason: "Connexion ou inscription par code SMS : seau de connexion par numéro." },
  "/phone-number/request-password-reset": { kind: "closed", by: "password", reason: "Réinitialisation par SMS : créerait un compte `credential`." },
  "/phone-number/reset-password": { kind: "closed", by: "password", reason: "Réinitialisation par SMS : créerait un compte `credential`." },
  // Routes de service.
  "/ok": { kind: "public", reason: "Sonde de disponibilité : rend `{ ok: true }`." },
  "/error": { kind: "public", reason: "Page d'erreur rendue au navigateur, sans donnée." },
}

/** L'origine et la langue de la requête qui demande un code ; l'origine de `createAuth` à défaut d'en-têtes. */
function otpRequestOf(endpoint: { headers?: Headers | null } | undefined, requestOrigin: string | null | undefined): OtpRequest {
  return { origin: endpoint?.headers?.get("origin") ?? requestOrigin, acceptLanguage: endpoint?.headers?.get("accept-language") }
}

/**
 * EA-08 (issue #151) — le refus de débit dit QUAND réessayer : `retryAfterMs` dans le corps (la
 * clé des refus `rateLimited` du moteur) et `Retry-After` en secondes entières (RFC 9110). Un
 * délai, rien d'autre : ni l'adresse, ni le seau, ni le compte de demandes.
 */
export function rateLimitedRefusal(retryAfterMs: number): APIError {
  const delayMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? Math.ceil(retryAfterMs) : 0
  return new APIError(
    "TOO_MANY_REQUESTS",
    { message: "rateLimited", code: "rateLimited", retryAfterMs: delayMs },
    { "Retry-After": String(Math.max(1, Math.ceil(delayMs / 1_000))) },
  )
}

type DeliveryState = { attempted: boolean; delivered: boolean }
function deliveryState(context: unknown): DeliveryState | null {
  if (!context || typeof context !== "object" || !("engineOtpDelivery" in context)) return null
  const state = context.engineOtpDelivery
  return state && typeof state === "object" && "attempted" in state && "delivered" in state && typeof state.attempted === "boolean" && typeof state.delivered === "boolean" ? state as DeliveryState : null
}

const rateLimitPlugin = (ctx: GenericCtx<DataModel>): BetterAuthPlugin => ({
  id: "engine-auth-rate-limit",
  hooks: {
    before: [
      {
        matcher: (hookCtx) => Boolean(hookCtx.headers?.get("origin")),
        handler: createAuthMiddleware(async (hookCtx) => {
          const origin = hookCtx.headers?.get("origin")
          if (origin && !trustedOrigins().includes(origin)) throw new APIError("FORBIDDEN", { message: "INVALID_ORIGIN", code: "INVALID_ORIGIN" })
        }),
      },
      {
        matcher: isPasswordRequest,
        handler: createAuthMiddleware(async () => {
          throw new APIError("NOT_FOUND", { message: "passwordSignInDisabled", code: "passwordSignInDisabled" })
        }),
      },
      {
        // Juste après les mots de passe, avant tout seau : la route n'existe pas, rien n'est compté.
        matcher: (hookCtx) => DISABLED_ROUTE_PATHS.has(hookCtx.path ?? ""),
        handler: createAuthMiddleware(async () => {
          throw new APIError("NOT_FOUND", { message: "routeDisabled", code: "routeDisabled" })
        }),
      },
      {
        // Garde de la porte des comptes de démonstration (CH-817 E5) : après les routes fermées, AVANT
        // la disponibilité de l'envoi et les seaux par adresse — un refus n'entame ni seau ni code.
        matcher: (hookCtx) => demoGatedScopeOf(hookCtx) !== null,
        handler: createAuthMiddleware(async (hookCtx) => {
          const scope = demoGatedScopeOf(hookCtx)
          if (scope !== null && await demoGateAdmitsSignIn(ctx, scope, hookCtx.headers)) return
          // Refus INDISTINCT, sans seau ni écriture : l'envoi répond comme un envoi réel (aucun code
          // ne part, aucun n'est enregistré), la connexion comme un code faux.
          if (hookCtx.path === "/email-otp/send-verification-otp") return hookCtx.json({ success: true })
          throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" })
        }),
      },
      {
        matcher: (hookCtx) => RL_OTP_SEND_PATHS.has(hookCtx.path ?? ""),
        handler: createAuthMiddleware(async (hookCtx) => {
          const available = authenticationConfiguration()
          if (hookCtx.path === "/phone-number/send-otp" ? !available.smsOtp : !available.emailOtp) throw new APIError("SERVICE_UNAVAILABLE", { message: "otpDeliveryUnavailable", code: "otpDeliveryUnavailable" })
          // Le dispatcher fusionne ce retour dans le contexte de l'endpoint :
          // les données partagées avec le callback vivent dans .context.
          return { context: { context: { engineOtpDelivery: { attempted: false, delivered: false } satisfies DeliveryState } } }
        }),
      },
      {
        matcher: (hookCtx) => RL_LOGIN_PATHS.has(hookCtx.path ?? "") || RL_OTP_SEND_PATHS.has(hookCtx.path ?? ""),
        handler: createAuthMiddleware(async (hookCtx) => {
          const body = (hookCtx as { body?: { email?: unknown; phoneNumber?: unknown } }).body ?? {}
          const identifier = body.email ?? body.phoneNumber
          const key = typeof identifier === "string" ? identifier.trim().toLowerCase() : ""
          if (!key || !canRunMutation(ctx)) return
          const bucket = RL_OTP_SEND_PATHS.has(hookCtx.path ?? "") ? "auth.otp.send" : "auth.login"
          const result = (await ctx.runMutation(
            internal.modules.platform.authRateLimit.checkAuthRateLimit as never,
            { bucket, key } as never,
          )) as { ok: boolean; retryAfterMs: number }
          if (!result.ok) throw rateLimitedRefusal(result.retryAfterMs)
        }),
      },
    ],
    after: [{
      matcher: (hookCtx) => RL_OTP_SEND_PATHS.has(hookCtx.path ?? ""),
      handler: createAuthMiddleware(async (hookCtx) => {
        const state = deliveryState(hookCtx.context)
        // Better Auth masque les erreurs d'envoi e-mail ; restaurer un refus
        // explicite quand le transport a réellement échoué, sans détails privés.
        if (state?.attempted && !state.delivered) throw new APIError("SERVICE_UNAVAILABLE", { message: "otpDeliveryUnavailable", code: "otpDeliveryUnavailable" })
      }),
    }],
  },
})

/**
 * L'état OAuth du rappel EN COURS, tel que Better Auth l'a relu en base et consommé (`parseState`),
 * ou `null`. Hors d'une requête Better Auth (crochet appelé directement), il n'y a pas d'état : la
 * preuve est alors scellée sans application, donc sans valeur pour l'administration d'un réseau.
 */
async function currentOAuthState(): Promise<unknown> {
  try {
    return await getOAuthState()
  } catch {
    return null
  }
}

/** Retire le champ `mode` des clauses `where`, que l'adaptateur Convex refuse (contournement repris du socle). */
function stripModeClauses<T>(args: T): T {
  const strip = (clause: unknown) => {
    if (clause && typeof clause === "object" && "mode" in clause) {
      const { mode: _mode, ...rest } = clause as Record<string, unknown>
      return rest
    }
    return clause
  }
  if (!args || typeof args !== "object") return args
  const copy = { ...(args as Record<string, unknown>) }
  if ("where" in copy) copy.where = Array.isArray(copy.where) ? copy.where.map(strip) : strip(copy.where)
  const input = copy.input
  if (input && typeof input === "object" && "where" in input) {
    const inputCopy = { ...(input as Record<string, unknown>) }
    inputCopy.where = Array.isArray(inputCopy.where) ? inputCopy.where.map(strip) : strip(inputCopy.where)
    copy.input = inputCopy
  }
  return copy as T
}

/** Le contexte passé à l'adaptateur, avec le contournement `mode`. */
export function adapterContext(ctx: GenericCtx<DataModel>): GenericCtx<DataModel> {
  const base = ctx as unknown as Record<string, unknown> & {
    runQuery?: (reference: unknown, args: unknown) => Promise<unknown>
    runMutation?: (reference: unknown, args: unknown) => Promise<unknown>
  }
  return {
    ...base,
    ...(base.runQuery ? { runQuery: (reference: unknown, args: unknown) => base.runQuery?.(reference, stripModeClauses(args)) } : {}),
    ...(base.runMutation ? { runMutation: (reference: unknown, args: unknown) => base.runMutation?.(reference, stripModeClauses(args)) } : {}),
  } as unknown as GenericCtx<DataModel>
}

export const createAuth = (ctx: GenericCtx<DataModel>, requestOrigin?: string | null) => {
  const siteUrl = primarySiteUrl()
  const allowedOrigins = trustedOrigins()
  const isLocalDev = devToolsAllowed()
  const idnOptions = idnConfiguration()
  const browserSession = crossDomain({ siteUrl: resolveSiteUrl(requestOrigin, allowedOrigins, siteUrl) })
  const skipBrowserAfter = createAuthMiddleware(async () => {})
  // Le retour natif délivre son propre code S256. Ne jamais lui ajouter l'OTT Web.
  browserSession.hooks.after = browserSession.hooks.after.map((hook) => ({
    ...hook,
    // Le handler est déjà un middleware Better Call : conserver son enveloppe
    // { response, headers }. L'envelopper une seconde fois remplace le corps
    // OAuth/OTP par cet objet d'en-têtes dans le transport crossDomain.
    handler: async (hookCtx) => {
      // Les champs de route sont fournis par le répartiteur Better Auth, mais
      // absents du type générique des entrées de middleware Better Call.
      const route = hookCtx as typeof hookCtx & { path?: string; params?: { providerId?: string } }
      if ((route.path === "/oauth2/callback/idn" || route.path === "/oauth2/callback/:providerId" && route.params?.providerId === "idn") && await isNativeIdnOAuth()) return skipBrowserAfter(hookCtx)
      return hook.handler(hookCtx)
    },
  }))
  // Propre à CETTE requête : seul le profil du callback OIDC peut sceller
  // la nouvelle session. Un lien de compte ou un OTP ne le peuvent pas.
  let idnLoginProof: ReturnType<typeof idnProfileProof> | null = null
  // ADR-0044 : ce que l'accueil propose avant le geste (nom civil, identifiant IDN), tenu pour CETTE
  // requête seulement et déposé une fois la session ouverte — jamais dans la preuve ni dans Better Auth.
  let idnEntry: IdnEntryPrefill | null = null
  /** Dépose le pré-remplissage de l'accueil ; ne lève jamais : la connexion ne casse pas à cause de lui. */
  const recordEntryPrefill = async (authUserId: string) => {
    const prefill = idnEntry
    if (!prefill || !canRunMutation(ctx)) return
    try {
      await ctx.runMutation(internal.modules.people.idnPrefill.recordIdnPrefill as never, { authUserId, ...prefill } as never)
    } catch {
      // Sans pré-remplissage, l'accueil retombe sur la saisie (ADR-0044) ; rien d'autre n'en dépend.
    }
  }
  type OAuthConfig = Parameters<typeof genericOAuth>[0]["config"][number]
  const idnProvider: OAuthConfig[] = idnOptions ? [{
    ...idn({ ...idnOptions, scopes: ["openid", "profile", "email"] }),
    // Une nouvelle entrée doit permettre une autre identité, même si IDN garde son SSO.
    prompt: "login",
    // Callback central stable, aussi pendant l'échange sans en-tête Origin.
    redirectURI: `${siteUrl}/api/auth/oauth2/callback/idn`,
    mapProfileToUser: async (profile: Record<string, unknown>) => {
      if (!canRunMutation(ctx)) throw new APIError("SERVICE_UNAVAILABLE", { message: "idnUnavailable", code: "idnUnavailable" })
      const proof = idnProfileProof(profile)
      await ctx.runMutation(internal.modules.people.identity.recordIdnProof as never, proof as never)
      idnLoginProof = proof
      // ADR-0044 : extraction pure, qui ne lève jamais ; le dépôt attend la session (greffon ci-dessous).
      idnEntry = idnEntryPrefill(profile)
      // Le nom social est choisi à l'accueil ; aucun état civil n'est recopié dans Better Auth ni dans
      // la preuve. L'accueil le PROPOSE, avant le geste, par le pré-remplissage éphémère (ADR-0044).
      return { email: String(profile.email).trim().toLowerCase(), emailVerified: true, name: BRAND_NAME }
    },
  } as OAuthConfig] : []

  return betterAuth({
    appName: BRAND_NAME,
    baseURL: siteUrl,
    secret: validateAuthSecret(),
    session: {
      // Sept jours, rafraîchis chaque jour ; le JWT Convex se renouvelle en
      // trente minutes et porte sessionId. La garde relit la session serveur :
      // une révocation refuse immédiatement même un JWT encore valide.
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: allowedOrigins,
    database: authComponent.adapter(adapterContext(ctx)),
    emailAndPassword: { enabled: false },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["idn"],
        disableImplicitLinking: true,
        allowDifferentEmails: true,
        // Le compte SMS porte un email technique non vérifié. Le rattachement
        // est explicite et exige sa session OTP + l'authentification chez IDN.
        requireLocalEmailVerified: false,
      },
    },
    advanced: {
      // Le proxy de développement parle en http://localhost : cookies non sécurisés en local seulement.
      useSecureCookies: isLocalDev ? false : undefined,
    },
    plugins: [
      {
        id: "engine-idn-session-proof",
        hooks: { after: [{
          matcher: () => idnLoginProof !== null,
          handler: createAuthMiddleware(async (hookCtx) => {
            const proof = idnLoginProof
            const session = hookCtx.context.newSession?.session
            if (!proof || !session) return
            if (proof.loa !== undefined) {
              if (!canRunMutation(ctx)) throw new APIError("SERVICE_UNAVAILABLE", { message: "idnUnavailable", code: "idnUnavailable" })
              // ADR-0042 : l'application où la session est LIVRÉE, prise de l'état OAuth que le moteur a
              // enregistré au départ — jamais de l'origine de ce rappel, ni d'un argument du client
              // (raisons et règle : `applicationOfOAuthState`, `settings.ts`).
              const application = applicationOfOAuthState(await currentOAuthState())
              await ctx.runMutation(internal.modules.platform.operatorAccess.recordIdnSession as never, {
                sessionId: session.id, authUserId: session.userId, idnSubject: proof.subject, loa: proof.loa,
                ...(application ? { application } : {}),
              } as never)
            }
            // ADR-0044 : la personne n'existe pas encore (elle naît par `ensureMyPerson`) ; l'utilisateur de
            // la session, si. Ici seulement, une fois la session ouverte : ni connexion refusée, ni rattachement.
            await recordEntryPrefill(session.userId)
          }),
        }] },
      },
      convex({ authConfig, jwt: { expirationSeconds: 60 * 30 } }) as unknown as BetterAuthPlugin,
      browserSession,
      nativeIdn({ redirectUri: process.env.NATIVE_AUTH_REDIRECT_URI, siteUrl }),
      oneTimeToken({ expiresIn: 3, storeToken: "plain" }),
      bearer(),
      ...(idnProvider.length ? [genericOAuth({ config: idnProvider })] : []),
      rateLimitPlugin(ctx),
      // Après la garde d'origine, avant le rappel générique : un refus chez IDN revient à la porte de départ de confiance.
      ...(idnProvider.length ? [idnRefusalReturn()] : []),
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: 3,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp }, endpoint) {
          const state = deliveryState(endpoint?.context)
          if (state) state.attempted = true
          try {
            await deliverOtp(ctx, "email", email, otp, otpRequestOf(endpoint, requestOrigin))
            if (state) state.delivered = true
          } catch (error) {
            if (!state) throw error
          }
        },
      }),
      phoneNumber({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: 3,
        requireVerification: true,
        phoneNumberValidator: isE164Phone,
        sendOTP: async ({ phoneNumber: phone, code }, endpoint) => deliverOtp(ctx, "phone", phone, code, otpRequestOf(endpoint, requestOrigin)),
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone.replace(/\D/g, "")}@phone.antsia.invalid`,
          getTempName: () => BRAND_NAME,
        },
      }),
      // TOUJOURS le dernier greffon : son crochet passe après le jeton à usage unique (`crossDomain`), le JWT
      // Convex et le jeton porteur, et retire du rappel IDN web tout cookie de session (constat F1).
      ...(idnProvider.length ? [idnWebCallbackWithoutCookies()] : []),
    ],
  })
}
