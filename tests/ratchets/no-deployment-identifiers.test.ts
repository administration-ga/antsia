import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { basename, extname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { countByKind, detectDeploymentIdentifiers, FICTIVE_MARKERS, type IdentifierFinding, type IdentifierKind, isFictiveIdentifier } from "./lib/deployment-identifiers"
import { formatFindings, readRepoFile, REPO_ROOT } from "./lib/source-files"

/**
 * Chemins surveillés : dossiers (récursifs) et fichiers de la racine. EX-01
 * couvrait les scripts et sa procédure de publication ; EX-20 étend la liste
 * après avoir remplacé les identifiants déjà publiés par des rôles. Le
 * cliquet ne relit jamais son propre dossier (ses exemples sont fictifs mais
 * de forme réelle, pour éprouver le détecteur).
 */
export const SCANNED_DIRECTORIES = ["scripts"] as const
export const SCANNED_ROOT_FILES = ["docs/36_PUBLICATION_ET_RETOUR_ARRIERE.md"] as const

/** Fichiers texte relus (les images, polices et PDF ne portent pas d'identifiant écrit). */
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".css", ".html", ".svg", ".xml", ".txt", ".log",
  ".yaml", ".yml", ".toml", ".sh", ".py", ".kt", ".swift", ".gradle", ".podspec", ".patch", ".diff", ".lock", ".example",
])
const TEXT_FILE_NAMES = new Set(["Dockerfile", "LICENSE", "NOTICE", "SHA256SUMS", ".gitignore", ".dockerignore", ".gcloudignore", "gcloudignore"])

type NamedException = { path: string; counts: Partial<Record<IdentifierKind, number>>; reason: string }

/**
 * Exceptions NOMMÉES, une par fichier, avec le décompte exact par forme : un
 * identifiant de plus (ou de moins) dans le fichier fait échouer le cliquet,
 * qui se met alors à jour dans la même PR, raison à l'appui.
 */
export const NAMED_EXCEPTIONS: readonly NamedException[] = []

