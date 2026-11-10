/**
 * ICP-2 (ADR-0036) : conversations de la démonstration, pour que iCom et iCom Pro soient vivants.
 *
 * - iCom : quelques échanges à deux entre relations ACCEPTÉES (aucune relation n'est créée ici :
 *   la garde d'ouverture d'un fil est relue, une relation rompue fait sauter l'échange) ;
 * - iCom Pro : des clients écrivent aux trois boutiques de démonstration, dans trois états
 *   (nouvelle demande, en cours, close), et un acteur écrit à une boutique comme client.
 *
 * Pour que les boutiques lisent leurs messages, chaque propriétaire reçoit le mandat de sa boutique,
 * la boutique accepte les demandes et, SI la racine n'a encore aucune politique du canal boutique,
 * la démonstration l'ouvre. Une décision existante (mandat, réglage, politique) n'est jamais touchée.
 *
 * Rejouable : un échange ou un fil déjà présent n'est pas reproduit ; rien de retiré n'est republié.
 */
import { assertMessageContent } from "@antsia/social-contracts/messaging"
import { commercialText } from "@antsia/social-domain/commercialContact"
import { v } from "convex/values"

import type { Doc, Id } from "../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../_generated/server"
import { checked } from "../lib/errors"
import { contactNetworkEnabled } from "../modules/commercialMessaging/access"
import { onCommercialActivity } from "../modules/commercialMessaging/hooks"
import { commercialDigest } from "../modules/commercialMessaging/threads"
import { assertCanOpenPersonalThread } from "../modules/messaging/inbox"
import { adjustPersonalUnreadTotal, appendPersonalMessage, ensurePersonalThread, findIdempotentReplay, isUnreadFor } from "../modules/messaging/threads"
import { appendAudit } from "../modules/platform/audit"
import { type Actor, actorPerson, DEMO_CONTENT_PAGES, demoContext, readyFigurants } from "./demoContent"
import { DEMO_CONTENT_VERSION } from "./demoContentConfig"

type Party = { actor: Actor } | { figurant: number }
type DirectSpec = { key: string; a: Party; b: Party; messages: readonly { from: "a" | "b"; text: string }[] }
type ShopThreadSpec = { key: string; shop: string; requester: Party; state: "requested" | "accepted" | "closed"; messages: readonly { from: "requester" | "shop"; text: string }[] }

/** Échanges à deux, uniquement entre relations posées par les graines (acteurs et figurants). */
export const DEMO_DIRECT_CONVERSATIONS: readonly DirectSpec[] = [
  { key: "awa-larissa", a: { actor: "membre" }, b: { figurant: 9 }, messages: [
    { from: "b", text: "Démo — Bonjour Awa, merci encore pour l'atelier de samedi !" },
    { from: "a", text: "Démo — Avec plaisir Larissa, tu as été très rapide sur les tableaux croisés." },
    { from: "b", text: "Démo — Tu refais une séance le mois prochain ? Deux amies voudraient venir." },
  ] },
  { key: "awa-kevin", a: { actor: "membre" }, b: { figurant: 1 }, messages: [
    { from: "b", text: "Démo — Awa, j'ai un portable de client qui chauffe beaucoup, tu aurais un conseil ?" },
    { from: "a", text: "Démo — Souvent le ventilateur est encrassé. Passe à l'atelier demain, je regarde avec toi." },
    { from: "b", text: "Démo — Parfait, à demain 10 h." },
  ] },
  { key: "awa-ines", a: { actor: "membre" }, b: { figurant: 4 }, messages: [
    { from: "b", text: "Démo — Bonsoir Awa, mon téléphone ne charge plus. Tu répares aussi les téléphones ?" },
  ] },
  { key: "awa-jean-remy", a: { actor: "membre" }, b: { actor: "verifie" }, messages: [
    { from: "b", text: "Démo — Awa, tu pourrais m'aider à installer mon logiciel de retouche ?" },
    { from: "a", text: "Démo — Bien sûr, jeudi à 15 h au studio ?" },
    { from: "b", text: "Démo — Parfait, à jeudi !" },
  ] },
  { key: "patrick-joseph", a: { actor: "commercant" }, b: { figurant: 6 }, messages: [
    { from: "b", text: "Démo — Patrick, j'aurai du poisson fumé samedi. Je t'en garde combien de lots ?" },
    { from: "a", text: "Démo — Mets-moi dix lots, comme d'habitude." },
    { from: "b", text: "Démo — C'est noté, je les dépose à l'épicerie avant 9 h." },
  ] },
  { key: "patrick-mireille", a: { actor: "commercant" }, b: { figurant: 2 }, messages: [
    { from: "b", text: "Démo — Bonjour Patrick, il te reste des ananas bien mûrs ?" },
    { from: "a", text: "Démo — Oui, l'arrivage est arrivé ce matin." },
  ] },
  { key: "jean-remy-prisca", a: { actor: "verifie" }, b: { figurant: 7 }, messages: [
    { from: "b", text: "Démo — Jean-Rémy, tu fais aussi des photos de défilé de coiffure ?" },
    { from: "a", text: "Démo — Oui, écris-moi depuis la page du studio pour le devis, je te réponds vite." },
  ] },
  { key: "sylvie-georgette", a: { actor: "presse" }, b: { figurant: 5 }, messages: [
    { from: "b", text: "Démo — Sylvie, pour votre reportage sur la mer, je peux vous raconter l'histoire du port de Mayumba." },
    { from: "a", text: "Démo — Merveilleux, je vous appelle cette semaine pour fixer un rendez-vous." },
  ] },
  { key: "clarisse-albert", a: { actor: "association" }, b: { figurant: 3 }, messages: [
    { from: "b", text: "Démo — Clarisse, je peux donner des livres de mathématiques pour votre coin lecture." },
    { from: "a", text: "Démo — Merci beaucoup Albert, ils seront très utiles aux collégiens." },
  ] },
  { key: "paul-henri-steeve", a: { actor: "administration" }, b: { figurant: 10 }, messages: [
    { from: "b", text: "Démo — Bonjour, j'ai déposé à l'accueil un téléphone oublié dans mon taxi." },
    { from: "a", text: "Démo — Merci Steeve, son propriétaire l'a récupéré ce matin." },
  ] },
  { key: "nadege-ulrich", a: { actor: "moderateur" }, b: { figurant: 8 }, messages: [
    { from: "b", text: "Démo — Bonjour Nadège, comment signaler un faux compte ?" },
    { from: "a", text: "Démo — Ouvrez le profil, puis le menu et « Signaler ». Je regarde aussi de mon côté." },
  ] },
]

