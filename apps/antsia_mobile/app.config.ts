import type { ExpoConfig } from "expo/config"
import nativeBuild from "./native-build.json"

// Identifiants fournis par le propriétaire, jamais empruntés à une autre application.
// Une absence reste une absence ; une valeur fournie invalide bloque la configuration.
function identifier(name: string, pattern: RegExp, fallback?: string): string | undefined {
  const value = process.env[name] ?? fallback
  if (value === undefined) return undefined
  if (value.length > 255 || !pattern.test(value)) throw new Error(`Invalid native configuration: ${name}`)
  return value
}

const scheme = identifier("EXPO_PUBLIC_NATIVE_SCHEME", /^[a-z][a-z0-9+.-]{2,63}$/, nativeBuild.scheme)
if (scheme && new Set(["http", "https", "file", "data", "javascript", "exp", "exps"]).has(scheme)) {
  throw new Error("Invalid native configuration: EXPO_PUBLIC_NATIVE_SCHEME")
}
const bundleIdentifier = identifier("NATIVE_IOS_BUNDLE_ID", /^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/, nativeBuild.iosBundleIdentifier)
const androidPackage = identifier("NATIVE_ANDROID_PACKAGE", /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/, nativeBuild.androidPackage)
const owner = identifier("NATIVE_EXPO_OWNER", /^[A-Za-z0-9][A-Za-z0-9_-]*$/, nativeBuild.owner)
const projectId = identifier("NATIVE_EXPO_PROJECT_ID", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, nativeBuild.easProjectId ?? undefined)
if (process.env.NATIVE_RELEASE_BUILD === "true") {
  for (const [name, value] of Object.entries({ NATIVE_IOS_BUNDLE_ID: bundleIdentifier, NATIVE_ANDROID_PACKAGE: androidPackage, NATIVE_EXPO_OWNER: owner, NATIVE_EXPO_PROJECT_ID: projectId, EXPO_PUBLIC_NATIVE_SCHEME: scheme })) {
    if (!value) throw new Error(`Missing phone build configuration: ${name}`)
  }
  for (const name of ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CONVEX_SITE_URL", "EXPO_PUBLIC_SITE_URL"]) {
    const raw = process.env[name]
    const url = raw ? new URL(raw) : undefined
    if (!url || url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error(`Phone builds require an explicit HTTPS origin: ${name}`)
    }
  }
  if (process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === "true") throw new Error("Phone builds cannot allow local HTTP")
}
const callsSetting = process.env.NATIVE_CALLS_ENABLED
const demoOriginNames = ["EXPO_PUBLIC_DEMO_CONVEX_URL", "EXPO_PUBLIC_DEMO_CONVEX_SITE_URL", "EXPO_PUBLIC_DEMO_SITE_URL"]
if (demoOriginNames.some(name => process.env[name] !== undefined)) {
  for (const name of demoOriginNames) {
    const raw = process.env[name]
    const url = raw ? new URL(raw) : undefined
    if (!url || url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error(`Demo builds require an explicit HTTPS origin: ${name}`)
    }
  }
  const primary = new Set([process.env.EXPO_PUBLIC_CONVEX_URL, process.env.EXPO_PUBLIC_CONVEX_SITE_URL, process.env.EXPO_PUBLIC_SITE_URL])
  if (primary.has(process.env.EXPO_PUBLIC_DEMO_CONVEX_URL) || primary.has(process.env.EXPO_PUBLIC_DEMO_CONVEX_SITE_URL)
    || process.env.EXPO_PUBLIC_DEMO_SITE_URL !== process.env.EXPO_PUBLIC_SITE_URL) throw new Error("Demo and production build origins must be isolated")
}
if (callsSetting !== undefined && callsSetting !== "true" && callsSetting !== "false") throw new Error("Invalid native configuration: NATIVE_CALLS_ENABLED")
const nativeCallsEnabled = callsSetting === "true"
if (nativeCallsEnabled && (!scheme || !bundleIdentifier || !androidPackage)) throw new Error("Native calls require explicit native identities")

// Auth et origines Convex restent dans le contrat runtime, aucun secret dans cette configuration.
const config: ExpoConfig = {
  name: "ANTSIA",
  slug: "antsia-mobile",
  ...(owner ? { owner } : {}),
  ...(projectId ? { extra: { eas: { projectId } } } : {}),
  version: "0.1.0",
  platforms: ["ios", "android"],
  userInterfaceStyle: "automatic",
  // Expo SDK 57 impose déjà la New Architecture ; aucune option legacy ici.
  ...(scheme ? { scheme } : {}),
  ios: { buildNumber: "8", config: { usesNonExemptEncryption: false }, ...(bundleIdentifier ? { bundleIdentifier } : {}) },
  android: {
    versionCode: 3,
    ...(androidPackage ? { package: androidPackage } : {}),
    permissions: [],
    blockedPermissions: ["android.permission.CAMERA", "android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS"],
  },
  plugins: [
    "expo-web-browser",
    ["expo-secure-store", { configureAndroidBackup: true, faceIDPermission: false }],
    ["expo-video", { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
    ...(nativeCallsEnabled ? ["@livekit/react-native-expo-plugin", "@config-plugins/react-native-webrtc"] : []),
    ["./plugins/with-native-calls.cjs", {
      enabled: nativeCallsEnabled,
      apnsEnvironment: process.env.APNS_ENVIRONMENT,
      firebaseConfigPath: process.env.NATIVE_FIREBASE_CONFIG_PATH,
    }],
    // SDK iOS 27 : sans cycle de vie UIScene, UIKit refuse de lancer l'app.
    "./plugins/with-scene-lifecycle.cjs",
  ],
  updates: { enabled: false },
}

export default config
