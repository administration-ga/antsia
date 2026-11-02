/** Projection illustrative fermée, réservée au backend local ou à la démo déclarée. */
type DemoCatalogDeclaration = { offerRef: string; shopHandle: string; kind: "product" | "service"; collectionRef: string; imagePath: string }

const illustrationRoot = "/demo-media/animation-20261020"
const photoRoot = "/demo-media/photos-20261021"
const collections = ["demo:collection:epicerie-moussavou-demo", "demo:collection:studio-objectif-demo", "demo:collection:atelier-tech-demo"] as const

/** Miroir fermé du catalogue fictif du moteur (`convex/modules/shops/demoCatalog.ts`) : 13 + 10 + 10 offres. */
export const DEMO_CATALOG_DECLARATIONS: readonly DemoCatalogDeclaration[] = [
  { offerRef: "demo:offer:epicerie-produits", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${illustrationRoot}/epicerie-produits.png` },
  { offerRef: "demo:offer:riz-parfume", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-riz.jpg` },
  { offerRef: "demo:offer:banane-plantain", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-plantains.jpg` },
  { offerRef: "demo:offer:manioc-frais", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-manioc.jpg` },
  { offerRef: "demo:offer:huile-vegetale", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-huile.jpg` },
  { offerRef: "demo:offer:poisson-fume", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-poisson-fume.jpg` },
  { offerRef: "demo:offer:arachides", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-arachides.jpg` },
  { offerRef: "demo:offer:tomates-fraiches", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-tomates.jpg` },
  { offerRef: "demo:offer:oignons-rouges", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-oignons.jpg` },
  { offerRef: "demo:offer:farine-de-ble", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-farine.jpg` },
  { offerRef: "demo:offer:ananas", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${photoRoot}/produit-ananas.jpg` },
  { offerRef: "demo:offer:savon-artisanal", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${illustrationRoot}/savon-artisanal.png` },
  { offerRef: "demo:offer:panier-raphia", shopHandle: "epicerie-moussavou-demo", kind: "product", collectionRef: collections[0], imagePath: `${illustrationRoot}/panier-raphia.png` },
  { offerRef: "demo:offer:photo-portrait", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-portrait-studio.jpg` },
  { offerRef: "demo:offer:reportage-photo", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-evenement.jpg` },
  { offerRef: "demo:offer:reportage-mariage", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-mariage.jpg` },
  { offerRef: "demo:offer:photos-produits", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-packshot.jpg` },
  { offerRef: "demo:offer:photo-identite", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-identite.jpg` },
  { offerRef: "demo:offer:seance-famille", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-famille.jpg` },
  { offerRef: "demo:offer:prises-de-vue-drone", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-drone.jpg` },
  { offerRef: "demo:offer:retouche-photo", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-retouche.jpg` },
  { offerRef: "demo:offer:location-studio", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-location-studio.jpg` },
  { offerRef: "demo:offer:tirages-photo", shopHandle: "studio-objectif-demo", kind: "service", collectionRef: collections[1], imagePath: `${photoRoot}/photo-tirages.jpg` },
  { offerRef: "demo:offer:diagnostic-informatique", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-reparation-portable.jpg` },
  { offerRef: "demo:offer:maintenance-informatique", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-montage-pc.jpg` },
  { offerRef: "demo:offer:ecran-smartphone", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-ecran-smartphone.jpg` },
  { offerRef: "demo:offer:installation-reseau", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-reseau.jpg` },
  { offerRef: "demo:offer:installation-logiciels", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-logiciels.jpg` },
  { offerRef: "demo:offer:recuperation-donnees", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-recuperation-donnees.jpg` },
  { offerRef: "demo:offer:depannage-imprimante", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-imprimante.jpg` },
  { offerRef: "demo:offer:formation-bureautique", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-formation.jpg` },
  { offerRef: "demo:offer:maintenance-serveurs", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-maintenance-serveurs.jpg` },
  { offerRef: "demo:offer:bilan-securite", shopHandle: "atelier-tech-demo", kind: "service", collectionRef: collections[2], imagePath: `${photoRoot}/info-securite.jpg` },
]

/** Aucune variable de bascule ne suffit à autoriser un autre hôte de production. */
export function demoCatalogProjectionAllowed(backendUrl: string | undefined = process.env.NEXT_PUBLIC_CONVEX_URL): boolean {
  if (!backendUrl) return false
  try {
    const url = new URL(backendUrl)
    if (backendUrl !== url.origin || url.username || url.password || url.search || url.hash) return false
    // 3260 est le port local ANTSIA quand 3210 est réservé par une autre application du poste.
    return url.protocol === "http:" && ["3210", "3260"].includes(url.port) && ["127.0.0.1", "localhost"].includes(url.hostname)
      || url.protocol === "https:" && !url.port && url.hostname === "vivid-hedgehog-655.convex.cloud"
  } catch { return false }
}

export function demoCatalogDeclaration(offerRef: string): DemoCatalogDeclaration | undefined {
  return DEMO_CATALOG_DECLARATIONS.find((declaration) => declaration.offerRef === offerRef)
}

export function isDemoCatalogOfferRef(value: string): boolean {
  return demoCatalogProjectionAllowed() && demoCatalogDeclaration(value) !== undefined
}

export function isDemoCatalogCollectionRef(value: string): boolean {
  return demoCatalogProjectionAllowed() && collections.some((collection) => collection === value)
}

/** Les illustrations des offres et des publications de démonstration (bannières, couvertures). */
const demoMediaPaths = new Set([
  ...DEMO_CATALOG_DECLARATIONS.map((declaration) => declaration.imagePath),
  ...["association-lecture", "association-littoral", "service-photo", "service-informatique", "sac-wax"].map((slug) => `${illustrationRoot}/${slug}.png`),
])

export function isDemoCatalogAssetPath(value: string): boolean {
  return demoCatalogProjectionAllowed() && demoMediaPaths.has(value)
}
