import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Compilation uniquement : les sources applicatives restent dans le dépôt partagé.
// Seuls les fichiers de cette tranche explicitement nommés sont superposés aux commits.
// Aucun secret, serveur ou base de données n'est emporté.
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repository = resolve(app, "../..")
const sibling = resolve(repository, "../DIASPORALE")
const refs = [process.env.ANTSIA_BUILD_REF, process.env.DIASPORALE_BUILD_REF]
if (refs.some((ref) => !ref || !/^[0-9a-f]{40}$/.test(ref))) {
  throw new Error("Provide full immutable ANTSIA_BUILD_REF and DIASPORALE_BUILD_REF commit IDs")
}
const cache = join(homedir(), "Library/Caches/antsia-native-builds")
mkdirSync(cache, { recursive: true })
const destination = mkdtempSync(join(cache, "telephone-"))
const root = join(destination, "ECOSYSTEMES")
const overlay = [
  ...["app.config.ts", "build-config.test.ts", "native-build.json", "eas.json", ".gitignore", "README.md", "package.json", "scripts/prepare-build.mjs", "scripts/prepare-ios-signing.mjs", "scripts/prepare-ios-signing.test.mjs", "native-plugin.test.ts",
    "modules/antsia-call-system/android/build.gradle", "plugins/with-native-calls.cjs", "plugins/with-scene-lifecycle.cjs", "scene-plugin.test.ts",
    "src/runtime.tsx", "src/screens/explore-screen.tsx", "src/screens/feed-screen.tsx", "src/screens/post-screen.tsx",
    "src/screens/association-directory-section.tsx", "src/screens/page-screen.tsx", "src/lib/native-pages.ts", "src/lib/native-pages.test.ts",
    "src/screens/shop-directory-section.tsx", "src/screens/shop-screen.tsx", "src/screens/offer-screen.tsx", "src/components/business-media.tsx",
    "src/lib/native-business.ts", "src/lib/native-business.test.ts", "src/lib/member-admission.ts", "src/lib/member-admission.test.ts",
    "src/app.tsx", "src/components/entry.tsx", "src/lib/auth-client.ts", "src/lib/auth-client.test.ts",
    "src/lib/session-controller.ts", "src/lib/native-idn.ts", "src/lib/native-idn.test.ts", "src/i18n/fr.json", "src/i18n/en.json",
    "src/components/demo-entry.tsx", "src/lib/native-demo.ts", "src/lib/native-demo.test.ts",
    "src/lib/destinations.ts", "src/lib/destinations.test.ts", "src/lib/routes.ts", "src/lib/routes.test.ts",
    "src/lib/environment-pause.ts", "src/lib/environment-pause.test.ts", "src/lib/owned-convex-client.ts", "src/lib/owned-convex-client.test.ts",
  ].map((file) => `apps/antsia_mobile/${file}`),
  "packages/social-native/src/idn.ts", "packages/social-native/src/idn.test.ts",
  "packages/social-native/src/environment.ts", "packages/social-native/src/environment.test.ts",
  "packages/social-native/src/sign-out.ts", "packages/social-native/src/sign-out.test.ts",
]
const manifest = { commits: {}, overlay: {}, createdAt: new Date().toISOString() }
for (const [index, [name, source]] of [["ANTSIA", repository], ["DIASPORALE", sibling]].entries()) {
  const ref = refs[index]
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", ref], { cwd: source, encoding: "utf8" }).trim().split("\n")
  if (files.some((file) => /(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example") || /(?:credentials\.json|\.(?:p12|mobileprovision|keystore|jks))$/.test(file))) {
    throw new Error(`Refusing source containing configuration secrets: ${name}`)
  }
  const target = join(root, name)
  mkdirSync(target, { recursive: true })
  const archive = execFileSync("git", ["archive", "--format=tar", ref], { cwd: source, maxBuffer: 256 * 1024 * 1024 })
  execFileSync("tar", ["-xf", "-", "-C", target], { input: archive })
  manifest.commits[name] = ref
}
for (const relative of overlay) {
  const source = join(repository, relative)
  const target = join(root, "ANTSIA", relative)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  manifest.overlay[relative] = createHash("sha256").update(readFileSync(source)).digest("hex")
}
// Le catalogue partagé peut contenir d'autres travaux : reporter seulement notre dépendance.
const packagePath = join(root, "ANTSIA/package.json")
const cleanPackage = JSON.parse(readFileSync(packagePath, "utf8"))
const browserVersion = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")).workspaces.catalog["expo-web-browser"]
if (!browserVersion) throw new Error("Missing expo-web-browser catalog version")
cleanPackage.workspaces.catalog["expo-web-browser"] = browserVersion
writeFileSync(packagePath, JSON.stringify(cleanPackage, null, 2) + "\n")
// Actualiser uniquement le verrou du contexte propre, puis le vérifier en installation figée.
execFileSync("bun", ["install", "--lockfile-only"], { cwd: join(root, "ANTSIA"), stdio: ["ignore", "ignore", "inherit"] })
manifest.buildLockSha256 = createHash("sha256").update(readFileSync(join(root, "ANTSIA/bun.lock"))).digest("hex")
// Seules ces valeurs publiques de compilation sont transférées, jamais l'environnement complet.
const buildVariables = [
  "NATIVE_EXPO_OWNER", "NATIVE_EXPO_PROJECT_ID", "NATIVE_IOS_BUNDLE_ID", "NATIVE_ANDROID_PACKAGE",
  "EXPO_PUBLIC_NATIVE_SCHEME", "EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CONVEX_SITE_URL", "EXPO_PUBLIC_SITE_URL",
  "EXPO_PUBLIC_DEMO_CONVEX_URL", "EXPO_PUBLIC_DEMO_CONVEX_SITE_URL", "EXPO_PUBLIC_DEMO_SITE_URL",
]
const buildEnvironment = Object.fromEntries(buildVariables.filter((name) => process.env[name]).map((name) => [name, process.env[name]]))
const easPath = join(root, "ANTSIA/apps/antsia_mobile/eas.json")
const eas = JSON.parse(readFileSync(easPath, "utf8"))
Object.assign(eas.build.telephone.env, buildEnvironment)
writeFileSync(easPath, JSON.stringify(eas, null, 2) + "\n")
manifest.buildEnvironment = { ...eas.build.telephone.env }
writeFileSync(join(root, ".easignore"), [
  "**/node_modules", "**/.git", "**/.env", "**/.env.*", "**/.expo", "**/.next", "**/.vercel",
  "**/coverage", "**/dist", "**/build-artifacts", "**/credentials.json", "**/*.p12",
  "**/*.mobileprovision", "**/*.keystore", "**/*.jks", "**/*.apk", "**/*.aab", "**/*.ipa",
  "ANTSIA/apps/antsia_mobile/ios", "ANTSIA/apps/antsia_mobile/android", "",
].join("\n"))
writeFileSync(join(destination, "source-manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
console.log(JSON.stringify({ root, app: join(root, "ANTSIA/apps/antsia_mobile"), manifest: join(destination, "source-manifest.json") }, null, 2))
