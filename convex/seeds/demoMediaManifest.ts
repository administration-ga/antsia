/** Assets de démonstration produits par la plateforme ; empreintes vérifiées avant toute inscription serveur. */
import { DEMO_PHOTO_COLLECTION, DEMO_PHOTO_MANIFEST } from "./demoPhotoManifest"

export const DEMO_MEDIA_MANIFEST: Record<string, {filename:string;sha256:string;width:number;height:number;bytes:number;mimeType:"image/png";altText:string}> = {
  "epicerie-produits": {
    "filename": "epicerie-produits.png",
    "sha256": "956983f08efb01e18b05f834763df1041c900fce880cdc19f9dc1f3543b90368",
    "width": 1254,
    "height": 1254,
    "bytes": 2196946,
    "mimeType": "image/png",
    "altText": "Bouteilles sans étiquette de bissap et de gingembre, confiture d’ananas et fruits sur un fond beige. Illustration de démonstration générée par IA."
  },
  "panier-raphia": {
    "filename": "panier-raphia.png",
    "sha256": "33091c98363e9c6107eabccd029430be62f9c4fd1e26e98cc05876cdbd45d2c6",
    "width": 1254,
    "height": 1254,
    "bytes": 2703547,
    "mimeType": "image/png",
    "altText": "Panier à anses en raphia tressé aux fibres naturelles sur un fond crème. Illustration de démonstration générée par IA."
  },
  "savon-artisanal": {
    "filename": "savon-artisanal.png",
    "sha256": "fe070733adf9cd25943098865cdd8fda25c346d4aae86514af7c73ac8b2e45b1",
    "width": 1254,
    "height": 1254,
    "bytes": 2164855,
    "mimeType": "image/png",
    "altText": "Trois savons artisanaux au karité avec des feuilles et une ficelle sur une surface crème. Illustration de démonstration générée par IA."
  },
  "sac-wax": {
    "filename": "sac-wax.png",
    "sha256": "b378054dae705e0f64bff68b4e2e3aa73d62380c74734b8cfba028268e4b3d83",
    "width": 1254,
    "height": 1254,
    "bytes": 2599368,
    "mimeType": "image/png",
    "altText": "Sac cabas artisanal en tissu wax bleu, jaune et vert sur un fond neutre. Illustration de démonstration générée par IA."
  },
  "service-photo": {
    "filename": "service-photo.png",
    "sha256": "ac669b5f7c2cd8e5ee1b75d5032329fb663a7daf4b27330010fe4d331db7bfdd",
    "width": 1536,
    "height": 1024,
    "bytes": 2174466,
    "mimeType": "image/png",
    "altText": "Photographe gabonaise adulte réalisant le portrait d’une autre personne adulte dans un studio lumineux. Illustration de démonstration générée par IA."
  },
  "service-informatique": {
    "filename": "service-informatique.png",
    "sha256": "08bf513dd3fb7c2b0bd5109e5da366df3b7cf4e0256df578941a87db42688c4e",
    "width": 1536,
    "height": 1024,
    "bytes": 2208829,
    "mimeType": "image/png",
    "altText": "Technicien gabonais adulte réparant un ordinateur portable sur un établi propre et bien éclairé. Illustration de démonstration générée par IA."
  },
  "association-lecture": {
    "filename": "association-lecture.png",
    "sha256": "aa617162d7529ca509679c5b8e195c38257d7335185e2076a820357de279fcda",
    "width": 1536,
    "height": 1024,
    "bytes": 2329446,
    "mimeType": "image/png",
    "altText": "Adultes gabonais réunis pour un atelier de lecture et d’entraide dans une bibliothèque claire avec des plantes. Illustration de démonstration générée par IA."
  },
  "association-littoral": {
    "filename": "association-littoral.png",
    "sha256": "8337f7426a2023b6a9333f4b30fcb1cab5398c42e8c6ca9275dd1ecfe6c15a9e",
    "width": 1536,
    "height": 1024,
    "bytes": 2956404,
    "mimeType": "image/png",
    "altText": "Groupe d’adultes gabonais participant au ramassage de déchets sur une plage tropicale verdoyante. Illustration de démonstration générée par IA."
  }
}

/** Dossier public des illustrations générées (`apps/antsia_ga/public/demo-media/<collection>`). */
export const DEMO_ILLUSTRATION_COLLECTION = "animation-20261020"

export type DemoMediaAsset = { collection: string; filename: string; sha256: string; width: number; height: number; bytes: number; mimeType: "image/png" | "image/jpeg"; altText: string }

/** Un asset du catalogue fermé (illustration générée ou photo libre), jamais une clé héritée de l'objet. */
export function demoMediaAsset(slug: string): DemoMediaAsset | null {
  const illustration = Object.prototype.hasOwnProperty.call(DEMO_MEDIA_MANIFEST, slug) ? DEMO_MEDIA_MANIFEST[slug] : undefined
  if (illustration) return { ...illustration, collection: DEMO_ILLUSTRATION_COLLECTION }
  const photo = Object.prototype.hasOwnProperty.call(DEMO_PHOTO_MANIFEST, slug) ? DEMO_PHOTO_MANIFEST[slug] : undefined
  return photo ? { ...photo, mimeType: "image/jpeg", collection: DEMO_PHOTO_COLLECTION } : null
}
