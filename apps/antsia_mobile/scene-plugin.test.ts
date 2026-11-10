import { createRequire } from "node:module"
import type { ExportedConfig } from "expo/config-plugins"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
type ScenePlugin = ((config: ExportedConfig) => ExportedConfig) & { moveWindowToScene: (source: string) => string; SCENE_DELEGATE: string }
const withSceneLifecycle = require("./plugins/with-scene-lifecycle.cjs") as ScenePlugin

// Extrait exact de ios/ANTSIA/AppDelegate.swift généré par `expo prebuild` (Expo SDK 57).
const TEMPLATE = `  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
`

function modRequest(modName: string) {
  return { projectRoot: process.cwd(), platformProjectRoot: process.cwd(), platform: "ios" as const, modName, introspect: true }
}

describe("UIScene lifecycle plugin", () => {
  it("declares a single application scene delegated to SceneDelegate", async () => {
    const config = withSceneLifecycle({ name: "ANTSIA", slug: "antsia-mobile" })
    const mod = config.mods?.ios?.infoPlist
    if (!mod) throw new Error("iOS scene manifest is missing")
    const result = await mod({ ...config, modRawConfig: config, modResults: {}, modRequest: modRequest("infoPlist") })
    expect(result.modResults.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: { UIWindowSceneSessionRoleApplication: [{ UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate" }] },
    })
  })

  it("keeps the React Native factory at launch but moves the window to the scene, once", async () => {
    const moved = withSceneLifecycle.moveWindowToScene(TEMPLATE)
    expect(moved).not.toContain("UIWindow(frame:")
    expect(moved).not.toContain("startReactNative")
    expect(moved).toContain("reactNativeFactory = factory")
    expect(moved).toContain("return super.application(application, didFinishLaunchingWithOptions: launchOptions)")
    expect(withSceneLifecycle.moveWindowToScene(moved)).toBe(moved)
    const config = withSceneLifecycle({ name: "ANTSIA", slug: "antsia-mobile" })
    const mod = config.mods?.ios?.appDelegate
    if (!mod) throw new Error("AppDelegate modification is missing")
    const result = await mod({ ...config, modRawConfig: config, modResults: { path: "AppDelegate.swift", contents: TEMPLATE, language: "swift" }, modRequest: modRequest("appDelegate") })
    expect(result.modResults.contents).toBe(moved)
  })

  it("refuses an unknown AppDelegate rather than shipping an app without a window", () => {
    expect(() => withSceneLifecycle.moveWindowToScene("class AppDelegate: ExpoAppDelegate {}")).toThrow("Expo AppDelegate template changed")
  })

  it("starts React Native in the connected window scene and forwards links to the app delegate", () => {
    const source = withSceneLifecycle.SCENE_DELEGATE
    expect(source).toContain("class SceneDelegate: UIResponder, UIWindowSceneDelegate")
    expect(source).toContain("UIWindow(windowScene: windowScene)")
    expect(source).toContain('factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)')
    expect(source).toContain("launchOptions[.url] = url")
    expect(source).toContain("appDelegate.application(UIApplication.shared, open: context.url, options: options)")
    expect(source).toContain("appDelegate.application(UIApplication.shared, continue: userActivity)")
  })
})
