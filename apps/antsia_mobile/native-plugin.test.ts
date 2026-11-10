import { createRequire } from "node:module"
import type { ExportedConfig } from "expo/config-plugins"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const withNativeCalls = require("./plugins/with-native-calls.cjs") as (config: ExportedConfig, options: { enabled: boolean }) => ExportedConfig

// Le module reste compilé même si la fonctionnalité d'appels est désactivée.
async function minimumSdk(properties: { type: "property"; key: string; value: string }[]) {
  const config = withNativeCalls({ name: "ANTSIA", slug: "antsia-mobile" }, { enabled: false })
  const mod = config.mods?.android?.gradleProperties
  if (!mod) throw new Error("Android SDK configuration is missing")
  const result = await mod({ ...config, modRawConfig: config, modResults: properties, modRequest: {
    projectRoot: process.cwd(), platformProjectRoot: process.cwd(), platform: "android",
    modName: "gradleProperties", introspect: true,
  } })
  return result.modResults
}

describe("Android minimum SDK with calls disabled", () => {
  it("raises the default app minimum to the always-linked native module requirement", async () => {
    expect(await minimumSdk([])).toContainEqual({ type: "property", key: "android.minSdkVersion", value: "26" })
    expect(await minimumSdk([{ type: "property", key: "android.minSdkVersion", value: "24" }])).toContainEqual({ type: "property", key: "android.minSdkVersion", value: "26" })
  })
  it("preserves a stricter minimum and rejects an invalid configured value", async () => {
    expect(await minimumSdk([{ type: "property", key: "android.minSdkVersion", value: "28" }])).toContainEqual({ type: "property", key: "android.minSdkVersion", value: "28" })
    await expect(minimumSdk([{ type: "property", key: "android.minSdkVersion", value: "invalid" }])).rejects.toThrow("Native Android minimum SDK is invalid")
  })
})


it("includes localized Apple purpose strings while calls remain disabled", async () => {
  const config = withNativeCalls({ name: "ANTSIA", slug: "antsia-mobile" }, { enabled: false })
  const mod = config.mods?.ios?.infoPlist
  if (!mod) throw new Error("iOS privacy configuration is missing")
  const result = await mod({ ...config, modRawConfig: config, modResults: {}, modRequest: {
    projectRoot: process.cwd(), platformProjectRoot: process.cwd(), platform: "ios",
    modName: "infoPlist", introspect: true,
  } })
  expect(result.modResults.NSCameraUsageDescription).toMatch(/ANTSIA.*caméra/)
  expect(result.modResults.NSMicrophoneUsageDescription).toMatch(/ANTSIA.*microphone/)
  expect(result.modResults.AntsiaNativeCallsEnabled).toBe(false)
  expect(config.locales?.fr).toHaveProperty("ios.NSCameraUsageDescription")
  expect(config.locales?.en).toHaveProperty("ios.NSMicrophoneUsageDescription")
})