/** Fichiers suivis ou à suivre (git) : jamais un fichier ignoré, donc jamais un `.env.local`. */
function candidateFiles(): string[] {
  const output = execFileSync("git", ["-C", REPO_ROOT, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  return output.split("\0").filter((file) => file.length > 0 && existsSync(join(REPO_ROOT, file)))
}

function isTextFile(file: string): boolean {
  const name = basename(file)
  if (name.startsWith(".env") && name !== ".env.example") return false
  return TEXT_FILE_NAMES.has(name) || TEXT_EXTENSIONS.has(extname(name))
}

function inScope(file: string): boolean {
  return SCANNED_DIRECTORIES.some((directory) => file.startsWith(`${directory}/`)) || (SCANNED_ROOT_FILES as readonly string[]).includes(file)
}

function scannedFiles(): string[] {
  return candidateFiles().filter((file) => inScope(file) && isTextFile(file) && !file.startsWith("tests/ratchets/"))
}

/** Le commit d'`origin/main` relu avant le nettoyage d'EX-20 : le détecteur doit y retrouver les identifiants publiés. */
const BEFORE_CLEANUP = "77e139d91325b171eee32787f3f41336c6084d5b"

function fileAtCommit(commit: string, path: string): string {
  return execFileSync("git", ["-C", REPO_ROOT, "show", `${commit}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
}

describe("no-deployment-identifiers — aucun identifiant interne d'hébergement dans le dépôt public", () => {
  it("les chemins surveillés existent (un renommage ne retire pas la couverture en silence)", () => {
    for (const path of [...SCANNED_DIRECTORIES, ...SCANNED_ROOT_FILES]) expect({ path, exists: existsSync(join(REPO_ROOT, path)) }).toEqual({ path, exists: true })
    expect(scannedFiles().length).toBeGreaterThan(10)
  })

  it("dépôt public : cibles par rôles et variables de la machine, jamais par valeur (hors exceptions nommées)", () => {
    const exceptions = new Map(NAMED_EXCEPTIONS.map((exception) => [exception.path, exception]))
    const findings: IdentifierFinding[] = []
    const mismatches: string[] = []
    for (const file of scannedFiles()) {
      const found = detectDeploymentIdentifiers(file, readRepoFile(file))
      const exception = exceptions.get(file)
      if (!exception) findings.push(...found)
      else if (JSON.stringify(countByKind(found)) !== JSON.stringify(countByKind(expand(exception.counts)))) {
        mismatches.push(`${file} — décompte ${JSON.stringify(countByKind(found))}, exception ${JSON.stringify(exception.counts)}`)
      }
    }
    expect(findings, formatFindings(findings)).toEqual([])
    expect(mismatches, mismatches.join("\n")).toEqual([])
  })

  it("chaque exception nommée vise un fichier relu, avec sa raison", () => {
    const scanned = new Set(scannedFiles())
    for (const { path, counts, reason } of NAMED_EXCEPTIONS) {
      expect({ path, scanned: scanned.has(path) }).toEqual({ path, scanned: true })
      expect(Object.values(counts).every((count) => Number.isInteger(count) && count > 0)).toBe(true)
      expect(reason.length).toBeGreaterThan(40)
    }
    expect(new Set(NAMED_EXCEPTIONS.map(({ path }) => path)).size).toBe(NAMED_EXCEPTIONS.length)
  })

  it("chaque marqueur de valeur fictive est justifié et n'exempte que des mots entiers", () => {
    for (const { words, reason } of FICTIVE_MARKERS) {
      expect(reason.length).toBeGreaterThan(40)
      expect(words.length).toBeGreaterThan(0)
    }
    // Mot entier seulement : « testable » ou « contest » ne marquent rien.
    expect(isFictiveIdentifier("convex-deployment", "calm-contest-731")).toBe(false)
    expect(isFictiveIdentifier("convex-deployment", "inert-test-123")).toBe(true)
    // Le nom du produit marque un moteur fictif, jamais une adresse de l'hébergeur (le projet réel porte ce nom).
    expect(isFictiveIdentifier("convex-host", "demo-antsia-123.convex.cloud")).toBe(true)
    expect(isFictiveIdentifier("hosting-host", "antsia.vercel.app")).toBe(false)
  })

  it("test du test : chaque forme réelle est vue, y compris quand elle se termine par une largeur d'écran", () => {
    const source = [
      'CONVEX_DEPLOYMENT=prod:brave-otter-123 node scripts/convex-dev.mjs deploy',
      'const url = "https://brave-otter-123.convex.cloud"',
      'curl https://antsia-k4zzzzzzz-equipe-projects-a1b2c3d4.vercel.app/sante',
      'AV=https://clamav-scanner-abcdef-ew.a.run.app',
      'export VERCEL_ORG_ID=team_AbCdEfGhIjKlMnOpQrStUvWx',
      'promote dpl_AbCdEfGhIjKlMnOpQrStUvWxYz12',
      'CONVEX_DEPLOY_KEY=preview:x|eyJ2MiI6IjEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MCJ9',
      // EX-20 : les formes nues des registres et rapports.
      'Le moteur de démonstration est `calm-heron-731`, la production `swift-ibis-258`.',
      '| moteur | quiet-lynx-602 |',
      'Hôte régional : https://calm-heron-731.eu-west-1.convex.cloud',
      'Promu : antsia-k9x2m4p7q ; retour arrière vers antsia-demo-a1b2c3d4e.',
      'CONVEX_DEPLOYMENT=prod:calm-heron-390',
      'https://calm-heron-834.convex.site/api',
    ].join("\n")
    const findings = detectDeploymentIdentifiers("docs/fabrique.md", source)
    expect([...new Set(findings.map((finding) => finding.line))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(findings.filter((finding) => finding.line === 8).map((finding) => finding.kind)).toEqual(["convex-deployment", "convex-deployment"])
    expect(findings.filter((finding) => finding.line === 11).map((finding) => finding.kind)).toEqual(["hosting-deployment-short", "hosting-deployment-short"])
    expect(findings.find((finding) => finding.line === 12)?.kind).toBe("convex-deployment-target")
    expect(findings.find((finding) => finding.line === 13)?.kind).toBe("convex-host")
    // Le rapport ne republie pas l'identifiant : trois caractères au plus.
    expect(detectDeploymentIdentifiers("x", "prod:brave-otter-123")[0]?.message).toBe("nom de déploiement Convex (forme mot-mot-nombre) : « bra… »")
  })

  it("test du test : les faux positifs du dépôt (captures, CSS, utilitaires, identifiants séquentiels, valeurs fictives) ne sont plus vus", () => {
    const source = [
      // Formes génériques et dates.
      'const host = `${name}.convex.cloud`',
      "Adresse type : `https://<nom>.convex.cloud`, nom de la forme `<adjectif>-<animal>-<nombre>`.",
      'docs/recette/bienvenue-publication-2026-11-02/RAPPORT.md, "prod:exemple-demo|cle-secrete-de-test"',
      'const DEPLOYMENT_LINE = /(?:Production|Preview):\\s*(https:\\/\\/[a-z0-9-]+\\.vercel\\.app)\\b/',
      // Variables CSS et utilitaires Tailwind (charte, thèmes, composants).
      '  --color-gray-500: var(--neutral-ink-900);',
      'className="esp-tabbar border backdrop-blur-xl backdrop-saturate-150 bg-blue-500"',
      // Captures et paliers terminés par une largeur d'écran, fichiers de capture.
      '"captures": ["apres-fil-390", "avant-clips-834", "reglages-sable-402", "fil-mobile-clair-375"]',
      '![Fil](captures/fil-gaboma-390.png) et `composeur-soleil-123.png`',
      // Identifiants séquentiels des tests de fédération.
      '"emitterRef": "commerce-probe-001", "offerRef": "offer-event-001"',
      // Noms datés et faute de frappe « paquet + nombre ».
      'instantané antsia-front-20261021-03548f8c, tests de social-domain475',
      // Valeurs fictives marquées (tests du moteur, des applications et des scripts).
      'CONVEX_CLOUD_URL=https://demo-antsia-123.convex.cloud ANTSIA_DEMO_DEPLOYMENT=inert-test-123',
      'backend: "https://exemple-demo.convex.cloud", "https://exemple-123.convex.cloud", "https://x.convex.cloud", "https://eu-west-1.convex.cloud"',
      'enfant: "https://exemple-enfant.vercel.app", relais: "https://antsia-runtime-fixture-20261021.vercel.app"',
    ].join("\n")
    expect(formatFindings(detectDeploymentIdentifiers("docs/fabrique.md", source))).toBe("")
  })

  it("appliqué au dépôt d'avant le nettoyage, il retrouve les identifiants publiés et ignore les faux positifs mesurés par EX-01", () => {
    // Le commit doit être présent : un clone superficiel retirerait la preuve que le détecteur n'est pas devenu muet.
    expect(() => execFileSync("git", ["-C", REPO_ROOT, "cat-file", "-e", `${BEFORE_CLEANUP}^{commit}`]), "historique git requis (clone complet)").not.toThrow()
    const expected: Record<string, Partial<Record<IdentifierKind, number>>> = {
      "docs/35_PUBLICATION_DONNEES_DEMO_2026-10-22.md": { "hosting-deployment-short": 42, "convex-deployment": 22, "hosting-id": 28, "hosting-host": 5 },
      "docs/31_RECETTE_ANTIVIRUS_DEMO_2026-10-20.md": { "hosting-host": 1, "convex-deployment": 1, "cloud-run-host": 1 },
      "docs/25_RACCORDEMENT_IDN_PRODUCTION.md": { "convex-deployment": 9, "hosting-host": 4, "convex-host": 1 },
      "ops/clamav/README.md": { "convex-deployment": 2 },
      "apps/antsia_ga/src/lib/app-path.test.ts": { "convex-host": 13 },
      "convex/seeds/demoContentConfig.ts": { "convex-deployment": 1 },
      // Faux positifs de l'ancienne forme (745 occurrences dans docs/ au compte rendu d'EX-01) : plus aucun.
      "docs/recette/tri-arbre-partage-2026-11-02/classement.json": {},
      "docs/design-systems/09_IMPLEMENTATION_ET_RECETTE.md": {},
      "docs/recette/responsive-en-ligne-2026-10-21/mesures-sans-contenu-prive.json": {},
      "docs/etudes/2026-10-18-social-commerce/rapports/P01_CHARTE.md": {},
      "packages/ui/src/styles/charte.css": {},
      "packages/social-features/src/shell/mobile/ReseauMobileTabBar.tsx": {},
      "convex/modules/federation/commerceTransport.test.ts": {},
      "convex/lib/devTools.test.ts": {},
    }
    for (const [path, counts] of Object.entries(expected)) {
      const found = countByKind(detectDeploymentIdentifiers(path, fileAtCommit(BEFORE_CLEANUP, path)))
      expect({ path, counts: found }).toEqual({ path, counts })
    }
  })
})

/** Développe un décompte en autant de trouvailles fictives, pour le ranger comme `countByKind`. */
function expand(counts: Partial<Record<IdentifierKind, number>>): { kind: IdentifierKind }[] {
  return Object.entries(counts).flatMap(([kind, count]) => Array.from({ length: count ?? 0 }, () => ({ kind: kind as IdentifierKind })))
}
