// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ProfileMiniCard.tsx @ ad2e7fdc2 — adaptations : feuille sortie du JSX dans une constante de module (`PROFILE_MINI_CARD_CSS`, hauteur de bannière lue dans `RESEAU_COVER_HEIGHT`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface ; ma personne lue sur le moteur (`people.persons.getMyPerson`, sur soi) — l'identité ne se rend que d'un profil PUBLIÉ (identifiant et nom choisis), photo et couverture servies par la garde des fichiers (une image retenue retombe sur le repli) ; adresses par `useRoutes()` — ma fiche `profile(handle)` au lieu du dossier de l'espace, et le geste du rappel mène à la gestion de mon profil sur ma fiche (`profileManageHref`) ou, sans profil publié, aux réglages de l'application quand elle en sert (`settings?.()`, sinon pas de bouton) ; étapes du rappel relues sans identifiant provisoire (rien n'est publié d'office) ; textes par l'i18n (`reseau:profileMiniCard.*`, `profileOnboardingCopy(step, t)`) ; renvois au parchemin iProfil, au dossier `MonProfilPage` et au compte plateforme du socle retirés des commentaires. ; contour des surfaces posées sur la page lu dans --esp-surface-border, filet d'origine en repli (aucun contour quand le thème distingue déjà la carte du fond).
"use client"

/**
 * La BARRE DE PROFIL du réseau — l'en-tête de la page, en lecture.
 *
 * Elle remplace `ProfilePublicationCard` à cette place : cette carte-là est un
 * ÉDITEUR, et un éditeur n'a rien à faire en tête d'un fil qu'on parcourt. Il
 * vit dans la gestion de mon profil, sur ma fiche.
 *
 * ── Deux régimes, un seul retenu ───────────────────────────────────────────
 * `cover` choisit entre la couverture (bannière + avatar à cheval, au modèle
 * LinkedIn/Facebook) et la barre compacte : avatar 52 px, nom et `@handle` sur
 * une ligne, accroche poussée à droite, AUCUNE bannière. `reseau-header.ts`
 * (`showCover`) décide laquelle des deux s'affiche, volet par volet — la
 * décision retenue est la barre compacte PARTOUT
 * (`RESEAU_HEADER_VARIANT = "strip"`), si bien que le régime couverture n'est
 * plus exercé à l'écran aujourd'hui. Il reste implémenté (props et rendu
 * complets) pour ne pas casser un appelant qui omettrait `cover`, et pour la
 * variante `"cover-fil"` conservée en mémoire dans `reseau-header.ts`.
 *
 * En régime couverture, la bannière et l'avatar ont une taille CONSTANTE
 * (`RESEAU_COVER_HEIGHT` / `RESEAU_COVER_AVATAR`) à tous les paliers de
 * conteneur.
 *
 * ⚠️ Cette carte ne porte pas les volets : ils sont rendus par
 * `EspaceDossierTabs` (kit d'espace) dans la colonne centrale de
 * `ReseauAgentPage.tsx`, sur la ligne des onglets « chemise » — pas ici.
 *
 * ── L'IDENTITÉ EST RENDUE DANS LES TROIS ÉTATS, DANS LES DEUX RÉGIMES ─────
 * Chargement, profil absent, profil publié : la barre les rend toujours. Sans
 * quoi la carte de tête de la page apparaîtrait après coup, ou sauterait de
 * plusieurs dizaines de pixels quand la réponse arrive. L'état de chargement
 * porte donc une ossature aux mêmes dimensions — pas un vide.
 *
 * La rangée du bas (« Voir mon profil », l'action de tête) est CONSERVÉE dans
 * les deux régimes : c'est la seule partie de la carte qui ne varie pas.
 *
 * La couverture PUBLIÉE s'affiche ; à défaut (ou retenue par l'analyse), le
 * dégradé de la charte, par la classe `.esp-banner` — valeur composée, jamais
 * une couleur écrite dans le TSX. Les deux cas sont décidés par
 * `profil-personne.ts`, le même module que la page de profil : deux surfaces
 * de la même couverture ne peuvent pas diverger.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useRoutes } from "@antsia/api/network"
import { Link, useRouter } from "@antsia/api/routing"
import { Alert, Button, Card } from "@antsia/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Avatar } from "./Avatar"
import {
  COVER_BASE_MINI,
  coverBannerClassName,
  coverBannerStyle,
  profileManageHref,
} from "./profil-personne"
import {
  profileOnboardingCopy,
  profileOnboardingStep,
} from "./profile-onboarding"
import { useProfileOnboardingAccount } from "./use-profile-onboarding"
import { RESEAU_COVER_AVATAR, RESEAU_COVER_HEIGHT, stripAvatarSize } from "../../shell/reseau-header"

/**
 * La feuille de la carte, HORS du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 * React 19 hisse ce `<style href precedence>` dans `<head>` et le dédoublonne.
 */
