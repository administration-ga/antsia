"use client"

import { createLocalTracks, Track, type LocalTrack } from "livekit-client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { describeCallMediaError } from "../iappel/media-errors"

/** Local host preview, adapted from Administration's DirectPreflightPanel. No room or token is opened here. */
export function useDirectDraftPreview(enabled: boolean) {
  const { t } = useTranslation("direct")
  const [audioOnly, setAudioOnly] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading")
  const [error, setError] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const tracks = useRef<LocalTrack[]>([])

  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    video.current = element
    const camera = tracks.current.find((track) => track.kind === Track.Kind.Video)
    if (element && camera) camera.attach(element)
  }, [])

  const release = useCallback(() => {
    const captured = tracks.current
    tracks.current = []
    for (const track of captured) {
      track.detach()
      track.stop()
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let active = true
    let captured: LocalTrack[] = []
    const lost = () => {
      if (!active) return
      release()
      setStatus("failed")
      setError(t("preflight.failed"))
    }
    const acquire = async () => {
      // The first effect mount is discarded during Strict Mode's lifecycle check.
      await Promise.resolve()
      if (!active) return
      setStatus("loading")
      setError(null)
      try {
        captured = await createLocalTracks({ audio: true, video: !audioOnly })
        if (!active) {
          captured.forEach((track) => track.stop())
          return
        }
        tracks.current = captured
        if (captured.some((track) => track.mediaStreamTrack.readyState !== "live") ||
          !captured.some((track) => track.kind === Track.Kind.Audio) ||
          (!audioOnly && !captured.some((track) => track.kind === Track.Kind.Video))) {
          lost()
          return
        }
        for (const track of captured) track.mediaStreamTrack.addEventListener("ended", lost)
        const camera = captured.find((track) => track.kind === Track.Kind.Video)
        if (camera && video.current) camera.attach(video.current)
        setStatus("ready")
      } catch (failure) {
        if (!active) return
        release()
        setStatus("failed")
        setError(describeCallMediaError(failure, { video: !audioOnly }, t) ?? t("preflight.failed"))
      }
    }
    void acquire()
    return () => {
      active = false
      for (const track of captured) track.mediaStreamTrack.removeEventListener("ended", lost)
      release()
    }
  }, [enabled, audioOnly, attempt, release, t])

  const isReady = () => tracks.current.length > 0 && tracks.current.every((track) => track.mediaStreamTrack.readyState === "live")
  return {
    audioOnly, setAudioOnly, attachVideo, status, error, isReady, release,
    retry: () => setAttempt((value) => value + 1),
  }
}
