"use client"

/**
 * Les commandes AJOUTÉES par le coordinateur à une vidéo de publication — lot
 * P04. Rendues seulement quand un coordinateur est monté (`useCoordinatedVideo`
 * non nul) : sans lui, la vidéo n'a que ses commandes natives (P03), à
 * l'identique.
 *
 *  · « Lire » : la publication ACTIVE du lecteur immersif dont la lecture
 *    automatique est impossible (refus du navigateur, économie de données) —
 *    jamais un faux départ, jamais de lecture sans geste ;
 *  · « Son » : bouton à bascule (`aria-pressed`) de la vidéo active du lecteur
 *    — la lecture automatique est muette, le son demande ce geste ;
 *  · la raison d'une suspension (appel, onglet masqué), dite en clair.
 *
 * Les commandes natives restent en bas du cadre ; ces boutons occupent le
 * centre (« Lire », seulement à l'arrêt) et le coin haut droit (« Son »).
 */

import { Play, Volume2, VolumeX } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { CoordinatedVideo } from "./use-coordinated-video"

/**
 * La feuille, hors du JSX : un littéral enfant de `<style>` passerait pour une
 * chaîne d'interface (cliquet `no-hardcoded-strings`). Jetons de la charte
 * seulement ; la scène vidéo est sombre (`--esp-immersive-*`).
 */
export const MEDIA_PLAYBACK_CSS = `
      .mpb-play {
        position: absolute;
        top: 50%;
        left: 50%;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        gap: var(--sp-2);
        min-width: 44px;
        min-height: 48px;
        padding: 0 var(--sp-4);
        transform: translate(-50%, -50%);
        border: 1px solid color-mix(in srgb, var(--esp-immersive-on-ink) 40%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--esp-immersive-ink) 78%, transparent);
        color: var(--esp-immersive-on-ink);
        font: inherit;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
      }
      .mpb-sound {
        position: absolute;
        top: var(--sp-2);
        right: var(--sp-2);
        z-index: 2;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--esp-immersive-on-ink) 40%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--esp-immersive-ink) 72%, transparent);
        color: var(--esp-immersive-on-ink);
        cursor: pointer;
      }
      .mpb-sound[aria-pressed="true"] {
        background: var(--esp-immersive-on-ink);
        color: var(--esp-immersive-ink);
      }
      .mpb-play:focus-visible,
      .mpb-sound:focus-visible {
        outline: 3px solid var(--esp-immersive-on-ink);
        outline-offset: 2px;
      }
      .mpb-note {
        position: absolute;
        top: var(--sp-2);
        left: var(--sp-2);
        z-index: 2;
        max-width: calc(100% - 72px);
        margin: 0;
        padding: 4px var(--sp-2);
        border-radius: var(--esp-primitive-chip-radius, var(--radius-lg));
        background: var(--popover);
        color: var(--popover-foreground);
        box-shadow: var(--esp-surface-shadow, var(--shadow-sm));
        font-size: 13px;
        font-weight: 600;
        line-height: 1.35;
      }
    `

export function MediaPlaybackStyles() {
  return (
    <style href="media-playback" precedence="default">{MEDIA_PLAYBACK_CSS}</style>
  )
}

export function CoordinatedVideoControls({ video }: { video: CoordinatedVideo }) {
  const { t } = useTranslation("reseau")
  const { snapshot } = video
  const suspension = snapshot.suspendedBy === "call" || snapshot.suspendedBy === "hidden" ? snapshot.suspendedBy : null
  const showPlay = snapshot.managed && snapshot.needsManualStart && suspension === null
  const showSound = snapshot.managed && snapshot.role === "active"
  if (!showPlay && !showSound && suspension === null) return null
  return (
    <>
      <MediaPlaybackStyles />
      {showPlay ? (
        <button type="button" className="mpb-play" onClick={video.requestPlay}>
          <Play aria-hidden="true" size={20} strokeWidth={2.2} />
          <span>{t("mediaPlayback.play")}</span>
        </button>
      ) : null}
      {showSound ? (
        <button
          type="button"
          className="mpb-sound"
          aria-pressed={!snapshot.muted}
          aria-label={t("mediaPlayback.sound")}
          title={t("mediaPlayback.sound")}
          onClick={video.toggleSound}
        >
          {snapshot.muted ? <VolumeX aria-hidden="true" size={20} strokeWidth={2.2} /> : <Volume2 aria-hidden="true" size={20} strokeWidth={2.2} />}
        </button>
      ) : null}
      {suspension !== null ? (
        <p className="mpb-note" role="status">
          {t(`mediaPlayback.suspended.${suspension}`)}
        </p>
      ) : null}
    </>
  )
}
