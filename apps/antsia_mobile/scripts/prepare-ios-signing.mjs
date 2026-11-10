import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const KEYCHAIN_MAX_AGE_MS = 24 * 60 * 60 * 1000
const SHA1 = /^[A-F0-9]{40}$/
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

// Le XML ne quitte pas la mémoire du processus enfant. Aucun profil étranger
// ni certificat privé ne figure dans sa sortie ; seuls les hashes DER publics.
const PROFILE_METADATA = `
import datetime, hashlib, json, plistlib, sys
try:
    profile = plistlib.loads(sys.stdin.buffer.read())
    entitlements = profile.get("Entitlements", {})
    team, bundle = sys.argv[1:3]
    application = entitlements.get("application-identifier")
    expected = application == team + "." + bundle and profile.get("TeamIdentifier") == [team]
    store = not entitlements.get("get-task-allow", False) and not profile.get("ProvisionedDevices") and not profile.get("ProvisionsAllDevices", False)
    if not expected or not store:
        print("null")
    else:
        expiry = profile["ExpirationDate"].replace(tzinfo=datetime.timezone.utc).isoformat()
        print(json.dumps({"uuid": profile["UUID"], "teamId": team, "applicationId": application, "expiresAt": expiry, "certificateSha1s": sorted(set(hashlib.sha1(value).hexdigest().upper() for value in profile["DeveloperCertificates"]))}))
except Exception:
    sys.exit(1)
`

export function selectIosSigning(profiles, keychains, expected, now = Date.now()) {
  const matching = profiles.filter(profile => profile && profile.teamId === expected.iosTeamId
    && profile.applicationId === `${expected.iosTeamId}.${expected.iosBundleIdentifier}`)
  if (matching.length === 0) throw new Error("ANTSIA App Store provisioning profile is missing")
  // Un doublon physique du même UUID n'est pas une seconde identité de profil.
  const unique = new Map()
  for (const profile of matching) {
    if (!UUID.test(profile.uuid) || !Number.isFinite(Date.parse(profile.expiresAt))
      || !Array.isArray(profile.certificateSha1s) || profile.certificateSha1s.length === 0
      || profile.certificateSha1s.some(value => !SHA1.test(value))) throw new Error("Invalid ANTSIA provisioning metadata")
    const previous = unique.get(profile.uuid)
    if (previous && JSON.stringify(previous) !== JSON.stringify(profile)) throw new Error("Conflicting ANTSIA provisioning metadata")
    unique.set(profile.uuid, profile)
  }
  const valid = [...unique.values()].filter(profile => Date.parse(profile.expiresAt) > now)
  if (valid.length === 0) throw new Error("ANTSIA App Store provisioning profile has expired")
  if (valid.length !== 1) throw new Error("Ambiguous ANTSIA App Store provisioning profiles")
  const profile = valid[0]
  const matches = keychains.flatMap(keychain => [...new Set(keychain.fingerprints)]
    .filter(fingerprint => profile.certificateSha1s.includes(fingerprint))
    .map(fingerprint => ({ profile, fingerprint, keychainPath: keychain.path })))
  if (matches.length !== 1) throw new Error(matches.length ? "Ambiguous ANTSIA signing identities" : "ANTSIA profile certificate is absent from recent EAS keychains")
  return matches[0]
}

