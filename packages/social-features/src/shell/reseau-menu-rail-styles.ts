/** U02 — présentation du même rail, seulement sous la capacité adaptative de l'application. */
export const RESEAU_MENU_RAIL_ADAPTIVE_CSS = `
[data-reseau-menu-layout="adaptive"] {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
[data-reseau-menu-layout="adaptive"] > [data-slot="card"] {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
[data-reseau-menu-layout="adaptive"] .rmr-item,
[data-reseau-menu-layout="adaptive"] .rmr-identity {
  min-width: 44px;
  max-width: 100%;
  box-sizing: border-box;
}
[data-reseau-menu-layout="adaptive"] .rmr-item > svg {
  flex-shrink: 0;
}
[data-reseau-menu-layout="adaptive"] .rmr-label,
[data-reseau-menu-layout="adaptive"] .rmr-identity-label {
  min-width: 0;
  white-space: normal !important;
  overflow-wrap: anywhere;
}
[data-reseau-menu-layout="adaptive"] .rmr-badge {
  flex-shrink: 0;
}
[data-reseau-menu-layout="adaptive"] .rmr-appearance-link {
  display: none !important;
}
[data-reseau-menu-layout="adaptive"] .rmr-workspace-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--esp-surface-border, var(--border));
}
@media (min-width: 768px) and (max-width: 1199px) {
  [data-reseau-menu-layout="adaptive"] .rmr-appearance-controls {
    display: none;
  }
  [data-reseau-menu-layout="adaptive"] .rmr-appearance-link {
    display: flex !important;
  }
  [data-reseau-menu-layout="adaptive"] .rmr-item,
  [data-reseau-menu-layout="adaptive"] .rmr-identity {
    position: relative;
    justify-content: center !important;
    gap: 0 !important;
    padding-inline: 10px !important;
    min-height: 44px;
  }
  /* Masqués visuellement seulement : les noms et titres restent accessibles. */
  [data-reseau-menu-layout="adaptive"] .rmr-label,
  [data-reseau-menu-layout="adaptive"] .rmr-identity-label,
  [data-reseau-menu-layout="adaptive"] .rmr-section-title {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    clip-path: inset(50%) !important;
    white-space: nowrap !important;
    border: 0 !important;
  }
  [data-reseau-menu-layout="adaptive"] .rmr-badge {
    position: absolute;
    inset-block-start: 1px;
    inset-inline-end: 0;
    display: inline-flex;
  }
  [data-reseau-menu-layout="adaptive"] .rmr-badge > span {
    min-width: 18px;
    justify-content: center;
    padding: 1px 4px !important;
    font-size: 11px !important;
  }
}
`
