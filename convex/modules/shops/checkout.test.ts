// @vitest-environment edge-runtime
/** P11 : scénarios rédigés seulement, aucune exécution pendant cette reprise. */
import { engineErrorRule } from "@antsia/social-contracts/errors"
import { type CommerceCommandRequest } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, COMMERCE_PUBLIC_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommerceOfferEvent, type CommercePublicEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { COMMERCE_CHECKOUT_CONSENT_VERSION, COMMERCE_CHECKOUT_CONTROL_CONTRACT, type CommerceCheckoutControlRequest } from "@antsia/social-domain/commerce-checkout"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, createTestSession, testConvex } from "../../test.setup"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex } from "./commerceLinkCrypto"
import { revokeCheckoutsForPerson } from "./checkoutLifecycle"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"
import type { CartContext, CheckoutActionResult, CheckoutAttempt, CheckoutIntentLookup, CheckoutOptionsResult, CheckoutStopIntentResult } from "./checkoutRules"
const NOW = Date.UTC(2026,9,18,12)
const SHOP="pro.ga:structure:01JA00000000000000000000S1", OFFER="pro.ga:offer:01JA00000000000000000000P1", LINK="pro.ga:commerce_link:01JA00000000000000000000K1", COLLECTION="pro.ga:offer_collection:01JA00000000000000000000C1"
const CHECKOUT="pro.ga:checkout:01JA00000000000000000000H1", ESTABLISHMENT="pro.ga:establishment:01JA00000000000000000000E1"
const KEY_NAME="ANTSIA_FEDERATION_CATALOG_TEST_KEY", KEY="catalogue-test-secret-key-sandbox-0123456789"
let eventSequence=0
const policy=makeFunctionReference<"mutation",{networkId:Id<"networks">;enabled:boolean;reason:string},null>("modules/shops/catalogControl:setPolicy")
const mapping=makeFunctionReference<"mutation",{networkId:Id<"networks">;shopId:Id<"shops">;emitterId:Id<"federationEmitters">;enabled:boolean;reason:string},null>("modules/shops/catalogControl:configureMapping")
type Net={networkId:Id<"networks">}
const prepare=makeFunctionReference<"action",Net & {handle:string;lines:{offerRef:string;quantity:number;expectedCatalogRevision:number;expectedUnitAmount:{amount:number;currency:"XAF"}}[];fulfillment:{mode:"pickup";establishmentRef:string};consentTextVersion:string;expectedPolicyVersion:number;clientRequestId:string},CheckoutActionResult>("modules/shops/checkoutActions:prepare")
const options=makeFunctionReference<"action",Net & {handle:string},CheckoutOptionsResult>("modules/shops/checkoutActions:options")
const status=makeFunctionReference<"action",Net & {attemptId:string},CheckoutActionResult>("modules/shops/checkoutActions:status")
const retry=makeFunctionReference<"action",Net & {attemptId:string},CheckoutActionResult>("modules/shops/checkoutActions:retry")
const release=makeFunctionReference<"action",Net & {attemptId:string},CheckoutActionResult>("modules/shops/checkoutActions:release")
const reconfirm=makeFunctionReference<"action",Net & {attemptId:string;consentTextVersion:string;clientRequestId:string;acceptedTotal:{amount:number;currency:"XAF"}},CheckoutActionResult>("modules/shops/checkoutActions:reconfirm")
const get=makeFunctionReference<"query",Net & {attemptId:string},CheckoutAttempt|null>("modules/shops/checkout:getAttempt")
const purge=makeFunctionReference<"mutation",Record<string,never>,null>("modules/shops/checkoutLifecycle:purgeExpired")
const stopIntent=makeFunctionReference<"mutation",Net & {clientRequestId:string},CheckoutStopIntentResult>("modules/shops/checkout:stopClientIntent")
const lookupIntent=makeFunctionReference<"query",Net & {clientRequestId:string},CheckoutIntentLookup>("modules/shops/checkout:findByClientRequestId")
const cart=makeFunctionReference<"query",Net & {handle:string;items:{offerRef:string;variantRef?:string;quantity:number}[]},CartContext>("modules/shops/checkout:cartContext")
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(NOW);eventSequence=0;vi.stubEnv("CONVEX_CLOUD_URL","http://127.0.0.1:3210");vi.stubEnv("FEDERATION_ENVIRONMENT","sandbox");vi.stubEnv(KEY_NAME,KEY);vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT","sandbox");vi.stubEnv("ANTSIA_COMMERCE_SOURCE","antsia");vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN","http://localhost:4010");vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN","http://localhost:4011");vi.stubEnv("ANTSIA_COMMERCE_ORIGIN","http://localhost:3030");vi.stubEnv("ANTSIA_COMMERCE_KEY_ID","antsia-checkout-test");vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY",KEY);vi.stubEnv("FILE_GUARD","off")})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks()})
async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "checkout-buyer-fixture" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "catalogue-owner", displayName: "Catalogue" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(async (ctx) => ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, as, personId)
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const owned = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "catalogue-test", name: "Boutique de recette", description: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: personId, searchText: "boutique recette", createdAt: NOW, updatedAt: NOW })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog", "receive_orders"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceOffer", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, signatoryId, shopId, linkId }
  })
  const emitterId = await as.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: "pro-catalog-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT], reason: "Émetteur fictif du catalogue dans le harnais" })
  await as.mutation(policy, { networkId: root, enabled: true, reason: "Politique fictive de lecture du catalogue" })
  await as.mutation(mapping, { networkId: root, shopId: owned.shopId, emitterId, enabled: true, reason: "Mapping fictif de la boutique et du catalogue" })
  await t.run(async (ctx) => ctx.db.insert("shopCheckoutPolicies", { networkId: root, enabled: true, updatedAt: NOW }))
  return { t, as, root, personId, emitterId, ...owned, offerArgs: { networkId: root, handle: "catalogue-test", offerRef: OFFER } }
}
type Fixture=Awaited<ReturnType<typeof fixture>>
function shop(revision = 1, extra: Partial<CommerceShopEvent> = {}): CommerceShopEvent {
  return { type: revision === 1 ? "shop.published" : "shop.updated", shopRef: SHOP, linkRef: LINK, revision, changedAt: NOW, commercialName: "Activité", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [{ collectionRef: COLLECTION, label: "Collection", position: 0 }], ...extra }
}
function offer(revision = 1, extra: Partial<CommerceOfferEvent> = {}): CommerceOfferEvent {
  return { type: revision === 1 ? "offer.published" : "offer.updated", shopRef: SHOP, offerRef: OFFER, revision, changedAt: NOW, kind: "product", title: "Article de recette", description: "Une description publique du produit.", collectionRefs: [COLLECTION], tags: ["recette"], price: { mode: "fixed", currency: "XAF", amount: 12_000 }, showsAvailability: true, variants: [], variantAxes: [], media: [], ...extra }
}
async function deliver(f: Fixture, payload: CommercePublicEvent) {
  const raw = commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT, eventId: `catalog-event-${++eventSequence}`, objectRef: commercePublicEffect(payload).objectRef, payload, version: 1 })!
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
  const signature = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "x-antsia-emitter": "pro-catalog-test", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
}
async function applied(f: Fixture, payload: CommercePublicEvent) { const response = await deliver(f, payload); expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ status: "applied", applicationStatus: "applied" }) }
async function published(f: Fixture, payload = offer()) { await applied(f, shop()); await applied(f, payload) }

