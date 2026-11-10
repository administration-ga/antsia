/** Shared by the bell, the full list and its compact rail presentation. */
export const NOTIFICATIONS_STYLES_CSS = `
  .ntf-list { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .ntf-list-section { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .ntf-list-section h3 { margin: 0; padding: 0 4px; color: var(--foreground); font-size: 15px; font-weight: 700; }
  .ntf-list-section ul { display: flex; flex-direction: column; gap: 6px; list-style: none; margin: 0; padding: 0; }
  .ntf-row { position: relative; min-width: 0; padding: 12px 20px 12px 10px; border-radius: 12px; color: var(--foreground); }
  .ntf-row[data-unread] { background: color-mix(in srgb, var(--role-message-fill, var(--primary-fill)) 8%, var(--card)); }
  .ntf-row[data-compact] { padding: 8px 16px 8px 4px; }
  .ntf-open { display: flex; align-items: flex-start; gap: 12px; width: 100%; min-width: 0; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; overflow-wrap: anywhere; }
  a.ntf-open, button.ntf-open { cursor: pointer; }
  a.ntf-open:hover .ntf-sentence, button.ntf-open:hover .ntf-sentence { text-decoration: underline; text-underline-offset: 3px; }
  .ntf-open:focus-visible { outline: 2px solid var(--ring); outline-offset: 4px; }
  .ntf-avatar { position: relative; display: flex; flex: none; padding: 0 3px 3px 0; }
  .ntf-kind { position: absolute; right: 0; bottom: 0; display: grid; place-items: center; width: 21px; height: 21px; border: 2px solid var(--card); border-radius: 50%; }
  .ntf-details { display: flex; flex: 1 1 auto; flex-direction: column; gap: 4px; min-width: 0; }
  .ntf-sentence { display: block; color: var(--foreground); font-size: var(--esp-content-font-size, 14px); line-height: 1.45; overflow-wrap: anywhere; }
  .ntf-sentence strong { font-weight: 700; }
  .ntf-row[data-unread] .ntf-sentence { font-weight: 500; }
  .ntf-row[data-compact] .ntf-sentence { font-size: 13px; }
  .ntf-date { display: block; color: var(--muted-foreground); font-size: 12px; line-height: 1.4; }
  .ntf-row[data-unread] .ntf-date { color: var(--role-message-ink, var(--primary)); font-weight: 600; }
  .ntf-result { display: block; color: var(--muted-foreground); font-size: 12.5px; line-height: 1.45; }
  .ntf-unread-dot { position: absolute; right: 5px; top: 25px; width: 8px; height: 8px; border-radius: 50%; background: var(--role-message-fill, var(--primary-fill)); }
  .ntf-row-actions { margin: 8px 0 0 63px; min-width: 0; }
  .ntf-invite-actions { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
  .ntf-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  .ntf-filter { min-height: 44px; padding: 8px 14px; border: 0; border-radius: var(--esp-chip-radius, 10px); background: var(--muted); color: var(--foreground); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .ntf-filter[aria-pressed="true"] { background: var(--esp-tab-active-bg, var(--primary-50)); color: var(--esp-tab-active-fg, var(--primary-600)); }
  .ntf-filter:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .ntf-scope { margin: -4px 0 12px; color: var(--muted-foreground); font-size: 12px; line-height: 1.45; }
  .ntf-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  @media (max-width: 359px) { .ntf-row-actions { margin-left: 0; } .ntf-open { gap: 10px; } }
`
