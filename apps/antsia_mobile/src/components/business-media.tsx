import { useState } from "react"
import { Image, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { nativeBusinessMediaUrl, type NativeBusinessOffer } from "../lib/native-business"
import { Action, Label, useNativeGuard } from "./ui"

function BusinessImageBody({ url, altText, ratio }: { url: string; altText: string | null; ratio: number }) {
  const [failed, setFailed] = useState(false), { tokens, t } = useNativeAppearance(), guard = useNativeGuard()
  if (!guard.canRead) return null
  if (failed) return <Label muted>{t("mobile.business.imageUnavailable")}</Label>
  return <Image source={{ uri: url }} alt={altText ?? t("mobile.business.offerTitle")} accessible accessibilityLabel={altText ?? t("mobile.business.offerTitle")} resizeMode="cover" onError={() => setFailed(true)} style={{ width: "100%", aspectRatio: ratio, backgroundColor: tokens.muted, borderRadius: tokens.radiusMedia }} />
}
export function BusinessImage({ url, altText = null, width = null, height = null, withheld = null }: { url: string | null; altText?: string | null; width?: number | null; height?: number | null; withheld?: string | null }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  if (!guard.canRead) return null
  if (withheld !== null) return <Label muted>{t("mobile.business.imageWithheld")}</Label>
  const safeUrl = nativeBusinessMediaUrl(url, guard.runtime.webUrl)
  if (!safeUrl) return url ? <Label muted>{t("mobile.business.imageUnavailable")}</Label> : null
  const ratio = width && height && width > 0 && height > 0 ? Math.max(0.5, Math.min(2.5, width / height)) : 1.5
  return <BusinessImageBody key={safeUrl} url={safeUrl} altText={altText} ratio={ratio} />
}
export function BusinessMedia({ media, compact = false }: { media: NativeBusinessOffer["media"]; compact?: boolean }) {
  const limit = compact ? 1 : 12
  return <View style={{ gap: 8 }}>{media.slice(0, limit).map((item, index) => <BusinessImage key={JSON.stringify([index, item.url, item.withheld])} {...item} />)}</View>
}
/** A single current-page subscription keeps media and rows bounded, including after live withdrawal. */
export function BusinessPager({ previous, next, limited, onPrevious, onNext }: { previous: boolean; next: boolean; limited: boolean; onPrevious: () => void; onNext: () => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {previous ? <Action label={t("mobile.business.previous")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onPrevious() }} /> : null}
      {next ? <Action label={t("mobile.business.next")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onNext() }} /> : null}
    </View>
    {limited ? <Label muted>{t("mobile.business.windowLimit")}</Label> : null}
  </View>
}