async function ready(){const f=await fixture();await published(f);return f}
function intent(f:Fixture,clientRequestId="checkout-client-0001"){return {networkId:f.root,handle:"catalogue-test",lines:[{offerRef:OFFER,quantity:1,expectedCatalogRevision:1,expectedUnitAmount:{amount:12000,currency:"XAF" as const}}],fulfillment:{mode:"pickup" as const,establishmentRef:ESTABLISHMENT},consentTextVersion:COMMERCE_CHECKOUT_CONSENT_VERSION,expectedPolicyVersion:1,clientRequestId}}
function peer(){
  const sent:{path:string;raw:string}[]=[]
  let actualFee=0,timeout=false,forget=true,revision=1,released=false
  let recorded:string|null=null
  let beforePrepare:(()=>Promise<void>)|null=null
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=new URL(String(input)).pathname,raw=String(init?.body);sent.push({path,raw})
    const request=JSON.parse(raw) as CommerceCheckoutControlRequest|CommerceCommandRequest
    if("operation" in request){
      const result=request.operation==="options"?{shopRef:SHOP,policyVersion:1,pickup:[{establishmentRef:ESTABLISHMENT,label:"Point de retrait"}],fees:[],sellerDelivery:null}:{checkoutRef:CHECKOUT,state:request.operation==="release"?"released":released?"released":"held",revision:request.operation==="release"?++revision:revision,expiresAt:NOW+900000,confirmationRequired:false}
      if(request.operation==="release")released=true
      return new Response(commerceCanonicalJson({contract:COMMERCE_CHECKOUT_CONTROL_CONTRACT,version:1,requestId:request.requestId,requestSha256:await sha256Hex(raw),outcome:"accepted",result}),{status:200})
    }
    if(request.command==="request.status"){
      const complete=recorded!==null&&!forget
      return new Response(commerceCanonicalJson({contract:COMMERCE_COMMAND_CONTRACT,version:1,command:request.command,requestId:request.requestId,requestSha256:await sha256Hex(raw),respondedAt:Date.now(),outcome:"accepted",result:{targetRequestId:request.payload.targetRequestId,state:complete?"completed":"unknown",current:[],...(complete?{recordedResponse:recorded,recordedResponseSha256:await sha256Hex(recorded!)}:{})}}),{status:200})
    }
    if(request.command!=="checkout.prepare")throw new Error("Opération interdite dans le harnais")
    recorded=commerceCanonicalJson({contract:COMMERCE_COMMAND_CONTRACT,version:1,command:request.command,requestId:request.requestId,requestSha256:await sha256Hex(raw),respondedAt:Date.now(),outcome:"accepted",result:{checkoutRef:CHECKOUT,state:"held",expiresAt:Date.now()+900000,fees:actualFee?[{kind:"service",label:"Service",amount:{amount:actualFee,currency:"XAF"}}]:[],lines:request.payload.lines.map(line=>({offerRef:line.offerRef,quantity:line.quantity,catalogRevision:line.expectedCatalogRevision,label:"Article",unitAmount:line.expectedUnitAmount,lineAmount:{amount:line.expectedUnitAmount.amount*line.quantity,currency:"XAF"},...(line.variantRef?{variantRef:line.variantRef}:{})})),total:{amount:request.payload.lines.reduce((s,line)=>s+line.expectedUnitAmount.amount*line.quantity,actualFee),currency:"XAF"}}})!
    if(beforePrepare)await beforePrepare()
    if(timeout)throw new Error("Timeout simulé")
    return new Response(recorded,{status:200})
  })
  vi.stubGlobal("fetch",fetcher)
  return {sent,fetcher,setFee:(fee:number)=>{actualFee=fee},setTimeout:(value:boolean)=>{timeout=value},setForget:(value:boolean)=>{forget=value},before:(callback:()=>Promise<void>)=>{beforePrepare=callback}}
}
async function start(f:Fixture){const r=await f.as.action(prepare,intent(f));if(r.outcome!=="attempt")throw new Error("Tentative manquante");return r.attemptId}
async function row(f:Fixture,id:string){return await f.t.run(async ctx=>ctx.db.query("checkoutAttempts").withIndex("by_attempt",q=>q.eq("attemptId",id)).unique())}

