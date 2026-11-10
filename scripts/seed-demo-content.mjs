/**
 * Graines de la démonstration ANTSIA (vivid-hedgehog-655), à lancer par le propriétaire
 * APRÈS le convex deploy de la démo :
 *
 *   ANTSIA_CONVEX_DEMO_DEPLOY_KEY='…' node scripts/seed-demo-content.mjs [--dry-run]
 *
 * 1. comptes OTP : sept acteurs puis dix figurants (vrai parcours, `prepare-demo-content`) ;
 * 2. `seeds/demoContent:run` puis `:runFigurants`, puis `seeds/demoConversations:run` (iCom et
 *    iCom Pro, ADR-0036) — fonctions internes, clé de la démo ;
 * 3. images : chaque cible planifiée par le serveur reçoit les octets du dépôt ; le serveur
 *    n'accepte que la taille et l'empreinte de son manifeste.
 *
 * La clé n'est ni affichée ni écrite ; elle doit désigner le déploiement de démonstration.
 * Rejouable : rien n'est recréé, rien de retiré n'est republié.
 */
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"

import { prepareDemoAccounts, prepareDemoFigurants, targetConfiguration } from "./prepare-demo-content.mjs"

export const DEMO_DEPLOYMENT = "vivid-hedgehog-655"
const CONFIRMATION = "ANTSIA_DEMO_CONTENT_2026_10_20"
const MEDIA_ROOT = new URL("../apps/antsia_ga/public/demo-media/", import.meta.url)
const MEDIA_FILE = /^[a-z0-9-]+\/[a-z0-9-]+\.(png|jpg)$/

/** Le nom de déploiement porté par une clé « <type>:<nom>|… », sans jamais l'afficher. */
export function deploymentOfKey(key) {
  if (typeof key !== "string" || !key.includes("|")) return null
  const head = key.slice(0, key.indexOf("|"))
  return head.includes(":") ? head.slice(head.lastIndexOf(":") + 1) : null
}

export function adminClient(key, { backend = targetConfiguration("demo").backend } = {}) {
  if (deploymentOfKey(key) !== DEMO_DEPLOYMENT) throw new Error(`ANTSIA_CONVEX_DEMO_DEPLOY_KEY ne désigne pas ${DEMO_DEPLOYMENT}.`)
  const client = new ConvexHttpClient(backend)
  client.setAdminAuth(key)
  const call = (name, args) => client.function(makeFunctionReference(name), undefined, args)
  return { call }
}

/** Les images planifiées, une par une ; un fichier hors du catalogue public est refusé. */
export async function seedMedia(call, { log = console.log, readMedia = (file) => readFile(new URL(file, MEDIA_ROOT)) } = {}) {
  const args = { confirmNonProduction: CONFIRMATION }
  const pending = (await call("seeds/demoContent:mediaTargets", args)).filter((target) => !target.attached)
  let attached = 0
  for (const target of pending) {
    if (!MEDIA_FILE.test(target.file)) throw new Error("Fichier d'illustration refusé.")
    const bytes = await readMedia(target.file)
    const result = await call("seeds/demoContentMedia:storeAsset", { ...args, key: target.key, dataBase64: Buffer.from(bytes).toString("base64") })
    if (result.attached) attached += 1
    log(`Image ${result.attached ? "posée" : "déjà en place"} : ${target.kind} ${target.ownerHandle} (${target.file})`)
  }
  const remaining = (await call("seeds/demoContent:mediaTargets", args)).filter((target) => !target.attached).length
  return { attached, remaining }
}

export async function seedDemoContent({ key, dryRun = false, log = console.log, prepare = { prepareDemoAccounts, prepareDemoFigurants }, client } = {}) {
  const { call } = client ?? adminClient(key)
  if (dryRun) {
    const accounts = await prepare.prepareDemoAccounts("demo", { log })
    const figurants = await prepare.prepareDemoFigurants("demo", { log })
    return { action: "dry-run", accounts, figurants }
  }
  const args = { confirmNonProduction: CONFIRMATION }
  await prepare.prepareDemoAccounts("demo", { apply: true, log })
  await prepare.prepareDemoFigurants("demo", { apply: true, log })
  const content = await call("seeds/demoContent:run", args)
  log(`Contenus des acteurs : ${content.postsCreated} publications créées, ${content.postsExisting} déjà en place.`)
  const figurants = await call("seeds/demoContent:runFigurants", args)
  log(`Figurants : ${figurants.figurants} prêts, ${figurants.postsCreated} publications, ${figurants.connections} relations, ${figurants.requests} demandes en attente.`)
  const conversations = await call("seeds/demoConversations:run", args)
  log(`Conversations : ${conversations.directMessages} messages iCom, ${conversations.shopMessages} messages iCom Pro${conversations.channelEnabled ? "" : " (canal boutique fermé par décision : aucun fil de boutique)"}.`)
  const media = await seedMedia(call, { log })
  log(`Images : ${media.attached} posées, ${media.remaining} restantes.`)
  return { content, figurants, conversations, media }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDemoContent({ key: process.env.ANTSIA_CONVEX_DEMO_DEPLOY_KEY, dryRun: process.argv.includes("--dry-run") })
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1 })
}