const PROFILE_MINI_CARD_CSS = `
        /* ── Régime COUVERTURE (cover={true}) : bannière + avatar à cheval ──
           Taille CONSTANTE désormais, à tous les paliers de conteneur —
           RESEAU_COVER_HEIGHT / RESEAU_COVER_AVATAR de reseau-header.ts,
           testés. Le double palier 145/160 (large) vs 104/88 (étroit) a
           disparu : ce régime ne sert plus qu'à la variante cover-fil, sur
           un seul volet, où la carte n'a jamais besoin d'être aussi imposante
           qu'avant. */
        .rp-mini-banner { height: ${RESEAU_COVER_HEIGHT}px; }
        /* Fond neutre SOUS la couverture publiée (R-10) : une image qui ne
           charge pas laisse un aplat, jamais une bande transparente. */
        .rp-mini-banner--photo { background-color: var(--ink-150); }
        .rp-mini-identity {
          display: block;
          color: inherit;
          text-decoration: none;
        }
        .rp-mini-body {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          /* 12 px et non 16 : le nom appartient au cercle, il ne lui fait pas
             face. Resserrer les rapproche sans les coller au liseré. */
          gap: 0 12px;
          padding: 0 22px 18px;
        }
        .rp-mini-avatar {
          /* À cheval sur la couverture, moitié dessus moitié dessous. Le
             retrait vaut la MOITIÉ du diamètre plus le liseré qui s'ajoute
             au-dessus du cercle : 88 / 2 + 4 = 48 — la même arithmétique que
             reseau-header.test.ts vérifie. */
          flex: 0 0 auto;
          margin-top: -48px;
          width: fit-content;
          border-radius: 999px;
          /* Le liseré doit valoir la SURFACE de la carte pour disparaître
             dedans — en dur sur --ink-0, il dessinait un anneau clair sur la
             surface de la carte. */
          border: 4px solid var(--esp-surface-card, var(--ink-0));
          background: var(--esp-surface-card, var(--ink-0));
          line-height: 0;
        }
        .rp-mini-ident {
          flex: 1 1 auto;
          min-width: 0;
          padding-top: 10px;
        }
        .rp-mini-name {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.2;
          color: var(--ink-900);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rp-mini-handle {
          margin: 3px 0 0;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--ink-600);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rp-mini-headline {
          /* Au bord opposé : le décalage supérieur rattrape la différence de
             corps entre les deux, pour que les deux textes reposent sur la
             même ligne de base. */
          flex: 0 1 auto;
          margin: 0;
          padding-top: 12px;
          max-width: 46ch;
          text-align: right;
          font-size: 13px;
          line-height: 1.45;
          color: var(--ink-700);
        }
        .rp-mini-skeleton-avatar {
          /* display: block — requis pour les usages en <span> (barre
             compacte) : un span reste phrasing content, sa largeur/hauteur
             explicite serait sinon ignorée. Sans effet sur les usages en
             <div> (couverture), déjà block par défaut. */
          display: block;
          border-radius: 999px;
          background: var(--ink-200); /* un barreau AU-DESSUS de la carte — sur son propre ton, un squelette n'existe pas */
        }
        .rp-mini-skeleton-line {
          display: block;
          height: 14px;
          border-radius: 7px;
          background: var(--ink-200); /* un barreau AU-DESSUS de la carte — sur son propre ton, un squelette n'existe pas */
        }

        /* ── Régime BARRE COMPACTE (cover={false}) : celui qui est utilisé ──
           Pas de bannière, pas d'avatar à cheval : une rangée dense. */
        .rp-mini-strip {
          display: flex;
          align-items: center;
          flex-wrap: nowrap;
          gap: 12px;
          padding: 14px 20px;
          color: inherit;
          text-decoration: none;
        }
        .rp-mini-strip-avatar { flex: 0 0 auto; line-height: 0; }
        .rp-mini-strip-id {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          min-width: 0;
          flex: 1 1 auto;
        }
        .rp-mini-strip-name {
          min-width: 0;
          font-size: 15px;
          font-weight: 700;
          color: var(--ink-900);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rp-mini-strip-handle {
          display: block;
          width: 100%;
          min-width: 0;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--ink-600);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* Poussée à droite par la marge automatique — dernier élément de la
           rangée, elle prend tout l'espace que l'identité lui laisse. */
        .rp-mini-strip-headline {
          flex: 0 1 auto;
          min-width: 0;
          max-width: 40ch;
          margin-left: auto;
          text-align: right;
          font-size: 13px;
          color: var(--ink-700);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ── La barre du bas : profil, action principale — CONSERVÉE dans
           les deux régimes (c'est la seule partie qui ne varie pas). ────── */
        .rp-identity-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 6px 8px;
          padding: 8px 20px;
          border-top: 1px solid var(--ink-200);
        }
        .rp-identity-cta {
          font-size: 13px;
          font-weight: 700;
          color: var(--primary-600);
          /* Une action en texte des chartes est soulignée (ADR-0030) ; sans trait ailleurs. */
          text-decoration: var(--esp-inline-link-decoration, none);
          white-space: nowrap;
        }
        .rp-identity-cta:hover { text-decoration: underline; }
        .rp-identity-action {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          margin-inline: auto;
        }
      `