describe("P11 — préparation privée et reprise",()=>{
 it("P13 ferme durablement une clé absente avant l'envoi et refuse son ancien checkout",async()=>{
  const f=await ready(),p=peer(),clientRequestId="client-fenced-0001"
  expect(await f.as.mutation(stopIntent,{networkId:f.root,clientRequestId})).toEqual({outcome:"stopped"})
  expect(await f.as.mutation(stopIntent,{networkId:f.root,clientRequestId})).toEqual({outcome:"stopped"})
  expect(await f.as.query(lookupIntent,{networkId:f.root,clientRequestId})).toEqual({outcome:"stopped"})
  expect(p.sent).toHaveLength(0)
  expect(await f.as.action(prepare,intent(f,clientRequestId))).toEqual({outcome:"refused"})
  expect(p.sent.filter(s=>JSON.parse(s.raw).command==="checkout.prepare")).toHaveLength(0)
  expect(await f.t.run(async ctx=>ctx.db.query("checkoutClientIntentFences").withIndex("by_client",q=>q.eq("personId",f.personId).eq("networkId",f.root).eq("clientRequestId",clientRequestId)).take(2))).toHaveLength(1)
 })
 it("P13 stopClientIntent rend la tentative existante sans annulation ni modification",async()=>{
  const f=await ready(),p=peer(),id=await start(f),before=await row(f,id),count=p.sent.length
  expect(await f.as.mutation(stopIntent,{networkId:f.root,clientRequestId:"checkout-client-0001"})).toMatchObject({outcome:"attempt",attempt:{attemptId:id,state:"held"}})
  expect(await row(f,id)).toEqual(before);expect(p.sent).toHaveLength(count)
 })
 it("P13 projette un panier mono-vendeur multiligne et prépare la même liste",async()=>{
  const f=await ready(),second="pro.ga:offer:01JA00000000000000000000P2"
  await applied(f,offer(1,{offerRef:second}))
  const p=peer(),items=[{offerRef:OFFER,quantity:1},{offerRef:second,quantity:2}]
  expect(await f.as.query(cart,{networkId:f.root,handle:"catalogue-test",items})).toMatchObject({available:true,items:[{offerRef:OFFER,quantity:1,available:true},{offerRef:second,quantity:2,available:true}]})
  const payload={...intent(f),lines:items.map(item=>({...item,expectedCatalogRevision:1,expectedUnitAmount:{amount:12000,currency:"XAF" as const}}))}
  const result=await f.as.action(prepare,payload)
  expect(result.outcome).toBe("attempt")
  expect(JSON.parse(p.sent.find(s=>JSON.parse(s.raw).command==="checkout.prepare")!.raw).payload.lines).toHaveLength(2)
 })
 it("reste fermé sans politique/config et n'exige pas la capacité PUBLIC checkout",async()=>{
  const f=await ready(),p=peer()
  expect(await f.as.action(options,{networkId:f.root,handle:"catalogue-test"})).toMatchObject({outcome:"ready",policyVersion:1})
  await f.t.run(async ctx=>{const policy=await ctx.db.query("shopCheckoutPolicies").withIndex("by_network",q=>q.eq("networkId",f.root)).unique();await ctx.db.patch(policy!._id,{enabled:false})})
  const count=p.sent.length
  expect(await f.as.action(prepare,intent(f))).toEqual({outcome:"unavailable"})
  expect(p.sent.length).toBe(count)
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY",undefined)
  expect(await f.as.action(options,{networkId:f.root,handle:"catalogue-test"})).toEqual({outcome:"unavailable"})
 })
 it("fige octets/empreinte et ne crée ni achat ni paiement ; reçu privé expurgé",async()=>{
  const f=await ready(),p=peer(),id=await start(f),saved=await row(f,id)
  expect(saved?.bodySha256).toBe(await sha256Hex(saved!.rawBody!))
  const dto=await f.as.query(get,{networkId:f.root,attemptId:id})
  expect(dto).toMatchObject({state:"held",expectedPolicyVersion:1,expectedFees:[],paymentAvailable:false})
  expect(dto).not.toHaveProperty("rawBody");expect(dto).not.toHaveProperty("subjectRef");expect(dto).not.toHaveProperty("sessionDigest")
  expect(p.sent.map(s=>s.path)).toEqual(["/commerce/v1/checkouts/options","/commerce/v1/commands"])
 })
 it("une politique de remise différente de celle affichée refuse avant toute préparation",async()=>{
  const f=await ready(),p=peer()
  expect(await f.as.action(prepare,{...intent(f),expectedPolicyVersion:9})).toEqual({outcome:"refused"})
  expect(p.sent.some(s=>s.path==="/commerce/v1/commands")).toBe(false)
 })
 it("après timeout relit request.status puis renvoie exactement les mêmes octets",async()=>{
  const f=await ready(),p=peer();p.setTimeout(true);const id=await start(f),first=p.sent.find(s=>s.path==="/commerce/v1/commands")!.raw
  p.setTimeout(false)
  await f.as.action(retry,{networkId:f.root,attemptId:id})
  const commands=p.sent.filter(s=>s.path==="/commerce/v1/commands")
  expect(JSON.parse(commands[1]!.raw).command).toBe("request.status")
  expect(commands[2]!.raw).toBe(first)
  expect(await f.as.query(get,{networkId:f.root,attemptId:id})).toMatchObject({state:"held"})
 })
 it("retrouve le reçu durable après expiration de la requête sans nouvelle préparation",async()=>{
  const f=await ready(),p=peer();p.setTimeout(true);const id=await start(f)
  vi.setSystemTime(NOW+120000);p.setForget(false)
  await f.as.action(status,{networkId:f.root,attemptId:id})
  expect(await f.as.query(get,{networkId:f.root,attemptId:id})).toMatchObject({state:"held",canRetry:false})
  expect(p.sent.filter(s=>JSON.parse(s.raw).command==="checkout.prepare")).toHaveLength(1)
 })
 it("un frais modifié impose reconfirmation même PRO accepted et un statut held ne l'annule pas",async()=>{
  const f=await ready(),p=peer();p.setFee(500);const id=await start(f)
  expect(await f.as.query(get,{networkId:f.root,attemptId:id})).toMatchObject({state:"reconfirm",expectedFees:[],result:{total:{amount:12500}}})
  await f.as.action(status,{networkId:f.root,attemptId:id})
  expect(await f.as.query(get,{networkId:f.root,attemptId:id})).toMatchObject({state:"reconfirm",paymentAvailable:false})
 })
 it("une nouvelle décision libère le premier hold avant options/nouvelle clé",async()=>{
  const f=await ready(),p=peer();p.setFee(500);const id=await start(f)
  const result=await f.as.action(reconfirm,{networkId:f.root,attemptId:id,consentTextVersion:COMMERCE_CHECKOUT_CONSENT_VERSION,clientRequestId:"reconfirm-client-0002",acceptedTotal:{amount:12500,currency:"XAF"}})
  expect(result.outcome).toBe("attempt")
  expect(p.sent.slice(2).map(s=>s.path)).toEqual(["/commerce/v1/checkouts/release","/commerce/v1/checkouts/options","/commerce/v1/commands"])
  expect(await row(f,id)).toMatchObject({state:"released",reconfirmedByAttemptId:result.outcome==="attempt"?result.attemptId:"missing"})
  const prepares=p.sent.filter(s=>JSON.parse(s.raw).command==="checkout.prepare").map(s=>JSON.parse(s.raw).requestId)
  expect(new Set(prepares).size).toBe(2)
 })
 it("révocation de rôle pendant HTTP n'applique pas la réponse et le hold reste annulable",async()=>{
  const f=await ready(),p=peer();p.before(async()=>{await f.t.run(async ctx=>ctx.db.delete(f.signatoryId))})
  expect(await f.as.action(prepare,intent(f))).toEqual({outcome:"refused"})
  const saved=await f.t.run(async ctx=>ctx.db.query("checkoutAttempts").withIndex("by_person_network",q=>q.eq("personId",f.personId).eq("networkId",f.root)).first())
  expect(saved?.state).toBe("unknown")
  expect(saved?.result).toBeUndefined()
 })
 it("autre session ne réutilise aucun bail, autre personne ne lit aucun reçu",async()=>{
  const f=await ready();peer();const id=await start(f)
  const sessionId=await createTestSession(f.t,"checkout-buyer-fixture")
  const another=f.t.withIdentity({subject:"checkout-buyer-fixture",sessionId})
  expect(await another.query(get,{networkId:f.root,attemptId:id})).toMatchObject({canRelease:false,canRetry:false})
  expect(await another.action(release,{networkId:f.root,attemptId:id})).toEqual({outcome:"refused"})
  const other=f.t.withIdentity({subject:"checkout-other-buyer"})
  await other.mutation(api.modules.people.persons.ensureMyPerson,{})
  // Entrer exige le consentement au profil social et un profil publié (EXF-AN-02, `joinNetwork`) : aucun membre d'office.
  await other.mutation(api.modules.people.consents.recordConsent,{purpose:"social_profile",origin:"onboarding"})
  await other.mutation(api.modules.people.profile.publishMyProfile,{handle:"checkout-other",displayName:"Autre acheteur"})
  await other.mutation(api.modules.people.memberships.joinNetwork,{networkId:f.root})
  expect(await other.query(get,{networkId:f.root,attemptId:id})).toBeNull()
 })
 it("purge les corps à30min et invalide les envois dès demande d'effacement",async()=>{
  const f=await ready(),p=peer();const id=await start(f)
  await f.t.run(async ctx=>ctx.db.patch(f.personId,{deletionRequestedAt:Date.now()}))
  expect(await f.as.query(get,{networkId:f.root,attemptId:id})).toBeNull()
  const revoked=await f.t.run(async ctx=>revokeCheckoutsForPerson(ctx,f.personId))
  expect(revoked.done).toBe(true);expect(revoked.releases[0]).toMatchObject({attemptId:id,checkoutRef:CHECKOUT})
  expect(await row(f,id)).toMatchObject({blocksUntil:0,reason:"erasure_requested"})
  expect((await row(f,id))?.rawBody).toBeUndefined()
  vi.setSystemTime(NOW+1800001);await f.t.mutation(purge,{})
  expect((await row(f,id))?.privatePurgedAt).toBeDefined()
  expect(p.sent.filter(s=>JSON.parse(s.raw).command==="payment.start")).toHaveLength(0)
 })
})

