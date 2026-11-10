import type { PostMediaDto } from "@antsia/social-contracts/media"
import { useVideoPlayer, VideoView } from "expo-video"
import { useEffect, useState } from "react"
import { Image, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { Label, useNativeGuard, useReducedMotion } from "./ui"
import { useNativeCalls } from "../calls"

function GuardedVideo({ url, edgeToEdge = false, ratio = 1, frameHeight, onReady }: { url: string; edgeToEdge?: boolean; ratio?: number; frameHeight?: number; onReady?: () => void }) {
  const { tokens, t } = useNativeAppearance(), guard = useNativeGuard(), calls = useNativeCalls()
  const { current: isCurrent } = guard, { registerCleanup } = guard.runtime, { registerMediaStop } = calls
  const reducedMotion = useReducedMotion()
  const player = useVideoPlayer({ uri: url }, (created) => { created.loop = false; created.muted = true })
  useEffect(() => {
    if (isCurrent() && !reducedMotion) player.play()
    else player.pause()
    const unregister = registerCleanup(() => { try { player.pause() } catch { /* Le lecteur peut déjà être libéré. */ } })
    return () => { unregister(); try { player.pause() } catch { /* useVideoPlayer libère au démontage. */ } }
  }, [isCurrent, registerCleanup, player, reducedMotion])
  useEffect(() => registerMediaStop(() => { try { player.pause() } catch { /* Reader already released. */ } }), [registerMediaStop, player])
  return <View accessibilityLabel={t("mobile.media.video")} style={{ borderRadius: edgeToEdge ? 0 : tokens.radiusMedia, overflow: "hidden" }}><VideoView player={player} nativeControls contentFit={edgeToEdge ? "cover" : "contain"} onFirstFrameRender={() => { if (guard.current()) onReady?.() }} style={{ width: "100%", ...(frameHeight ? { height: frameHeight } : edgeToEdge ? { aspectRatio: ratio } : { height: 240 }) }} /></View>
}
export function GuardedMedia({ items, active, edgeToEdge = false, frameHeight, onReady }: { items: readonly PostMediaDto[]; active: boolean; edgeToEdge?: boolean; frameHeight?: number; onReady?: () => void }) {
  const { tokens, t } = useNativeAppearance(), guard = useNativeGuard(), calls = useNativeCalls()
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const firstVideo = items.findIndex(item => item.kind === "video")
  if (!guard.canRead) return null
  return <View style={{ gap: 8 }}>{items.map((item, index) => {
    const key = String(index) + ":" + (item.url ?? item.withheld ?? "")
    if (item.withheld !== null || item.url === null) return <Label key={key} muted>{t(item.withheld === "fileQuarantined" ? "mobile.media.quarantined" : "mobile.media.withheld")}</Label>
    if (failed.has(key)) return <Label key={key} muted>{t("mobile.media.unavailable")}</Label>
    const declared = item.width && item.height && Number.isFinite(item.width) && Number.isFinite(item.height) && item.width > 0 && item.height > 0 ? item.width / item.height : 1
    // Bornes de la présentation du fil Web : photo 4:5–1,91:1 ; vidéo 9:16–16:9.
    const ratio = edgeToEdge ? Math.min(item.kind === "video" ? 16 / 9 : 1.91, Math.max(item.kind === "video" ? 9 / 16 : 4 / 5, declared)) : declared
    if (item.kind === "video") return active && index === firstVideo && guard.canAct && !calls.busy
      ? <GuardedVideo key={key} url={item.url} edgeToEdge={edgeToEdge} ratio={ratio} frameHeight={frameHeight} onReady={onReady} />
      : <Label key={key} muted>{t("mobile.media.videoInactive")}</Label>
    return <Image key={key} source={{ uri: item.url }} alt={item.altText ?? t("mobile.media.image")} accessibilityLabel={item.altText ?? t("mobile.media.image")} resizeMode={edgeToEdge ? "cover" : "contain"} onLoad={() => { if (guard.current()) onReady?.() }} onError={() => setFailed(previous => new Set([...previous, key]))} style={{ width: "100%", aspectRatio: ratio, ...(edgeToEdge ? {} : { maxHeight: 420 }), borderRadius: edgeToEdge ? 0 : tokens.radiusMedia, backgroundColor: tokens.muted }} />
  })}</View>
}
