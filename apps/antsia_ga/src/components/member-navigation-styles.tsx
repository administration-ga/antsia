/**
 * U02 : styles propres à ANTSIA ; les thèmes et les seuils des autres réseaux restent intacts.
 * U09 (épure) : un seul cadre pour toutes les pages de membre ET le fil (reseau-adaptive-styles
 * du moteur), 24 px en tête dès 768 px, et la barre du haut aligne ses bords sur ce cadre.
 * Gouttière unique (décision du propriétaire du 22/10/2026) : dès 768 px, la marge extérieure,
 * l'écart entre le rail et le contenu et le retrait de la barre du haut valent le MÊME jeton,
 * `--spacing-gutter` (`globals.css` : 16 px, puis 24 px dès 1 200 px), et le cadre n'a plus de
 * largeur maximale. Au téléphone, 12 px comme avant.
 */
import { MOBILE_NAVIGATION_CSS } from "./mobile-navigation-styles"
import { MobileNavigationViewport } from "./mobile-navigation-viewport"

export const MEMBER_NAVIGATION_CSS = `
  .antsia-topbar-row {
    box-sizing: border-box;
    width: 100%;
    padding-inline: 12px;
  }
  .antsia-member-frame {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding-inline: 12px;
  }
  .antsia-member-rail { display: none; }
  .antsia-member-content {
    min-width: 0;
    padding-block: 16px;
  }
  .antsia-member-frame[data-with-navigation] > .antsia-member-content {
    padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  }
  .antsia-member-frame[data-workspace] {
    flex: 1 1 auto;
    min-height: 0;
  }
  .antsia-member-frame[data-workspace] > .antsia-member-content {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    padding-block: 0;
  }
  /* La barre globale remplace la barre locale d'iCom en U02. Ses trois vues
     restent accessibles dans leur navigation, y compris sur téléphone. */
  .antsia-member-workspace .icom-messages-page[data-mobile="true"] .icom-page-navigation {
    display: flex;
  }
  @media (min-width: 768px) {
    .antsia-topbar-row,
    .antsia-member-frame { padding-inline: var(--spacing-gutter, 16px); }
    .antsia-member-frame[data-with-navigation] {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      align-items: start;
      gap: var(--spacing-gutter, 16px);
    }
    .antsia-member-rail {
      display: block;
      position: sticky;
      top: var(--esp-sticky-header-inset, 64px);
      min-width: 0;
      max-height: calc(100dvh - var(--esp-sticky-header-inset, 64px));
      overflow-y: auto;
      overscroll-behavior-y: auto;
      padding-block: 24px;
    }
    .antsia-member-content,
    .antsia-member-frame[data-with-navigation] > .antsia-member-content {
      padding-block: 24px;
    }
    .antsia-member-frame[data-workspace] > .antsia-member-content { padding-block: 0; }
    .antsia-member-frame[data-workspace] > .antsia-member-rail {
      height: 100%;
      max-height: 100%;
      padding-block: 16px;
    }
    .antsia-member-workspace .icom-messages-page[data-mobile="true"] { height: 100%; }
  }
  @media (min-width: 1200px) {
    .antsia-topbar-row,
    .antsia-member-frame { padding-inline: var(--spacing-gutter, 24px); }
    .antsia-member-frame[data-with-navigation] {
      grid-template-columns: 248px minmax(0, 1fr);
      gap: var(--spacing-gutter, 24px);
    }
  }
${MOBILE_NAVIGATION_CSS}
`

/** Monté une fois dans NetworkShell, sans envelopper ou déplacer l'hôte d'appel. */
export function MemberNavigationStyles() {
  return <><style href="antsia-member-navigation" precedence="default">{MEMBER_NAVIGATION_CSS}</style><MobileNavigationViewport /></>
}