/** Clients des trois boutiques de démonstration, dans les trois états d'une boîte de boutique. */
export const DEMO_SHOP_CONVERSATIONS: readonly ShopThreadSpec[] = [
  { key: "epicerie-mireille", shop: "epicerie-moussavou-demo", requester: { figurant: 2 }, state: "accepted", messages: [
    { from: "requester", text: "Démo — Bonjour, avez-vous du riz parfumé en sac de 25 kg ?" },
    { from: "shop", text: "Démo — Bonjour Mireille, oui, sur commande, livré en 48 h." },
    { from: "requester", text: "Démo — Parfait, je vous confirme la commande demain." },
  ] },
  { key: "epicerie-steeve", shop: "epicerie-moussavou-demo", requester: { figurant: 10 }, state: "requested", messages: [
    { from: "requester", text: "Démo — Bonjour, livrez-vous à Owendo en fin de journée ?" },
  ] },
  { key: "epicerie-awa", shop: "epicerie-moussavou-demo", requester: { actor: "membre" }, state: "accepted", messages: [
    { from: "requester", text: "Démo — Bonjour, il vous reste de l'huile en bidon de 5 L ?" },
    { from: "shop", text: "Démo — Oui Awa, nous vous en mettons un de côté jusqu'à samedi." },
  ] },
  { key: "studio-prisca", shop: "studio-objectif-demo", requester: { figurant: 7 }, state: "accepted", messages: [
    { from: "requester", text: "Démo — Bonjour, je souhaite un devis pour un défilé de coiffure le 15 novembre." },
    { from: "shop", text: "Démo — Avec plaisir ! Combien de modèles, et pour quelle durée ?" },
    { from: "requester", text: "Démo — Une dizaine de modèles, environ deux heures." },
  ] },
  { key: "studio-larissa", shop: "studio-objectif-demo", requester: { figurant: 9 }, state: "requested", messages: [
    { from: "requester", text: "Démo — Bonjour, faites-vous des photos d'identité le samedi matin ?" },
  ] },
  { key: "atelier-kevin", shop: "atelier-tech-demo", requester: { figurant: 1 }, state: "accepted", messages: [
    { from: "requester", text: "Démo — Bonjour, je cherche un remplacement d'écran pour un portable de 15 pouces." },
    { from: "shop", text: "Démo — Bonjour Kévin, apportez-le à l'atelier : le diagnostic est offert." },
  ] },
  { key: "atelier-albert", shop: "atelier-tech-demo", requester: { figurant: 3 }, state: "requested", messages: [
    { from: "requester", text: "Démo — Mon imprimante ne reconnaît plus les cartouches, pouvez-vous m'aider ?" },
  ] },
  { key: "atelier-joseph", shop: "atelier-tech-demo", requester: { figurant: 6 }, state: "closed", messages: [
    { from: "requester", text: "Démo — Merci pour la réparation de la semaine dernière, tout fonctionne." },
    { from: "shop", text: "Démo — Merci Joseph, à votre service !" },
  ] },
]

