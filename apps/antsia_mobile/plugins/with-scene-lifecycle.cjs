// iOS 27 : UIKit refuse de lancer une app compilée avec ce SDK sans cycle de vie UIScene
// (« UIScene life cycle is required for apps built with this SDK », SIGTRAP au démarrage).
// Le gabarit Expo SDK 57 crée la fenêtre dans l'AppDelegate : elle naît désormais dans SceneDelegate,
// la fabrique React Native reste créée au lancement de l'application.
const { withInfoPlist, withAppDelegate, withXcodeProject, IOSConfig } = require("expo/config-plugins")
const { writeFileSync } = require("node:fs")
const { join } = require("node:path")

/** Une scène unique, déléguée à SceneDelegate ; nouvel objet à chaque prebuild. */
function sceneManifest() {
  return {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate" },
      ],
    },
  }
}

const WINDOW_START = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/
const MOVED = "// La fenêtre et React Native démarrent dans SceneDelegate (cycle de vie UIScene)."

/** Retire la fenêtre du lancement ; refuse un gabarit inconnu plutôt que de livrer une app sans fenêtre. */
function moveWindowToScene(source) {
  if (source.includes(MOVED)) return source
  if (!WINDOW_START.test(source)) throw new Error("Expo AppDelegate template changed: the window start block was not found")
  return source.replace(WINDOW_START, `\n    ${MOVED}\n`)
}

const SCENE_DELEGATE = `// Généré par plugins/with-scene-lifecycle.cjs : modifier le plugin, jamais ce fichier.
import React
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    // Linking.getInitialURL lit toujours les options de lancement.
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url { launchOptions[.url] = url }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
  }

  // Les liens passent par l'AppDelegate existant : abonnés Expo puis RCTLinkingManager.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity) { _ in }
  }
}
`

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => { mod.modResults.UIApplicationSceneManifest = sceneManifest(); return mod })
  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") throw new Error("Scene lifecycle expects the Swift AppDelegate")
    mod.modResults.contents = moveWindowToScene(mod.modResults.contents)
    return mod
  })
  return withXcodeProject(config, (mod) => {
    const name = mod.modRequest.projectName
    if (!name) throw new Error("iOS project name is required for SceneDelegate")
    const filepath = `${name}/SceneDelegate.swift`
    writeFileSync(join(mod.modRequest.platformProjectRoot, filepath), SCENE_DELEGATE)
    // Un prebuild répété ne duplique pas le fichier dans le groupe.
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: mod.modResults })
    return mod
  })
}
module.exports.moveWindowToScene = moveWindowToScene
module.exports.SCENE_DELEGATE = SCENE_DELEGATE
module.exports.sceneManifest = sceneManifest