describe("CM-10 — boutique en pause : nouvelle préparation refusée, engagements en cours intacts",()=>{
 const DAY=86_400_000
 async function pause(f:Fixture,until=NOW+DAY){await f.t.run(async ctx=>ctx.db.patch(f.shopId,{pausedUntil:until}))}
 async function caught(work:Promise<unknown>){try{await work;return null}catch(error){return error}}
 async function attempts(f:Fixture){return await f.t.run(async ctx=>ctx.db.query("checkoutAttempts").withIndex("by_person_network",q=>q.eq("personId",f.personId).eq("networkId",f.root)).take(5))}
 it("refuse une nouvelle préparation en disant la réouverture, sans tentative ni commande envoyée",async()=>{
  const f=await ready(),p=peer();await pause(f)
  expect(engineErrorRule(await caught(f.as.action(prepare,intent(f))))).toEqual({rule:"SHOP_PAUSED",params:{until:NOW+DAY}})
  expect(p.sent.some(s=>s.path==="/commerce/v1/commands")).toBe(false)
  expect(await attempts(f)).toEqual([])
 })
 it("à l'échéance, la boutique rouvre seule : la préparation passe, sans écriture de réouverture",async()=>{
  const f=await ready();peer();await pause(f,NOW+60_000)
  vi.setSystemTime(NOW+60_000)
  expect((await f.as.action(prepare,intent(f))).outcome).toBe("attempt")
  expect((await f.t.run(async ctx=>ctx.db.get(f.shopId)))?.pausedUntil).toBe(NOW+60_000)
 })
 it("une préparation déjà envoyée quand la pause tombe suit son cours jusqu'à la réserve tenue",async()=>{
  const f=await ready(),p=peer();p.before(async()=>{await pause(f)})
  const result=await f.as.action(prepare,intent(f))
  expect(result.outcome).toBe("attempt")
  if(result.outcome!=="attempt")return
  expect(await f.as.query(get,{networkId:f.root,attemptId:result.attemptId})).toMatchObject({state:"held"})
 })
 it("pendant la pause, une préparation engagée avant se rejoue, se relit et se libère",async()=>{
  const f=await ready(),p=peer(),id=await start(f);await pause(f)
  expect(await f.as.action(prepare,intent(f))).toEqual({outcome:"attempt",attemptId:id})
  expect((await f.as.action(status,{networkId:f.root,attemptId:id})).outcome).toBe("attempt")
  expect((await f.as.action(release,{networkId:f.root,attemptId:id})).outcome).toBe("attempt")
  expect(await row(f,id)).toMatchObject({state:"released"})
  expect(p.sent.filter(s=>JSON.parse(s.raw).command==="checkout.prepare")).toHaveLength(1)
 })
 it("pendant la pause, la reconfirmation d'un total changé reste possible : elle poursuit l'engagement",async()=>{
  const f=await ready(),p=peer();p.setFee(500);const id=await start(f);await pause(f)
  const result=await f.as.action(reconfirm,{networkId:f.root,attemptId:id,consentTextVersion:COMMERCE_CHECKOUT_CONSENT_VERSION,clientRequestId:"reconfirm-paused-0002",acceptedTotal:{amount:12500,currency:"XAF"}})
  expect(result.outcome).toBe("attempt")
  expect(await row(f,id)).toMatchObject({state:"released",reconfirmedByAttemptId:result.outcome==="attempt"?result.attemptId:"missing"})
 })
})