function directKey(spec: DirectSpec, index: number): string { return `${DEMO_CONTENT_VERSION}:dm:${spec.key}:${index}` }
function shopMessageKey(spec: ShopThreadSpec, index: number): string { return `${DEMO_CONTENT_VERSION}:shop:${spec.key}:${index}` }

/** Lire avant de répondre : les messages de l'autre deviennent lus pour `readerId`, le compteur suit. */
async function markReadFor(ctx: MutationCtx, thread: Doc<"personalThreads">, readerId: Id<"persons">): Promise<void> {
  const other = thread.personLow === readerId ? thread.personHigh : thread.personLow
  const unread = await ctx.db.query("personalMessages").withIndex("by_thread_sender_read", q => q.eq("threadId", thread._id).eq("senderPersonId", other).eq("readAt", undefined)).take(50)
  const counted = unread.filter(message => isUnreadFor(message, readerId)).length
  const now = Date.now()
  for (const message of unread) await ctx.db.patch(message._id, { readAt: now })
  if (counted > 0) await adjustPersonalUnreadTotal(ctx, thread.networkId, readerId, -counted)
}

export const run = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({ mandates: v.number(), settings: v.number(), channelOpened: v.boolean(), channelEnabled: v.boolean(), directThreads: v.number(), directMessages: v.number(), shopThreads: v.number(), shopMessages: v.number() }),
  handler: async (ctx, args) => {
    const { root, people } = await demoContext(ctx, args.confirmNonProduction)
    const figurants = await readyFigurants(ctx, root)
    const personOf = (party: Party): Doc<"persons"> | undefined => "actor" in party ? actorPerson(people, party.actor) : figurants.get(party.figurant)
    const totals = { mandates: 0, settings: 0, channelOpened: false, channelEnabled: false, directThreads: 0, directMessages: 0, shopThreads: 0, shopMessages: 0 }
    const now = Date.now()

    // Le canal boutique de la racine : ouvert pour la démonstration seulement s'il n'a jamais été décidé.
    const policy = await ctx.db.query("commercialNetworkPolicies").withIndex("by_network", q => q.eq("networkId", root._id)).unique()
    if (!policy) {
      await ctx.db.insert("commercialNetworkPolicies", { networkId: root._id, enabled: true, updatedAt: now })
      await appendAudit(ctx, { action: "commercial.policy_set", capacity: "system", networkId: root._id, subject: { table: "networks", id: root._id }, details: { reason: "Animation explicitement demandée des seules activités fictives de démonstration (ADR-0036).", enabled: true } })
      totals.channelOpened = true
    }
    totals.channelEnabled = await contactNetworkEnabled(ctx, root._id)

    // Chaque boutique de démonstration : mandat de son propriétaire, demandes acceptées (s'ils n'existent pas).
    const shops = new Map<string, { shop: Doc<"shops">; owner: Doc<"persons"> }>()
    for (const spec of DEMO_CONTENT_PAGES) {
      if (!spec.model) continue
      const page = await ctx.db.query("pages").withIndex("by_handle", q => q.eq("handle", spec.handle)).unique()
      const shop = page ? await ctx.db.query("shops").withIndex("by_page", q => q.eq("pageId", page._id)).unique() : null
      const owner = actorPerson(people, spec.actor)
      if (!page || !shop || page.createdByPersonId !== owner._id || shop.networkId !== root._id || shop.storefront !== "published") continue
      shops.set(spec.handle, { shop, owner })
      const mandate = await ctx.db.query("shopContactMandates").withIndex("by_shop_person", q => q.eq("shopId", shop._id).eq("personId", owner._id)).unique()
      if (!mandate) {
        await ctx.db.insert("shopContactMandates", { networkId: shop.networkId, shopId: shop._id, personId: owner._id, canRead: true, canReply: true, canDecide: true, canCall: true, revision: 1, acceptedAt: now, createdAt: now, updatedAt: now })
        await appendAudit(ctx, { action: "commercial.mandate_grant", capacity: "system", networkId: shop.networkId, subject: { table: "persons", id: owner._id }, details: { revision: 1, shopId: shop._id }, at: now })
        totals.mandates += 1
      }
      const settings = await ctx.db.query("shopContactSettings").withIndex("by_shop", q => q.eq("shopId", shop._id)).unique()
      if (!settings) {
        await ctx.db.insert("shopContactSettings", { networkId: shop.networkId, shopId: shop._id, acceptRequests: true, updatedAt: now, updatedByPersonId: owner._id })
        await appendAudit(ctx, { action: "commercial.shop_settings_set", capacity: "system", networkId: shop.networkId, subject: { table: "shops", id: shop._id }, details: { acceptRequests: true }, at: now })
        totals.settings += 1
      }
    }

    // iCom : échanges à deux entre relations ; chacun lit avant de répondre.
    for (const spec of DEMO_DIRECT_CONVERSATIONS) {
      const a = personOf(spec.a), b = personOf(spec.b)
      if (!a || !b) continue
      try {
        await assertCanOpenPersonalThread(ctx, root._id, a._id, b._id)
      } catch {
        continue
      }
      const first = spec.messages[0]
      if (!first) continue
      const { thread, created } = await ensurePersonalThread(ctx, root._id, first.from === "a" ? a._id : b._id, first.from === "a" ? b._id : a._id)
      if (created) totals.directThreads += 1
      for (const [index, message] of spec.messages.entries()) {
        const key = directKey(spec, index)
        if (await findIdempotentReplay(ctx, thread._id, key)) continue
        const sender = message.from === "a" ? a : b
        const live = await ctx.db.get(thread._id)
        if (!live || live.status !== "active") break
        await markReadFor(ctx, live, sender._id)
        await appendPersonalMessage(ctx, live, { senderPersonId: sender._id, content: checked(() => assertMessageContent(message.text, false)), idempotencyKey: key })
        totals.directMessages += 1
      }
    }

    // iCom Pro : les clients écrivent aux boutiques (canal ouvert seulement).
    if (totals.channelEnabled) {
      for (const spec of DEMO_SHOP_CONVERSATIONS) {
        const target = shops.get(spec.shop)
        const requester = personOf(spec.requester)
        if (!target || !requester || requester._id === target.owner._id) continue
        const existing = await ctx.db.query("commercialThreads").withIndex("by_requester_shop_offer", q => q.eq("networkId", root._id).eq("requesterPersonId", requester._id).eq("shopId", target.shop._id).eq("offerRef", undefined)).first()
        if (existing) continue
        const opening = spec.messages[0]
        const openingText = opening ? commercialText(opening.text) : null
        if (!opening || opening.from !== "requester" || openingText === null) continue
        const createdAt = Date.now()
        const threadId = await ctx.db.insert("commercialThreads", { networkId: root._id, shopId: target.shop._id, requesterPersonId: requester._id, conversationRef: "pending", state: "requested", revision: 1, buyerCallsAllowed: false, createdAt, updatedAt: createdAt, lastMessageAt: createdAt })
        await ctx.db.patch(threadId, { conversationRef: `antsia:conv:${await commercialDigest([threadId, root._id, requester._id, createdAt])}` })
        const openingId = await ctx.db.insert("commercialMessages", { networkId: root._id, threadId, senderPersonId: requester._id, senderKind: "requester", content: openingText, idempotencyKey: shopMessageKey(spec, 0), digest: await commercialDigest(["request", target.shop._id, null, openingText]), createdAt })
        await ctx.db.insert("commercialReadStates", { networkId: root._id, threadId, personId: requester._id, readAt: createdAt, updatedAt: createdAt })
        await onCommercialActivity(ctx, { threadId, actorPersonId: requester._id, kind: "requested", messageId: openingId })
        totals.shopThreads += 1
        totals.shopMessages += 1
        if (spec.state === "requested") continue
        let revision = 2
        await ctx.db.patch(threadId, { state: "accepted", revision, updatedAt: Date.now(), assignedRespondentPersonId: target.owner._id })
        await onCommercialActivity(ctx, { threadId, actorPersonId: target.owner._id, kind: "accepted" })
        for (const [index, message] of spec.messages.slice(1).entries()) {
          const text = commercialText(message.text)
          if (text === null) continue
          const sender = message.from === "shop" ? target.owner : requester
          const at = Date.now()
          revision += 1
          const messageId = await ctx.db.insert("commercialMessages", { networkId: root._id, threadId, senderPersonId: sender._id, senderKind: message.from === "shop" ? "shop" : "requester", content: text, idempotencyKey: shopMessageKey(spec, index + 1), digest: await commercialDigest(["message", threadId, text, []]), createdAt: at })
          await ctx.db.patch(threadId, { lastMessageAt: at, updatedAt: at, revision })
          const state = await ctx.db.query("commercialReadStates").withIndex("by_thread_person", q => q.eq("threadId", threadId).eq("personId", sender._id)).unique()
          if (state) await ctx.db.patch(state._id, { readAt: at, updatedAt: at })
          else await ctx.db.insert("commercialReadStates", { networkId: root._id, threadId, personId: sender._id, readAt: at, updatedAt: at })
          await onCommercialActivity(ctx, { threadId, actorPersonId: sender._id, kind: "message", messageId })
          totals.shopMessages += 1
        }
        if (spec.state === "closed") {
          await ctx.db.patch(threadId, { state: "closed", revision: revision + 1, updatedAt: Date.now() })
          await onCommercialActivity(ctx, { threadId, actorPersonId: target.owner._id, kind: "closed" })
        }
      }
    }
    return totals
  },
})
