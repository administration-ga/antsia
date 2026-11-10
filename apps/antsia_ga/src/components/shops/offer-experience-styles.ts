/** Actions complémentaires du commerce : liens réels, surface neutre et cible tactile. */
export const SHOP_ACTION_CLASS = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--esp-social-action-radius,var(--ui2-button-radius))] border border-[color:var(--ui2-button-outline-border,var(--border))] bg-[var(--ui2-button-outline-bg,var(--card))] px-4 py-2 text-center text-sm font-semibold text-foreground hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/** U05/U07 : deux colonnes seulement quand la fiche dispose elle-même de 832px ; la galerie d'abord au téléphone. */
export const OFFER_DETAIL_CSS = `
[data-offer-detail-frame] { container: offer-detail / inline-size; min-width: 0; }
[data-offer-detail-frame] .offer-detail-layout { display: grid; grid-template-columns: minmax(0, 1fr); }
@container offer-detail (min-width: 832px) {
  [data-offer-detail-frame] .offer-detail-layout { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  [data-offer-detail-frame] .offer-detail-heading { grid-column: 2; grid-row: 1; align-content: start; }
  /* Le nom, le prix et l'achat restent en vue pendant que la galerie et les sections défilent (sous l'en-tête de l'espace). */
  [data-offer-detail-frame] .offer-detail-heading { position: sticky; top: 5rem; align-self: start; }
  [data-offer-detail-frame] .offer-detail-media { grid-column: 1; grid-row: 1; }
  [data-offer-detail-frame] .offer-detail-full { grid-column: 1 / -1; }
}
`
