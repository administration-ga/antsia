/**
 * Copie serveur bornée des seuls assets du catalogue fermé de la démonstration.
 * L'opérateur (script du propriétaire, clé de déploiement de la démo) transmet les octets
 * du dépôt ; le serveur n'accepte que ceux dont la taille et l'empreinte figurent au
 * manifeste, pour une cible qu'il a lui-même planifiée. Aucune URL n'est suivie.
 */
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { internalAction } from "../_generated/server"
import { assertDemoContentAllowed } from "./demoContentConfig"
import { demoMediaAsset } from "./demoMediaManifest"

type MediaTarget = { key:string; kind:"post"|"story"|"page_banner"|"person_cover"|"person_avatar"; ownerHandle:string; asset:string; file:string; targetId:string|null; caption:string|null; attached:boolean }
const targetsRef = makeFunctionReference<"query", {confirmNonProduction:string}, MediaTarget[]>("seeds/demoContent:mediaTargets")
const attachRef = makeFunctionReference<"mutation", {confirmNonProduction:string;key:string;storageId:string;asset:string}, {attached:boolean}>("seeds/demoContent:attachMedia")

const MAX_ASSET_BYTES = 8*1024*1024

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("Encodage de l'illustration refusé.")
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export const storeAsset = internalAction({
  args: { confirmNonProduction:v.string(), key:v.string(), dataBase64:v.string() },
  returns: v.object({ attached:v.boolean() }),
  handler: async (ctx,args):Promise<{attached:boolean}> => {
    assertDemoContentAllowed(args.confirmNonProduction)
    const target = (await ctx.runQuery(targetsRef,{confirmNonProduction:args.confirmNonProduction})).find(item=>item.key===args.key)
    if (!target) throw new Error("Cible d'illustration inconnue.")
    if (target.attached) return {attached:false}
    const asset = demoMediaAsset(target.asset)
    if (!asset || asset.bytes > MAX_ASSET_BYTES || !/^[a-z0-9-]+\.(png|jpg)$/.test(asset.filename)) throw new Error("Illustration inconnue.")
    // Borne AVANT décodage : quatre caractères pour trois octets.
    if (args.dataBase64.length !== Math.ceil(asset.bytes/3)*4) throw new Error("Taille de l'illustration incohérente.")
    const bytes = decodeBase64(args.dataBase64)
    if (bytes.byteLength !== asset.bytes) throw new Error("Taille de l'illustration incohérente.")
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))
    const digest = Array.from(hash,n=>n.toString(16).padStart(2,"0")).join("")
    if (digest !== asset.sha256) throw new Error("Empreinte de l'illustration refusée.")
    // Le serveur écrit lui-même ces octets immuables, jamais un storageId fourni par un client.
    const storageId = await ctx.storage.store(new Blob([bytes],{type:asset.mimeType}))
    const result = await ctx.runMutation(attachRef,{confirmNonProduction:args.confirmNonProduction,key:target.key,asset:target.asset,storageId})
    // Une autre exécution a pu gagner la course ; seule notre copie neuve et non rattachée est supprimée.
    if (!result.attached) await ctx.storage.delete(storageId)
    return {attached:result.attached}
  },
})
