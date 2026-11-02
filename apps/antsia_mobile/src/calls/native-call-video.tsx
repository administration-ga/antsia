import { NativeText as Text } from "../components/native-text"
import { VideoTrack } from "@livekit/react-native"
import { useWindowDimensions, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import type { NativeCallRoom } from "./native-room"

/** Same Room publications as the host; no secondary connection or token. */
export default function NativeCallVideo({ tracks }: { tracks: NativeCallRoom["videos"] }) {
  const { tokens, t } = useNativeAppearance(), { height } = useWindowDimensions()
  return <View style={{ gap: 8 }}>{tracks.slice(0, 2).map(track => {
    const label = t(track.participant.isLocal ? "mobile.calls.localVideo" : "mobile.calls.remoteVideo")
    return <View key={track.publication.trackSid} style={{ gap: 6 }}>
      <Text style={{ color: tokens.foreground, flexShrink: 1 }}>{label}</Text>
      <View accessible accessibilityRole="image" accessibilityLabel={label}>
        <VideoTrack trackRef={track} mirror={track.participant.isLocal} objectFit="contain" style={{ width: "100%", height: Math.max(96, Math.min(220, height * 0.35)), borderRadius: tokens.radiusMedia, backgroundColor: tokens.card }} />
      </View>
    </View>
  })}</View>
}
