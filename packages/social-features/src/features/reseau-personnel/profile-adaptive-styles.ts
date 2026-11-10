/** U05 : profils ANTSIA sur le document, sans changer la pose des réseaux historiques.
 * ADR-0037 : la rangée d'actions (Ajouter, Suivre, Écrire, Clips…) passe à 25 px de haut,
 * comme les actions sociales compactes ; le libellé peut toujours passer à la ligne.
 * ⚠️ `!important` : chaque bouton pose sa géométrie en style en ligne (44 px pour le neutre). */
export const PROFILE_ADAPTIVE_CSS = `
  .rp-profile-frame[data-profile-layout="adaptive"] { min-width: 0; }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-identity { background: var(--card); color: var(--card-foreground); }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-banner { height: clamp(120px, 20vw, 224px); }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-identity-body { padding-inline: clamp(16px, 3vw, 28px); }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-avatar { background: var(--card); border-color: var(--card); }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-name-row { min-width: 0; align-items: baseline; }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-name,
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-handle,
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-headline { overflow-wrap: anywhere; }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-trust-badges { display: flex; flex-wrap: wrap; gap: 6px; }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-trust-badges:empty { display: none; }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-actions { align-items: stretch; gap: 8px; }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-actions > button,
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-actions > a {
    max-width: 100%; white-space: normal; overflow-wrap: anywhere; height: auto; min-height: 25px !important;
    padding-block: 3px !important; border-radius: var(--esp-social-action-radius, 6px) !important;
    font-size: 13px !important; line-height: 1.25 !important;
  }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-self-note { align-items: flex-start; }
  .rp-profile-frame[data-profile-layout="adaptive"] .pp-self-note > svg { flex: 0 0 auto; margin-top: 3px; }
  @media (min-width: 768px) {
    .rp-profile-frame[data-profile-layout="adaptive"] { padding: 16px 0 48px; }
  }
`
