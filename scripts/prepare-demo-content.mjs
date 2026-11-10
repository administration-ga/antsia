/**
 * Initialise les vrais comptes OTP de démonstration, sans secrets écrits ni identité injectée.
 * Usage : bun scripts/prepare-demo-content.mjs --target local|demo [--apply]
 * Les sept acteurs de l'écran de connexion, puis les dix figurants (absents de cet écran).
 */
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { fileURLToPath } from "node:url"

/** La démo vit sous /demo du site principal : son authentification aussi. */
export function targetConfiguration(target) {
  if (target === "local") return {origin:"http://localhost:3030",auth:"http://localhost:3030/api/auth",backend:"http://127.0.0.1:3210"}
  if (target === "demo") return {origin:"https://antsia.vercel.app",auth:"https://antsia.vercel.app/demo/api/auth",backend:"https://vivid-hedgehog-655.convex.cloud"}
  throw new Error("Choisir explicitement --target local ou demo.")
}
const ref = (name)=>makeFunctionReference(name)
const demoHandles = {
  membre:"membre.demo",verifie:"verifie.demo",nouveau:null,presse:"presse.demo",
  commercant:"commercant.demo",association:"association.demo",administration:"administration.demo",moderateur:"moderation.demo",
}
const FIGURANT_COUNT = 10
const profileComplete = profile=>profile && typeof profile==="object" && !Array.isArray(profile)
  && ["displayName","headline"].every(key=>typeof profile[key]==="string" && profile[key].trim().length>0)
function validCatalogue(accounts) {
  return Array.isArray(accounts) && accounts.length===8
    && accounts.every(account=>{
      if (!account || !Object.hasOwn(demoHandles,account.actor) || account.email!==`${account.actor}@demo.antsia.test`) return false
      if (account.actor==="nouveau") return account.profile===null
      return profileComplete(account.profile) && account.profile.handle===demoHandles[account.actor]
    })
    && new Set(accounts.map(account=>account.actor)).size===8
}
function validFigurants(figurants) {
  return Array.isArray(figurants) && figurants.length===FIGURANT_COUNT
    && figurants.every(figurant=>figurant && Number.isInteger(figurant.slot) && figurant.slot>=1 && figurant.slot<=FIGURANT_COUNT
      && figurant.email===`figurant-${figurant.slot}@demo.antsia.test`
      && profileComplete(figurant.profile) && typeof figurant.profile.handle==="string" && /^[a-z0-9.]+\.demo$/.test(figurant.profile.handle))
    && new Set(figurants.map(figurant=>figurant.slot)).size===FIGURANT_COUNT
}

/** Le vrai parcours : code envoyé, lu par l'outil de démonstration, session puis jeton du moteur. */
async function signIn(config,convex,email) {
  const auth=async (path,body,sessionToken) => {
    const response=await fetch(new URL(config.auth+path),{
      method:body===undefined?"GET":"POST",redirect:"error",
      headers:{"Content-Type":"application/json",Origin:config.origin,...(sessionToken?{Authorization:`Bearer ${sessionToken}`}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    })
    if (!response.ok) throw new Error(`Authentification de démonstration refusée (${path}, ${response.status}).`)
    return await response.json()
  }
  await auth("/email-otp/send-verification-otp",{email,type:"sign-in"})
  let code
  for(let tries=0;tries<8;tries++) {
    const value=await convex.query(ref("modules/platform/devTools:latestOtp"),{email})
    if (value && value.expiresAt>Date.now()) {code=value.code;break}
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  if (!code) throw new Error("Code de démonstration indisponible.")
  const signed=await auth("/sign-in/email-otp",{email,otp:code})
  if (typeof signed.token!=="string") throw new Error("Session de démonstration indisponible.")
  const jwt=await auth("/convex/token",undefined,signed.token)
  if (typeof jwt.token!=="string") throw new Error("Jeton du moteur indisponible.")
  const client=new ConvexHttpClient(config.backend);client.setAuth(jwt.token)
  return client
}

/** Accueil par les vraies mutations ; un profil déjà publié sous un autre identifiant est conservé. */
async function publishProfile(client,profile) {
  await client.mutation(ref("modules/people/persons:ensureMyPerson"),{})
  const person=await client.query(ref("modules/people/persons:getMyPerson"),{})
  if (!person) throw new Error("Profil de démonstration indisponible.")
  if (!person.published) {
    if (!person.consentsInForce.includes("social_profile")) await client.mutation(ref("modules/people/consents:recordConsent"),{purpose:"social_profile",origin:"onboarding"})
    await client.mutation(ref("modules/people/preferences:setMyPreferences"),{locale:"fr",timeZone:"Africa/Libreville"})
    await client.mutation(ref("modules/people/profile:publishMyProfile"),profile)
  } else if (person.handle!==profile.handle) {
    throw new Error("Le compte fictif a changé d’identifiant ; profil conservé.")
  }
}

export async function prepareDemoAccounts(target,{apply=false,log=console.log}={}) {
  const config=targetConfiguration(target)
  const convex=new ConvexHttpClient(config.backend)
  const accounts=await convex.query(ref("modules/platform/demoAccounts:catalogue"),{})
  if (!validCatalogue(accounts)) throw new Error("Le catalogue ne confirme pas les huit comptes fictifs.")
  const active=accounts.filter(a=>a.profile!==null)
  if (!apply) return {target,actors:active.map(a=>a.actor),action:"dry-run"}
  const report=[]
  for (const account of active) {
    const client=await signIn(config,convex,account.email)
    await publishProfile(client,account.profile)
    const state=await client.mutation(ref("modules/platform/demoAccounts:equipMyDemoAccount"),{actor:account.actor})
    report.push({actor:account.actor,handle:account.profile.handle,status:state.status,role:state.role})
    log(`Compte démo prêt : ${account.actor} (${state.status})`)
  }
  return {target,accounts:report,newcomerPreserved:true}
}

export async function prepareDemoFigurants(target,{apply=false,log=console.log}={}) {
  const config=targetConfiguration(target)
  const convex=new ConvexHttpClient(config.backend)
  const figurants=await convex.query(ref("modules/platform/demoAccounts:figurantCatalogue"),{})
  if (!validFigurants(figurants)) throw new Error("Le catalogue ne confirme pas les dix figurants fictifs.")
  if (!apply) return {target,figurants:figurants.map(f=>f.slot),action:"dry-run"}
  const report=[]
  for (const figurant of figurants) {
    const client=await signIn(config,convex,figurant.email)
    await publishProfile(client,figurant.profile)
    const state=await client.mutation(ref("modules/platform/demoAccounts:equipMyDemoFigurant"),{slot:figurant.slot})
    report.push({slot:figurant.slot,handle:figurant.profile.handle,status:state.status})
    log(`Figurant prêt : ${figurant.profile.handle} (${state.status})`)
  }
  return {target,figurants:report}
}

if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const target=process.argv[process.argv.indexOf("--target")+1]
  const apply=process.argv.includes("--apply")
  prepareDemoAccounts(target,{apply})
    .then(async accounts=>({accounts,figurants:await prepareDemoFigurants(target,{apply})}))
    .then(report=>console.log(JSON.stringify(report,null,2)))
    .catch(error=>{console.error(error.message);process.exitCode=1})
}
