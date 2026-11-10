# MP03 — Contrat et recherche catalogue

Décision d'implémentation du plan approuvé, 21 octobre 2026.

## Compatibilité

Conserver `PRO-COMMERCE-PUBLIC-V1` inchangé pour ses lecteurs et ses destinations. Ajouter `PRO-COMMERCE-PUBLIC-V2`, profil émetteur `antsia-commerce-public-v2`, accepté seulement lorsque la destination et l'émetteur le déclarent. La version de l'enveloppe reste **1** ; les révisions métier/disponibilité restent indépendantes. Pas de modification des paramètres de production ni de bascule implicite des destinataires.

Les offres V2 peuvent porter `facets` ; V1 refuse toujours ce champ. Les deux contrats gardent les mêmes événements, protections de parent, médias, consentements et retraits. Une offre V2 sans classement demeure consultable. La configuration de présentation MP02 ne devient pas une autorité catalogue.

## Facettes v1

Objet fermé `CommerceCatalogFacets` :

```ts
type CommerceCatalogFacets = {
  taxonomyVersion: 1
  categoryPath: string[] //1–3 clés du registre, chemin parent→enfant exact
  attributes: CommerceCatalogAttribute[] //0–8, clés uniques
}
```

Registre partagé versionné, traduit par l'interface :

- `fashion` → `fashion.women`, `fashion.men`, `fashion.kids`, `fashion.accessories` ; femmes/hommes/enfants → clothing/shoes/bags ; accessoires → bags/jewelry.
- `food` → food.groceries, food.beverages, food.prepared.
- `craft` → craft.home, craft.bags, craft.accessories.
- `electronics` → electronics.computers, electronics.phones, electronics.accessories.
- `beauty` → beauty.care, beauty.fragrance.
- `home` → home.decor, home.equipment.
- `services` → services.digital, services.creative, services.home, services.wellness, services.events, services.consulting.

Les branches produits refusent une offre service, et inversement. Les collections gardent leurs références et ne deviennent pas implicitement des catégories.

Attributs fermés : `{ key, type, value }`.

| Clé | Type | Valeur |
|---|---|---|
| brand, material, color | text | NFC, espaces normalisés,1–80caractères, aucun contrôle |
| audience | choice | women, men, kids, unisex |
| serviceMode | choice | onsite, remote, hybrid |
| durationMinutes | number | entier1–43200 |
| ecoLabel | boolean | déclaration du vendeur, aucune certification calculée |

Prix, stocks, SKU et identifiants privés exclus. Couleurs/tailles des variantes restent dans leurs axes canoniques existants.

## Producteur

PRO.GA conserve les facettes facultatives sur le brouillon et son snapshot publié. Les mutations relisent tâches/tenant/structure et valident le contrat. La publication humaine crée le snapshot ; aucun champ de brouillon ne fuit dans une offre déjà publiée. Fingerprint et nouvelles révisions incluent les facettes en V2. V1 les omet explicitement ; ses octets restent conformes.

Les modules jumeaux sont maintenus octet pour octet et leurs fixtures/manifestes évoluent ensemble. Les cas V1 sont conservés en plus des cas V2.

## Index ANTSIA

Matérialiser uniquement depuis les événements validés dans les têtes existantes : texte, catégorie par profondeur, attributs de recherche allowlistés, prix de tri croissant/décroissant, version d'index. Les retraits n'ont plus de champs indexables actifs. Relire mapping, parent, consentement, modération, réseau et médias avant toute projection.

Backfill par tranches avec état/génération et curseur ; une construction incomplète n'est pas annoncée exhaustive. Les anciennes vitrines restent lisibles. Les lignes nouvelles sont indexées à l'import ; une tâche ancienne ne valide pas une génération récente. Aucun contenu collectif dans l'export personnel.

Recherche :120caractères,24résultats maximum,128candidats/1Mio maximum par fenêtre. Filtres type/catégorie/attributs/prix avant pagination ; les gardes courantes peuvent encore vider une page, avec continuation conservée. Texte : pertinence du moteur, sans promesse de tri prix sur du fulltext. Sans texte : date/prix réel. Aucun comptage de facettes depuis une seule fenêtre.

Les offres fictives gardent leurs portes et schémas dédiés ; une vraie projection de PRO.GA reste prioritaire. Aucun moyen de commande réel ajouté à la démo.

## Raccords de compatibilité contrôlés

Les consommateurs d'un snapshot PRO.GA (préparation produit, demande service, reprise et parent emploi) relisent son contrat depuis sa destination serveur immuable, corrélée au tenant. Aucune tentative de parse V1 par défaut sur un snapshot V2. Une métadonnée absente ou incohérente ferme la capacité.

Le profil de destination catalogue V2 accepte également le contrat indépendant JOBS-V1 existant, sous ses mêmes consentements, scopes et permissions. Le profil de transport ne transforme pas JOBS-V1 en PUBLIC-V2 ; l'outbox et le destinataire vérifient chacun le contrat exact. Aucune destination ni politique en production n'est migrée.

Un snapshot de confirmation à révision/contenu inchangés met à jour sa preuve de contrat reçue ; révoquer V1 après confirmation V2 ne laisse pas une tête artificiellement attachée à l'ancien contrat. Toutes les lectures (y compris la disponibilité indicative) recontrôlent leur propre contrat exact.

MP04 ajoute les facettes multivaluées (maximum6choix par facette) : OU dans une facette, ET entre facettes, normalisation/déduplication/tri avant empreinte du curseur. Recherche texte limitée à16termes et120caractères ; aucune exception moteur liée à un texte trop long n'est présentée comme zéro résultat.
