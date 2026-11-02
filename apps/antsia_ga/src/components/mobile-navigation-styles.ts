/** Habillage du dock ANTSIA seulement ; les composants partagés gardent leurs styles ailleurs. */
export const MOBILE_NAVIGATION_CSS = `
  @media (width < 768px) {
    [data-reseau-destinations],
    [data-antsia-mobile-navigation] {
      position: fixed;
      inset-inline: 12px;
      bottom: 0;
      z-index: 40;
      box-sizing: border-box;
      padding: 0 0 calc(8px + env(safe-area-inset-bottom, 0px));
    }
    [data-antsia-mobile-navigation] {
      display: block;
      border: 0;
      background: transparent;
      backdrop-filter: none;
    }
    [data-reseau-destinations] > .esp-reseau-tabbar,
    [data-antsia-mobile-navigation] > [data-navigation-dock] {
      box-sizing: border-box;
      height: 64px;
      border: 1px solid var(--esp-mobilebar-border, var(--border));
      border-radius: min(var(--esp-mobilebar-radius, 20px), 22px);
      background: var(--card);
      background: color-mix(in srgb, var(--card) 96%, transparent);
      box-shadow: var(--esp-mobilebar-shadow, var(--shadow-lg));
      -webkit-backdrop-filter: blur(16px) saturate(1.1);
      backdrop-filter: blur(16px) saturate(1.1);
    }
    [data-antsia-mobile-navigation] > [data-navigation-dock] {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 2px;
      height: 64px;
      box-sizing: border-box;
      padding: 4px;
    }
    [data-reseau-destinations] > .esp-reseau-tabbar > ul {
      height: 100%;
      box-sizing: border-box;
      padding: 4px;
      gap: 2px;
    }
    [data-reseau-destinations] [data-destination-item],
    [data-antsia-mobile-navigation] [data-destination-item] {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      min-width: 44px;
      min-height: 54px;
      height: 100%;
      padding: 3px 1px;
      border-radius: 12px;
      background: transparent;
      color: var(--muted-foreground);
      text-decoration: none;
      transition: color 160ms ease;
    }
    [data-reseau-destinations] [data-destination-icon],
    [data-antsia-mobile-navigation] [data-destination-icon] {
      position: relative;
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 28px;
      border-radius: 10px;
      background: transparent;
      color: inherit;
      box-shadow: none;
      transition: background-color 160ms ease, color 160ms ease;
    }
    [data-reseau-destinations] [data-destination-icon] > svg,
    [data-antsia-mobile-navigation] [data-destination-icon] > svg {
      width: 22px;
      height: 22px;
      stroke-width: 1.8;
    }
    [data-reseau-destinations] [data-destination-label],
    [data-antsia-mobile-navigation] [data-destination-label] {
      position: static;
      display: block;
      width: 100%;
      height: auto;
      margin: 0;
      padding: 0;
      border-width: 0;
      overflow: hidden;
      clip: auto;
      clip-path: none;
      white-space: nowrap;
      text-align: center;
      text-overflow: ellipsis;
      font-size: 11px;
      font-weight: 500;
      line-height: 14px;
      letter-spacing: -0.01em;
      color: inherit;
    }
    [data-reseau-destinations] [data-destination-item]:is(:hover, [aria-current="page"], [aria-expanded="true"]),
    [data-antsia-mobile-navigation] [data-destination-item]:is(:hover, [aria-current="page"]) {
      background: transparent;
      color: var(--foreground);
    }
    [data-reseau-destinations] [data-destination-item]:is([aria-current="page"], [aria-expanded="true"]) [data-destination-icon],
    [data-antsia-mobile-navigation] [data-destination-item][aria-current="page"] [data-destination-icon] {
      background: var(--esp-tab-active-bg, var(--accent));
      color: var(--esp-tab-active-fg, var(--accent-foreground));
    }
    [data-reseau-destinations] [data-destination-item][aria-current="page"] [data-destination-icon] > svg,
    [data-antsia-mobile-navigation] [data-destination-item][aria-current="page"] [data-destination-icon] > svg {
      stroke-width: 2.2;
    }
    [data-reseau-destinations] [data-destination-item][aria-current="page"] [data-destination-label],
    [data-antsia-mobile-navigation] [data-destination-item][aria-current="page"] [data-destination-label] {
      font-weight: 700;
    }
    [data-reseau-destinations] [data-destination-item][aria-current="page"]::after,
    [data-antsia-mobile-navigation] [data-destination-item][aria-current="page"]::after {
      content: "";
      position: absolute;
      bottom: 1px;
      left: calc(50% - 6px);
      width: 12px;
      height: 2px;
      border-radius: 2px;
      background: var(--primary-fill);
    }
    [data-reseau-destinations] [data-destination-badge],
    [data-antsia-mobile-navigation] [data-space-cart-count] {
      min-width: 16px;
      height: 16px;
      padding-inline: 4px;
      font-size: 10px;
      line-height: 16px;
    }
    [data-antsia-mobile-navigation] [data-space-cart-count] {
      right: calc(50% - 25px);
      top: 2px;
    }
    html[data-antsia-nav-keyboard] [data-reseau-destinations],
    html[data-antsia-nav-keyboard] [data-antsia-mobile-navigation] {
      visibility: hidden;
      pointer-events: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-reseau-destinations] [data-destination-item],
    [data-reseau-destinations] [data-destination-icon],
    [data-antsia-mobile-navigation] [data-destination-item],
    [data-antsia-mobile-navigation] [data-destination-icon] { transition: none; }
  }
`
