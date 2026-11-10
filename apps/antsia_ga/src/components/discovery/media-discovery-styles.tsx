const MEDIA_DISCOVERY_CSS = `
.antsia-media-discovery { min-width: 0; display: flex; flex-direction: column; gap: 1rem; }
.antsia-media-filter { display: inline-flex; min-height: 2.75rem; align-items: center; padding: .5rem 1rem; border-radius: var(--esp-chip-radius); border: 1px solid var(--esp-surface-border); background: var(--card); color: var(--card-foreground); }
.antsia-media-filter[aria-current="page"] { border-color: var(--primary); color: var(--primary); }
.antsia-media-filter:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.antsia-media-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(.25rem, 1vw, .75rem); }
.antsia-media-grid-status { grid-column: 1 / -1; }
.antsia-media-tile { position: relative; display: flex; min-width: 0; aspect-ratio: 4 / 5; overflow: hidden; border-radius: var(--ui2-card-radius); background: var(--muted); border: 1px solid var(--esp-surface-border); color: var(--foreground); }
.antsia-media-tile:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
.antsia-media-tile img, .antsia-media-tile video { width: 100%; height: 100%; object-fit: cover; }
.antsia-media-tile-caption { position: absolute; inset: auto 0 0; display: flex; align-items: center; gap: .25rem; padding: .5rem; background: color-mix(in srgb, var(--card) 94%, transparent); color: var(--card-foreground); font-size: .75rem; }
.antsia-media-tile-caption span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.antsia-media-author { display: block; min-height: 2.75rem; padding: .5rem .25rem; overflow-wrap: anywhere; font-size: .75rem; color: var(--muted-foreground); }
.antsia-media-author:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.antsia-clips-list { display: flex; flex-direction: column; gap: 1rem; width: 100%; max-width: 49.5rem; margin-inline: auto; }
.antsia-clips-reader { width: 100%; max-width: 49.5rem; margin-inline: auto; }
@media (width >= 768px) { .antsia-media-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (width >= 1024px) { .antsia-media-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
@media (width >= 1440px) { .antsia-media-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
`

/** Styles limités à la découverte ANTSIA ; les surfaces utilisent la charte active. */
export function MediaDiscoveryStyles() {
  return <style href="antsia-media-discovery" precedence="default">{MEDIA_DISCOVERY_CSS}</style>
}
