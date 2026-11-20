/**
 * crons-contract — PA3 lot 17. Ne laisse pas disparaître ou dériver les dix
 * passages de maintenance de l'owner map §4.2 ; protège aussi les inscriptions
 * futures contre les identifiants invalides, doublons et cibles publiques.
 */
import { describe, expect, it } from "vitest"

import { detectCronContractViolations, PA3_CRON_CONTRACTS } from "./lib/crons-contract"
import { formatFindings, readRepoFile } from "./lib/source-files"

const FILE = "convex/crons.ts"
const fixture = [
  'import { cronJobs } from "convex/server"',
  'import { internal } from "./_generated/api"',
  "const crons = cronJobs()",
  ...PA3_CRON_CONTRACTS.map((contract) => `crons.${contract.kind}("${contract.name}", ${JSON.stringify(contract.schedule)}, ${contract.target}, {})`),
  "export default crons",
].join("\n")

function messages(text: string): string[] {
  return detectCronContractViolations(FILE, text).map((finding) => finding.message)
}

describe("crons-contract — dix jobs PA3 internes, exacts et branchés", () => {
  it("le registre réel respecte le contrat", () => {
    const findings = detectCronContractViolations(FILE, readRepoFile(FILE))
    expect(findings, formatFindings(findings)).toEqual([])
    expect(PA3_CRON_CONTRACTS).toHaveLength(10)
  })

  it("la source fabriquée passe, indépendamment des commentaires et de l'ordre des propriétés", () => {
    expect(messages(fixture)).toEqual([])
    expect(messages(fixture.replace('{"hourUTC":3,"minuteUTC":15}', '{ minuteUTC: 15, "hourUTC": 3 }'))).toEqual([])
    expect(messages(`${fixture}\n// crons.interval("faux", {}, api.public, {})`)).toEqual([])
  })

  it("accepte les alias d'import Convex et le renommage de la variable du registre", () => {
    const aliased = fixture
      .replace("{ cronJobs }", "{ cronJobs as makeCrons }")
      .replace("cronJobs()", "makeCrons()")
      .replace("{ internal }", "{ internal as privateApi }")
      .replaceAll("internal.modules", "privateApi.modules")
      .replaceAll("crons", "jobs")
    expect(messages(aliased)).toEqual([])
  })

  it.each(PA3_CRON_CONTRACTS.map((contract) => contract.name))("voit la suppression de %s", (name) => {
    const without = fixture.split("\n").filter((line) => !line.includes(`("${name}",`)).join("\n")
    expect(messages(without)).toContain(`cron PA3 absent « ${name} »`)
    // Une inscription conservée dans un commentaire n'enregistre aucune tâche.
    const commented = fixture.split("\n").map((line) => line.includes(`("${name}",`) ? `// ${line}` : line).join("\n")
    expect(messages(commented)).toContain(`cron PA3 absent « ${name} »`)
  })

  it.each([
    ["intervalle changé", '{"minutes":5}', '{"minutes":6}', "cadence"],
    ["unité changée", '{"minutes":5}', '{"hours":5}', "cadence"],
    ["heure quotidienne changée", '{"hourUTC":3,"minuteUTC":15}', '{"hourUTC":4,"minuteUTC":15}', "cadence"],
    ["méthode changée", 'crons.interval("files-retry-stale-scans"', 'crons.daily("files-retry-stale-scans"', "méthode"],
    ["cible changée", "internal.modules.files.mutations.retryStale", "internal.modules.files.mutations.other", "cible"],
    ["arguments ajoutés", "retryStale, {})", "retryStale, { cursor: null })", "arguments {}"],
    ["arguments indirects", "retryStale, {})", "retryStale, emptyArgs)", "arguments {}"],
    ["arguments omis", "retryStale, {})", "retryStale)", "arguments"],
    ["cadence indirecte", '{"minutes":5}', "retrySchedule", "cadence"],
    ["propriété dupliquée", '{"minutes":5}', '{"minutes":5,"minutes":5}', "cadence"],
    ["cadence par spread", '{"minutes":5}', "{ ...retrySchedule }", "cadence"],
  ])("refuse %s", (_label, before, after, expected) => {
    expect(messages(fixture.replace(before, after)).some((message) => message.includes(expected))).toBe(true)
  })

  it.each([
    ["non ASCII", '"purge éphémère"'],
    ["vide", '""'],
    ["espaces seulement", '"   "'],
    ["caractère de contrôle", '"purge\\n"'],
    ["nom indirect", "jobName"],
    ["interpolation", "`purge-${suffix}`"],
  ])("refuse un identifiant %s même hors PA3", (_label, name) => {
    expect(messages(`${fixture}\ncrons.interval(${name}, { hours: 2 }, internal.modules.diaspora.hubs.refreshHubCounters, {})`)).toContain("identifiant de cron littéral, ASCII imprimable et non vide attendu")
  })

  it("refuse les identifiants et les cibles PA3 dupliqués", () => {
    expect(messages(`${fixture}\ncrons.interval("files-retry-stale-scans", { minutes: 5 }, internal.modules.files.mutations.retryStale, {})`)).toEqual(expect.arrayContaining([
      "identifiant de cron dupliqué « files-retry-stale-scans »",
      "cible PA3 inscrite plusieurs fois « internal.modules.files.mutations.retryStale »",
    ]))
    expect(messages(`${fixture}\ncrons.interval("second-retry", { minutes: 5 }, internal.modules.files.mutations.retryStale, {})`)).toContain("cible PA3 inscrite plusieurs fois « internal.modules.files.mutations.retryStale »")
  })

  it.each(["api.modules.diaspora.hubs.refreshHubCounters", "someInternal.modules.task", 'internal["modules"].diaspora.hubs.refreshHubCounters', 'makeFunctionReference("modules/task:run")'])("refuse la cible non prouvée interne %s", (target) => {
    expect(messages(`${fixture}\ncrons.daily("extension", { hourUTC: 2, minuteUTC: 30 }, ${target}, {})`)).toContain("la cible du cron doit venir de internal importé de ./_generated/api")
  })

  it("refuse un faux import interne, un faux registre et un export débranché", () => {
    expect(messages(fixture.replace('from "./_generated/api"', 'from "./other"'))).toContain("la cible du cron doit venir de internal importé de ./_generated/api")
    expect(messages(fixture.replace('from "convex/server"', 'from "./other"'))).toContain("un seul registre cronJobs() importé de convex/server est attendu")
    expect(messages(fixture.replace("export default crons", "export default other"))).toContain("le registre des crons doit être exporté par défaut")
    expect(messages(`${fixture}\nconst another = cronJobs()`)).toContain("un seul registre cronJobs() importé de convex/server est attendu")
  })

  it("refuse une inscription conditionnelle et une méthode calculée", () => {
    expect(messages(fixture.replace('crons.interval("files-retry-stale-scans"', 'if (enabled) crons.interval("files-retry-stale-scans"'))).toContain("une inscription de cron doit être directe, au niveau du module")
    expect(messages(fixture.replace('crons.interval("files-retry-stale-scans"', 'crons["interval"]("files-retry-stale-scans"'))).toContain("la méthode du cron doit être un accès direct")
  })

  it("refuse le registre mutable et les inscriptions cachées derrière une aide ou un alias", () => {
    expect(messages(fixture.replace("const crons =", "let crons ="))).toContain("un seul registre cronJobs() importé de convex/server est attendu")
    for (const hidden of ["const alias = crons", "registerExtra(crons)", "const register = crons.interval", "crons = another"]) {
      expect(messages(`${fixture}\n${hidden}`)).toContain("le registre des crons ne doit être ni réassigné, ni transmis à une aide ou un alias")
    }
  })

  it("laisse ajouter les jobs DIASPORA.GA et PA5 sans imposer leur cadence ni leurs arguments", () => {
    expect(messages(`${fixture}\ncrons.daily("compteurs des hubs DIASPORA.GA", { hourUTC: 2, minuteUTC: 30 }, internal.modules.diaspora.hubs.refreshHubCounters, {})\ncrons.interval("future-retention", { hours: 6 }, internal.modules.notifications.retention.run, { dryRun: false })`)).toEqual([])
  })
})
