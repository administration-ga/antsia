// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ProfilFrame.tsx @ ad2e7fdc2 — adaptations : règles inchangées, feuille sortie du JSX dans une constante de module (`PROFIL_FRAME_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`) ; commentaires rapportés au moteur — le second porteur du cadre est une PAGE à identité propre (`ProfilPagePage`, réécrite sur les pages du moteur) et non plus une administration, la fiche est celle d'une personne du réseau (plus de dossier iProfil ni d'agent).
"use client"

/**
 * ProfilFrame — le cadre commun aux pages d'identité du réseau : une
 * PERSONNE (`ProfilPersonnePage`) ou une PAGE à identité propre — institution,
 * association, entreprise, média (`ProfilPagePage`). Bannière pleine largeur,
 * carte d'identité à cheval, corps qui défile — une seule gouttière, une seule
 * colonne.
 *
 * Extrait de `ProfilPersonnePage`, sans changement de comportement, quand la
 * fiche d'une page en a eu besoin à l'identique : aucune des classes CSS
 * ci-dessous ne connaît la forme du DTO qui remplit la carte — elles ne savent
 * que mettre en page une bannière, une identité et un corps.
 *
 * `.pp-avatar--square` est la SEULE addition à ce cadre : une page ne se rend
 * pas en médaillon (cf. `Avatar.tsx`, `avatarShapeFor`), et le cercle de
 * `.pp-avatar` doit alors suivre le cadre de son logo plutôt que l'arrondir.
 * `ProfilPersonnePage` ne pose jamais cette classe : son rendu est inchangé au
 * pixel près.
 *
 * ⚠️ AUCUN accent grave dans la feuille (`PROFIL_FRAME_CSS`) : elle vit dans
 * un littéral de gabarit, où un backtick termine la chaîne et casse le fichier.
 */

import type { ReactNode } from "react"
import { useNetwork } from "@antsia/api/network"
import { PROFILE_ADAPTIVE_CSS } from "./profile-adaptive-styles"

/**
 * La feuille du cadre, HORS du JSX : un littéral enfant de `<style>` passerait
 * pour une chaîne d'interface (cliquet `no-hardcoded-strings`). React 19 hisse
 * ce `<style href precedence>` dans `<head>` et le dédoublonne.
 */
const PROFIL_FRAME_CSS = `
        .rp-profile-frame {
          box-sizing: border-box;
          padding: 12px 14px 110px;
        }
        @media (min-width: 960px) {
          .rp-profile-frame { padding: 16px; }
        }

        /* ═══ Carte d'identité au modèle du réseau (LinkedIn) ═══
           Bannière pleine largeur, avatar à cheval, identité, actions. C'est
           ICI que ce traitement a sa place : ce profil EST la vitrine sociale
           de la personne (ou de la page).

           Le dégradé passe par la classe .esp-banner de la charte : c'est
           une valeur composée, elle ne se dit pas en jeton nu, et le cliquet
           de charte interdit toute couleur dans le TSX.
           ⚠️ AUCUN accent grave dans cette feuille : elle vit dans un
           littéral de gabarit, où un backtick termine la chaîne et casse le
           fichier. */
        .pp-identity {
          border: 1px solid var(--ink-200);
          border-radius: 20px;
          background: var(--ink-100);
          overflow: hidden;
        }
        .pp-banner { height: 128px; }
        /* La couverture PUBLIÉE (R-10) : le cadrage vient du composant
           (backgroundImage/cover/center, decide par profil-personne.ts), le
           FOND vient d'ici. Sans lui, une image qui ne charge pas laisserait
           une bande transparente au-dessus de la carte — un trou, la ou le
           repli sans couverture montre le degrade .esp-banner. */
        .pp-banner--photo { background-color: var(--ink-150); }
        .pp-identity-body { padding: 0 22px 20px; }
        .pp-avatar {
          /* À CHEVAL : c'est ce qui fait lire l'ensemble comme UNE carte
             d'identité, et non comme une image suivie d'un bloc de texte.
             Le liseré reprend le fond de la carte, jamais une couleur. */
          margin-top: -44px;
          margin-bottom: 12px;
          width: fit-content;
          border-radius: 999px;
          border: 4px solid var(--ink-100);
          background: var(--ink-100);
          line-height: 0;
        }
        /* Variante CARRÉE : le logo d'une page n'a pas de visage à
           évoquer — la monture suit son cadre plutôt que de l'arrondir en
           médaillon. */
        .pp-avatar--square {
          border-radius: calc(var(--radius-lg) + 4px);
        }
        .pp-name-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pp-name {
          margin: 0;
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -.02em;
          line-height: 1.15;
          color: var(--ink-900);
        }
        .pp-handle {
          margin: 3px 0 0;
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--ink-600);
        }
        .pp-headline {
          margin: 8px 0 0;
          max-width: 62ch;
          font-size: 14.5px;
          line-height: 1.5;
          color: var(--ink-700);
        }
        .pp-actions {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          margin-top: 16px;
        }
        .pp-self-note {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 14px 0 0;
          padding-top: 12px;
          border-top: 1px solid var(--ink-200);
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--ink-600);
        }
      `

export function ProfilFrame({ children }: { children: ReactNode }) {
  const { navigation, navigationLayout } = useNetwork()
  const adaptive = navigation === "destinations" && navigationLayout === "adaptive"
  return (
    <div
      className="citizen-scrollbar rp-profile-frame"
      data-profile-layout={adaptive ? "adaptive" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: adaptive ? "auto" : "100%",
        overflowY: adaptive ? "visible" : "auto",
        maxWidth: adaptive ? 1120 : 760,
        marginInline: "auto",
        width: "100%",
      }}
    >
      <style href="rp-profile-frame" precedence="default">
        {PROFIL_FRAME_CSS}
      </style>
      {adaptive ? <style href="rp-profile-adaptive-u05" precedence="default">{PROFILE_ADAPTIVE_CSS}</style> : null}
      {children}
    </div>
  )
}
