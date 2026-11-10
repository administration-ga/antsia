/**
 * Analyse des contrôles d'une publication (EX-01), sans aucun appel : ces
 * fonctions lisent des réponses déjà obtenues (par `fetch` en public, par la
 * commande privée de l'hébergeur avant promotion) et rendent des défauts
 * nommés. Un défaut (`errors`) fait échouer le contrôle ; un avertissement
 * (`warnings`) est consigné sans bloquer.
 */

/** @typedef {{ status: number, headers: Map<string, string>, body: string }} HttpAnswer */
/** @typedef {{ errors: string[], warnings: string[], facts: Record<string, unknown> }} CheckReport */

export const emptyReport = () => ({ errors: [], warnings: [], facts: {} })

/** Fusionne des rapports partiels, chacun préfixé par sa zone. */
export function mergeReports(parts) {
  const report = emptyReport()
  for (const [prefix, part] of parts) {
    report.errors.push(...part.errors.map((message) => `${prefix} : ${message}`))
    report.warnings.push(...part.warnings.map((message) => `${prefix} : ${message}`))
    report.facts[prefix] = part.facts
  }
  return report
}

/**
 * Une réponse HTTP brute de `curl --include` (ce que rend la commande privée
 * de l'hébergeur) : on garde le DERNIER bloc d'en-têtes (après un éventuel
 * « 100 Continue » ou un tunnel).
 * @returns {HttpAnswer}
 */
export function parseCurlInclude(output) {
  let rest = String(output ?? "").replace(/^\s+/, "")
  let status = 0
  let headers = new Map()
  let found = false
  while (/^HTTP\/[0-9.]+ \d{3}/.test(rest)) {
    found = true
    const separator = rest.search(/\r?\n\r?\n/)
    const head = separator < 0 ? rest : rest.slice(0, separator)
    rest = separator < 0 ? "" : rest.slice(separator).replace(/^\r?\n\r?\n/, "")
    const [statusLine, ...lines] = head.split(/\r?\n/)
    status = Number(/^HTTP\/[0-9.]+ (\d{3})/.exec(statusLine)?.[1] ?? 0)
    headers = new Map()
    for (const line of lines) {
      const colon = line.indexOf(":")
      if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
    }
  }
  if (!found) throw new Error("réponse sans ligne d'état HTTP")
  return { status, headers, body: rest }
}

/**
 * La route de santé (EX-03) : 200, version servie exacte, moteur configuré et
 * qui répond. `expectedVersion: null` ne contrôle pas la version (un site plus
 * ancien sur un moteur tout juste publié).
 */
export function analyzeHealth(answer, { expectedVersion }) {
  const report = emptyReport()
  report.facts.status = answer.status
  if (answer.status !== 200) report.errors.push(`santé HTTP ${answer.status} (attendu 200 : un 503 dit que le moteur ne répond pas)`)
  let body
  try {
    body = JSON.parse(answer.body)
  } catch {
    report.errors.push("santé : réponse illisible (JSON attendu)")
    return report
  }
  report.facts.version = body?.version ?? null
  if (expectedVersion !== null && body?.version !== expectedVersion) report.errors.push(`version servie « ${body?.version ?? "absente"} », attendue « ${expectedVersion} »`)
  if (body?.backend !== "configured") report.errors.push("santé : adresse du moteur absente de la configuration du site")
  const engine = body?.engine
  if (engine === undefined) {
    report.warnings.push("santé : état du moteur non rapporté (site antérieur à la sonde EX-03)")
  } else {
    report.facts.engineState = engine?.state ?? null
    report.facts.engineVersion = engine?.version ?? null
    if (engine?.state === "slow") report.warnings.push(`moteur lent (${engine.latencyMs ?? "?"} ms)`)
    else if (engine?.state !== "reachable") report.errors.push(`moteur injoignable selon la sonde (état « ${engine?.state ?? "absent"} »)`)
    if (engine?.version === null || engine?.version === undefined) report.warnings.push("version du moteur non déclarée (ANTSIA_ENGINE_VERSION, posée par le propriétaire)")
  }
  return report
}

