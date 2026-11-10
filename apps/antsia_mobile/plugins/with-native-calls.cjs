// P17c : déclarations natives seulement, aucune clé ou identité de fournisseur créée.
const { withInfoPlist, withEntitlementsPlist, withAndroidManifest, withGradleProperties, AndroidConfig } = require("expo/config-plugins")
const { statSync } = require("node:fs")
const { resolve } = require("node:path")

module.exports = function withNativeCalls(config, options = {}) {
  // Le module reste autolié, y compris quand les appels système sont désactivés.
  config = withGradleProperties(config, (mod) => {
    const property = mod.modResults.find((entry) => entry.type === "property" && entry.key === "android.minSdkVersion")
    if (property) {
      const version = Number(property.value)
      if (!Number.isInteger(version)) throw new Error("Native Android minimum SDK is invalid")
      property.value = String(Math.max(version, 26))
    } else mod.modResults.push({ type: "property", key: "android.minSdkVersion", value: "26" })
    return mod
  })
  // Apple exige ces mentions pour les bibliothèques autoliées, même appels désactivés.
  const french = require("../modules/antsia-call-system/locales/fr.json")
  const english = require("../modules/antsia-call-system/locales/en.json")
  config.locales ??= {}
  for (const [language, messages] of [["fr", french], ["en", english]]) {
    const existing = config.locales[language]
    if (typeof existing === "string") throw new Error("Native call permission localization conflicts with a file-based locale")
    config.locales[language] = { ...existing, ios: { ...existing?.ios, ...messages.ios } }
  }
  config = withInfoPlist(config, (mod) => { Object.assign(mod.modResults, french.ios); return mod })
  if (options.enabled !== true) {
    // Fermer aussi les marqueurs d'un prebuild incrémental précédemment activé.
    config = withInfoPlist(config, (mod) => { mod.modResults.AntsiaNativeCallsEnabled = false; return mod })
    return withAndroidManifest(config, (mod) => {
      const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults)
      const marker = app["meta-data"]?.find((row) => row.$["android:name"] === "AntsiaNativeCallsEnabled")
      if (marker) marker.$["android:value"] = "false"
      return mod
    })
  }
  if (!config.ios?.bundleIdentifier || !config.android?.package || !config.scheme) throw new Error("Native call identities are required")
  if (!["development", "production"].includes(options.apnsEnvironment)) throw new Error("APNS_ENVIRONMENT must be explicit")
  if (typeof options.firebaseConfigPath !== "string" || !options.firebaseConfigPath.trim()) throw new Error("NATIVE_FIREBASE_CONFIG_PATH is required")
  // Lire l'existence du fichier propriétaire suffit ici ; aucune valeur n'est imprimée.
  const firebasePath = resolve(config._internal?.projectRoot ?? __dirname + "/..", options.firebaseConfigPath)
  if (!statSync(firebasePath).isFile()) throw new Error("Native Firebase configuration is unavailable")
  config.android.googleServicesFile = firebasePath
  config = AndroidConfig.GoogleServices.withClassPath(config)
  config = AndroidConfig.GoogleServices.withApplyPlugin(config)
  config = AndroidConfig.GoogleServices.withGoogleServicesFile(config)
  const blocked = new Set(config.android.blockedPermissions ?? [])
  for (const permission of ["android.permission.RECORD_AUDIO", "android.permission.CAMERA", "android.permission.POST_NOTIFICATIONS"]) blocked.delete(permission)
  config.android.blockedPermissions = [...blocked]
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.INTERNET", "android.permission.MANAGE_OWN_CALLS",
    "android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
    "android.permission.FOREGROUND_SERVICE_MICROPHONE", "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA", "android.permission.POST_NOTIFICATIONS",
  ])
  config = withInfoPlist(config, (mod) => {
    mod.modResults.AntsiaNativeCallsEnabled = true
    mod.modResults.UIBackgroundModes = [...new Set([...(mod.modResults.UIBackgroundModes ?? []), "voip", "audio"])]
    Object.assign(mod.modResults, french.ios)
    return mod
  })
  config = withEntitlementsPlist(config, (mod) => {
    const current = mod.modResults["aps-environment"]
    if (current && current !== options.apnsEnvironment) throw new Error("Native APNs environment conflicts with existing entitlement")
    mod.modResults["aps-environment"] = options.apnsEnvironment
    return mod
  })
  return withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults)
    app["meta-data"] ??= []
    const meta = app["meta-data"].find((row) => row.$["android:name"] === "AntsiaNativeCallsEnabled")
    if (meta) meta.$["android:value"] = "true"
    else app["meta-data"].push({ $: { "android:name": "AntsiaNativeCallsEnabled", "android:value": "true" } })
    // Aucun enregistrement FCM automatique avant le geste explicite et tokens().
    const autoInit = app["meta-data"].find((row) => row.$["android:name"] === "firebase_messaging_auto_init_enabled")
    if (autoInit) autoInit.$["android:value"] = "false"
    else app["meta-data"].push({ $: { "android:name": "firebase_messaging_auto_init_enabled", "android:value": "false" } })
    app.service ??= []
    const services = [
      { $: { "android:name": "expo.modules.antsiacalls.CallInviteService", "android:exported": "false" }, "intent-filter": [{ action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }] }] },
      { $: { "android:name": "expo.modules.antsiacalls.TelecomCallService", "android:exported": "false", "android:foregroundServiceType": "phoneCall|microphone", "android:stopWithTask": "false" } },
    ]
    for (const service of services) {
      const prior = app.service.find((row) => row.$["android:name"] === service.$["android:name"])
      if (prior) Object.assign(prior, service)
      else app.service.push(service)
    }
    app.receiver ??= []
    if (!app.receiver.some((row) => row.$["android:name"] === "expo.modules.antsiacalls.CallActionReceiver")) {
      app.receiver.push({ $: { "android:name": "expo.modules.antsiacalls.CallActionReceiver", "android:exported": "false" } })
    }
    // Une activité explicite pour Répondre évite le trampoline notification -> receiver -> Activity interdit.
    app.activity ??= []
    if (!app.activity.some((row) => row.$["android:name"] === "expo.modules.antsiacalls.CallActionActivity")) {
      app.activity.push({ $: { "android:name": "expo.modules.antsiacalls.CallActionActivity", "android:exported": "false", "android:excludeFromRecents": "true", "android:theme": "@android:style/Theme.Translucent.NoTitleBar", "android:launchMode": "singleTop" } })
    }
    return mod
  })
}