export function ProfileMiniCard({
  action,
  cover = true,
}: {
  action?: ReactNode
  /**
   * Bannière + avatar à cheval (`true`, comportement historique par défaut),
   * ou barre compacte sans bannière (`false`, celle qu'utilise
   * `ReseauAgentPage.tsx` via `showCover`). Le défaut `true` protège un futur
   * second appelant qui omettrait la prop — un seul appelant existe
   * aujourd'hui.
   */
  cover?: boolean
}) {
  const { t } = useTranslation("reseau")
  const router = useRouter()
  const routes = useRoutes()
  const profile = useAuthenticatedConvexQuery(
    api.modules.people.persons.getMyPerson,
    {},
  )

  const settled = !profile.isLoading && profile.data !== undefined
  /**
   * L'identité ne se rend que d'un profil PUBLIÉ : une personne qui n'a pas
   * encore publié (ou qui s'est retirée) n'a ni nom ni adresse à montrer —
   * rien n'est repris de son compte.
   */
  const mine = settled ? profile.data : null
  const person =
    mine && mine.published && mine.handle && mine.displayName
      ? {
          handle: mine.handle,
          displayName: mine.displayName,
          headline: mine.headline ?? null,
          avatarUrl: mine.avatar?.url ?? null,
          coverUrl: mine.cover?.url ?? null,
        }
      : null
  const profileHref = person === null ? null : routes.profile(person.handle)
  // La personne en cours de création : sans ce fait, la carte annoncerait
  // « Vous n'êtes pas encore trouvable » le temps que la session la crée. Le
  // RÔLE du compte n'entre pas dans cette décision.
  const onboardingAccount = useProfileOnboardingAccount()
  const onboardingCopy = profileOnboardingCopy(
    profileOnboardingStep(profile.data, onboardingAccount),
    t,
  )
  /**
   * Où mène le geste du rappel : la gestion de mon profil, sur ma fiche, quand
   * elle existe (hors connexion) ; sinon les réglages de l'application, quand
   * elle en sert. Aucune destination : pas de bouton — une commande qui ne
   * mène nulle part vaut moins que son absence.
   */
  const onboardingTarget =
    profileHref !== null
      ? profileManageHref(profileHref)
      : (routes.settings?.() ?? null)
  const stripAvatar = stripAvatarSize()

  return (
    <Card
      style={{
        padding: 0,
        overflow: "hidden",
        /* Le rayon local du Card diffère selon l'hôte et ses tokens ; le
           bureau du réseau impose ici le même contrat que ses autres surfaces. */
        borderRadius: "var(--rp-surface-radius, 18px)",
        /* La surface de carte UNIFIÉE du réseau (charte de base) : sans elle,
           le Card reste sur son fond par défaut et cette carte est la seule
           de la page à ne pas porter la surface commune. */
        background: "var(--esp-surface-card, var(--ink-0))",
        /* Carte posée sur la page : aucun filet quand le thème la distingue
           déjà du fond (`--esp-surface-border`), le filet du Card sinon. */
        border: "1px solid var(--esp-surface-border, var(--ink-200))",
      }}
    >
      <style href="rp-minicard" precedence="default">
        {PROFILE_MINI_CARD_CSS}
      </style>

      {/* Ce que la personne doit régler à propos de son profil — le publier,
          ou savoir qu'il est hors connexion. La règle est UNE
          (`profile-onboarding`) : cette alerte vivait en plusieurs exemplaires
          divergents.

          ⚠️ Elle est SŒUR de l'identité, non son remplacement, dans les DEUX
          régimes : un profil hors connexion a bien une identité à montrer,
          donc la coupler à son absence l'aurait rendue invisible. */}
      {settled && onboardingCopy ? (
        <div className="rp-mini-optin">
          <Alert tone="info" title={onboardingCopy.title}>
            {onboardingCopy.body}
          </Alert>
          {onboardingTarget !== null ? (
            <div>
              {/* Un `<Link>` DANS un `<button>` est du balisage invalide et se
                  tabule deux fois : c'est le bouton qui navigue. */}
              <Button
                icon="userPlus"
                size="sm"
                onClick={() => router.push(onboardingTarget)}
              >
                {onboardingCopy.action}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {cover ? (
        person !== null && profileHref !== null ? (
          /*
           * UN SEUL lien enveloppe la couverture, l'avatar, le nom et
           * l'accroche. Deux cibles adjacentes vers la même page se
           * tabulent deux fois et s'annoncent deux fois — « Voir mon
           * profil » vit dans la barre du bas, hors de ce lien, pour la
           * même raison.
           */
          <Link href={profileHref} className="rp-mini-identity">
            <div
              aria-hidden="true"
              className={coverBannerClassName(person.coverUrl, COVER_BASE_MINI)}
              style={coverBannerStyle(person.coverUrl)}
            />
            <div className="rp-mini-body">
              <div className="rp-mini-avatar">
                <Avatar
                  displayName={person.displayName}
                  avatarUrl={person.avatarUrl}
                  size={RESEAU_COVER_AVATAR}
                />
              </div>
              <div className="rp-mini-ident">
                <p className="rp-mini-name">{person.displayName}</p>
                <p className="rp-mini-handle">@{person.handle}</p>
              </div>
              {person.headline ? (
                <p className="rp-mini-headline">{person.headline}</p>
              ) : null}
            </div>
          </Link>
        ) : settled ? null : (
          <div aria-hidden="true">
            <div className="esp-banner rp-mini-banner" />
            <div className="rp-mini-body">
              <div className="rp-mini-avatar">
                <div
                  className="rp-mini-skeleton-avatar"
                  style={{ width: RESEAU_COVER_AVATAR, height: RESEAU_COVER_AVATAR }}
                />
              </div>
              <div className="rp-mini-ident">
                <div
                  className="rp-mini-skeleton-line"
                  style={{ width: 200, height: 18 }}
                />
                <div
                  className="rp-mini-skeleton-line"
                  style={{ width: 110, height: 12, marginTop: 10 }}
                />
              </div>
              <div
                className="rp-mini-headline"
                style={{ paddingTop: 4, width: 220 }}
              >
                <div className="rp-mini-skeleton-line" style={{ height: 12 }} />
              </div>
            </div>
          </div>
        )
      ) : person !== null && profileHref !== null ? (
        <Link href={profileHref} className="rp-mini-strip">
          <span className="rp-mini-strip-avatar">
            <Avatar
              displayName={person.displayName}
              avatarUrl={person.avatarUrl}
              size={stripAvatar}
            />
          </span>
          <span className="rp-mini-strip-id">
            <span className="rp-mini-strip-name">{person.displayName}</span>
            <span className="rp-mini-strip-handle">@{person.handle}</span>
          </span>
          {person.headline ? (
            <span className="rp-mini-strip-headline">{person.headline}</span>
          ) : null}
        </Link>
      ) : settled ? null : (
        // ⚠️ Des <span>, jamais des <div> : les parents .rp-mini-strip-avatar
        // et .rp-mini-strip-id sont des <span> (phrasing content), un <div>
        // dedans serait un balisage invalide — corrigé UNE fois ici plutôt
        // que dans les deux composants divergents que ça aurait fait naître.
        <div aria-hidden="true" className="rp-mini-strip">
          <span className="rp-mini-strip-avatar">
            <span
              className="rp-mini-skeleton-avatar"
              style={{ width: stripAvatar, height: stripAvatar }}
            />
          </span>
          <span className="rp-mini-strip-id">
            <span
              className="rp-mini-skeleton-line"
              style={{ width: 140, height: 14 }}
            />
            <span
              className="rp-mini-skeleton-line"
              style={{ width: 90, height: 11, marginTop: 0 }}
            />
          </span>
          <span
            className="rp-mini-skeleton-line"
            style={{ width: 160, height: 11, marginLeft: "auto" }}
          />
        </div>
      )}

      <div className="rp-identity-bar">
        {profileHref !== null ? (
          <Link href={profileHref} className="rp-identity-cta">
            {t("profileMiniCard.viewProfile")}
          </Link>
        ) : (
          /* La rangée garde deux extrémités même sans lien : sans quoi une
             action éventuelle glisserait à gauche le temps du chargement. */
          <span aria-hidden="true" />
        )}
        {action !== undefined ? (
          <div className="rp-identity-action">{action}</div>
        ) : null}
      </div>
    </Card>
  )
}