const CONVEX_HOST = /(?:^|[\s/])((?:[a-z0-9-]+)\.convex\.(?:cloud|site))(?=[\s:/;'"]|$)/g

/** Les moteurs Convex qu'une politique de sécurité du contenu autorise, par nom. */
export function convexEnginesInCsp(policy) {
  const names = new Set()
  for (const match of String(policy ?? "").matchAll(CONVEX_HOST)) names.add(match[1].replace(/\.convex\.(?:cloud|site)$/, ""))
  return [...names].sort()
}

/**
 * La CSP d'un site n'ouvre QUE son moteur : présent en HTTP et en WebSocket,
 * aucun autre moteur, aucune source de développement.
 */
export function analyzeCsp(policy, expectedEngine) {
  const report = emptyReport()
  if (!policy) {
    report.errors.push("CSP absente des en-têtes")
    return report
  }
  const engines = convexEnginesInCsp(policy)
  report.facts.engines = engines
  for (const other of engines.filter((name) => name !== expectedEngine)) report.errors.push(`CSP ouverte à un autre moteur : ${other}`)
  if (/\*\.convex\.(?:cloud|site)/.test(policy)) report.errors.push("CSP ouverte à tous les moteurs Convex (joker)")
  const connect = /(?:^|;)\s*connect-src([^;]*)/.exec(policy)?.[1]?.trim().split(/\s+/) ?? []
  for (const source of [`https://${expectedEngine}.convex.cloud`, `wss://${expectedEngine}.convex.cloud`]) {
    if (!connect.includes(source)) report.errors.push(`CSP : ${source} absent de connect-src`)
  }
  if (/(?:ws|http):\/\/(?:localhost|127\.0\.0\.1)/.test(policy) || /'unsafe-eval'/.test(policy)) report.errors.push("CSP de développement servie (sources locales ou 'unsafe-eval')")
  return report
}

/** Chaque route clé répond 200 (une redirection n'est pas un succès). */
export function analyzeRoutes(results) {
  const report = emptyReport()
  report.facts.routes = Object.fromEntries(results.map(({ path, status }) => [path, status]))
  for (const { path, status, error } of results) {
    if (status !== 200) report.errors.push(`route ${path} : ${error ?? `HTTP ${status}`} (attendu 200)`)
  }
  return report
}

/**
 * La sortie de `convex deploy --dry-run`. Une suppression d'index est
 * IRRÉVERSIBLE pour les données qu'il servait à retrouver vite : jamais sans
 * décision du propriétaire, donc refus. La ligne « version Node des actions »
 * est un artefact connu de la CLI : consignée, sans bloquer.
 */
export function analyzeDryRun(output) {
  const report = emptyReport()
  const text = String(output ?? "")
  const removed = /Would delete table indexes:\n((?:\s+\[-\].*\n?)+)/.exec(text)?.[1]
  if (removed || /Would delete table indexes/.test(text)) {
    const lines = (removed ?? "").split("\n").map((line) => line.trim()).filter(Boolean)
    report.errors.push(`suppression d'index annoncée (${lines.length || "?"}) : jamais sans décision du propriétaire${lines.length ? ` — ${lines.join(", ")}` : ""}`)
  }
  const added = /Would add (?:staged )?table indexes:\n((?:\s+\[\+\].*\n?)+)/g
  const addedLines = [...text.matchAll(added)].flatMap((match) => match[1].split("\n").map((line) => line.trim()).filter(Boolean))
  report.facts.addedIndexes = addedLines
  if (addedLines.length > 0) report.warnings.push(`index ajoutés (${addedLines.length}) : remplissage à surveiller sur les grandes tables`)
  if (/version for Node\.js actions/.test(text)) report.warnings.push("ligne « version Node des actions » : artefact connu de la CLI, sans effet")
  return report
}

/** La sortie d'un envoi réel : une suppression d'index qui aurait eu lieu malgré l'essai est une alarme. */
export function analyzeDeploy(output) {
  const report = emptyReport()
  if (/Deleted table indexes/.test(String(output ?? ""))) report.errors.push("des index ont été SUPPRIMÉS pendant l'envoi : prévenir le propriétaire")
  return report
}