function rubyString(value) {
  if (/[\r\n\0]/.test(value)) throw new Error("Invalid signing output path")
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`
}

export function renderIosGymfile({ profile, fingerprint, keychainPath }, logsDirectory) {
  if (!SHA1.test(fingerprint) || !/^[-A-Za-z0-9_./]+$/.test(keychainPath)) throw new Error("Invalid EAS signing identity or keychain path")
  const bundle = profile.applicationId.slice(profile.teamId.length + 1)
  const flags = `OTHER_CODE_SIGN_FLAGS="--keychain ${keychainPath}"`
  return [
    "suppress_xcode_output(true)", "clean(false)", "scheme('ANTSIA')", "configuration('Release')",
    `codesigning_identity(${rubyString(fingerprint)})`,
    `xcargs(${rubyString(`-jobs 2 CODE_SIGN_IDENTITY=${fingerprint} ${flags}`)})`,
    `export_xcargs(${rubyString(flags)})`,
    "export_options({", "  method: 'app-store',", `  teamID: ${rubyString(profile.teamId)},`,
    `  provisioningProfiles: { ${rubyString(bundle)} => ${rubyString(profile.uuid)} },`,
    `  signingCertificate: ${rubyString(fingerprint)}`, "})", "disable_xcpretty(true)",
    `buildlog_path(${rubyString(logsDirectory)})`, "derived_data_path('./build')", "output_directory('./build')", "",
  ].join("\n")
}

export function prepareIosSigning(environment = process.env, platform = process.platform) {
  // Simulator builds use a local .app without an App Store identity or profile.
  if (environment.NATIVE_IOS_SIMULATOR_BUILD === "true") return null
  // Internal device builds keep the provisioning and export selected by EAS.
  if (environment.NATIVE_IOS_APP_STORE_BUILD !== "true") return null
  if (platform !== "darwin" || environment.EAS_BUILD_PLATFORM !== "ios" || !environment.EAS_LOCAL_BUILD_WORKINGDIR) return null
  const app = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const gymfile = join(app, "ios/Gymfile")
  if (existsSync(gymfile)) return null
  const expected = JSON.parse(readFileSync(join(app, "native-build.json"), "utf8"))
  if (!/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/.test(expected.iosBundleIdentifier)
    || !/^[A-Z0-9]{10}$/.test(expected.iosTeamId) || !environment.EAS_BUILD_WORKINGDIR
    || !isAbsolute(environment.EAS_BUILD_WORKINGDIR)) throw new Error("Explicit ANTSIA iOS signing configuration is required")
  const directory = join(homedir(), "Library/MobileDevice/Provisioning Profiles")
  const profiles = []
  if (existsSync(directory)) for (const file of readdirSync(directory)) {
    if (!file.endsWith(".mobileprovision")) continue
    try {
      const xml = execFileSync("/usr/bin/security", ["cms", "-D", "-i", join(directory, file)], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 })
      const metadata = execFileSync("/usr/bin/python3", ["-c", PROFILE_METADATA, expected.iosTeamId, expected.iosBundleIdentifier], { input: xml, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 })
      const profile = JSON.parse(metadata.toString("utf8"))
      if (profile) profiles.push(profile)
    } catch { /* Profil étranger ou illisible : aucun XML, nom ou contenu imprimé. */ }
  }
  const now = Date.now()
  const keychains = []
  for (const file of readdirSync(tmpdir())) {
    if (!/^eas-build-[A-Za-z0-9-]+\.keychain(?:-db)?$/.test(file)) continue
    const path = join(tmpdir(), file)
    const modified = statSync(path).mtimeMs
    if (modified > now || now - modified > KEYCHAIN_MAX_AGE_MS) continue
    try {
      const result = execFileSync("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning", path], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 }).toString("utf8")
      const fingerprints = [...result.matchAll(/^\s*\d+\)\s+([A-F0-9]{40})\s+"/gm)].map(match => match[1])
      keychains.push({ path, fingerprints })
    } catch { /* Aucun changement du trousseau, ni sortie de ses métadonnées étrangères. */ }
  }
  const selected = selectIosSigning(profiles, keychains, expected, now)
  const content = renderIosGymfile(selected, resolve(environment.EAS_BUILD_WORKINGDIR, "../logs"))
  writeFileSync(gymfile, content, { flag: "wx", mode: 0o600 })
  // Métadonnées publiques du seul profil ANTSIA, jamais clé privée ou P12.
  console.log(JSON.stringify({ uuid: selected.profile.uuid, teamId: selected.profile.teamId, applicationId: selected.profile.applicationId, expiresAt: selected.profile.expiresAt, certificateSha1: selected.fingerprint }))
  return selected
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { prepareIosSigning() } catch (error) {
    console.error(error instanceof Error ? error.message : "ANTSIA iOS signing preparation failed")
    process.exitCode = 1
  }
}
