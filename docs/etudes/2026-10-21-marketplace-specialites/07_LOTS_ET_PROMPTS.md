# 07 — Lots, dépendances et prompts d’implémentation

**Plan approuvé le 21 octobre 2026 · Exécution séquentielle autorisée ; progression et preuves dans EXECUTION.md.**

Les préfixes MP distinguent ce chantier des lots P00–P19 et U01–U08. Ils complètent l’existant sans le recommencer. Chaque lot se termine par un résultat branché dans l’application réelle, son rapport et ses contrôles appropriés ; une liste de fichiers ou une maquette isolée ne vaut pas livraison.

## 1. Ordre de réalisation

| Lot | Résultat attendu | Dépendances | Responsabilité principale | Ampleur indicative |
|---|---|---|---|---|
| MP00 | État de référence, décisions, contrats et garde des capacités | Validation du dossier | Coordination ANTSIA/PRO.GA | M |
| MP01 | Navigation des espaces spécialisés et retour social responsive | MP00 | ANTSIA, coques/routes | M |
| MP02 | Création d’activité et capacités de page graduées | MP00–MP01 | ANTSIA pages/shops ; liaison PRO.GA | L, en tranches |
| MP03 | Taxonomie, attributs et index public de recherche | MP00 | PRO.GA catalogue + projections ANTSIA | L, en tranches |
| MP04 | Marketplace générale et filtres exhaustifs | MP01–MP03 | ANTSIA découverte/catalogue | M |
| MP05 | Boutique professionnelle, variantes et paniers par vendeur | MP02–MP04 | ANTSIA shops/cart ; stock PRO.GA | L, en tranches |
| MP06 | Espace prestataire et parcours de services | MP02–MP04 | ANTSIA services ; devis/agenda PRO.GA | L, en tranches |
| MP07 | Configuration marchande et pipeline financier commun | MP00, MP02–MP03 | PRO.GA payments ; ANTSIA checkout | L |
| MP08 | Adaptateurs Airtel/Moov/carte et PayPal conditionnel | MP07 + éligibilités externes | PRO.GA payments/intégrations | Sous-lot par rail |
| MP09 | Réseau et profils professionnels volontaires | MP00–MP01 | ANTSIA personnes/professionnels | M |
| MP10 | Admission et profils privés de rencontres adultes | MP00–MP01 + décision de majorité | ANTSIA module dédié | L |
| MP11 | Intérêts réciproques et communication personnelle admise | MP10 | ANTSIA rencontres/iCom/modération | L |
| MP12 | Modèle éditorial, rôles et circuit rédactionnel | MP00–MP02 | ANTSIA pages/editorial | L, en tranches |
| MP13 | Sites médias publics et interaction sociale des articles | MP01, MP12 | ANTSIA editorial/public/social | M |
| MP14 | Recette intégrée, pilote et ouverture par capacité | Lots concernés réellement prêts | ANTSIA/PRO.GA/exploitation | M + délais externes |

S/M/L indiquent une complexité relative, pas une durée promise. Les délais de contrats, admissions marchandes et preuve de majorité ne sont pas estimés comme du temps de développement.

Priorité recommandée : **socle de navigation → marketplace/boutiques/services → paiements qualifiés → professionnel/presse → personnel après admission adaptée**. Le professionnel et la presse peuvent avancer en parallèle du travail de qualification financière après les fondations communes.

~~~mermaid
flowchart LR
    MP00 --> MP01
    MP01 --> MP02
    MP00 --> MP03
    MP02 --> MP04
    MP03 --> MP04
    MP04 --> MP05
    MP04 --> MP06
    MP02 --> MP07
    MP03 --> MP07
    MP07 --> MP08
    MP01 --> MP09
    MP01 --> MP10
    MP10 --> MP11
    MP02 --> MP12
    MP12 --> MP13
    MP05 --> MP14
    MP06 --> MP14
    MP08 --> MP14
    MP09 --> MP14
    MP11 --> MP14
    MP13 --> MP14
~~~

Le graphe montre la clôture complète ; une ouverture partielle de MP14 peut concerner seulement les capacités prêtes et ne prétend pas terminer les branches encore fermées.

## 2. Frontières entre sessions

- Dans ANTSIA : implémenter dans les vrais sources ; aucun worktree, fork de composant non raccordé ou HTML de démonstration remplaçant l’app.
- Dans PRO.GA : lire ses instructions et réserver la tranche avant toute édition.
- Fichiers centraux (schéma, catalogue de dépendances, routes, i18n, registres et contrats) : un seul responsable d’intégration à la fois.
- Préserver DIASPORALE, ses modules, thèmes et locales ; les capacités nouvelles de coque sont opt-in ANTSIA.
- Réserver précisément les fichiers/sous-lots dans le contexte partagé Obsidian. Ne pas changer de branche dans un arbre où l’autre session travaille.
- Avant commit/publication, comparer les sources et n’inclure que les hunks attribués au lot. Pas de staging global, de restauration ou de réécriture des changements voisins.
- Les publications futures doivent conserver /demo, les variantes de backend, la garde de déconnexion et les derniers correctifs publiés ; refuser une promotion si la référence publique a changé en parallèle.

## 3. Préambule commun à tous les prompts

À utiliser **après validation**, pour un seul lot ou sous-lot borné :

> Lire ce dossier, les instructions du dépôt et les rapports P/U concernés. Confronter les constats au code et à Git ; ne pas présenter l’inventaire daté comme une recette. Réserver les fichiers du lot dans la mémoire partagée. Réutiliser les modules existants, brancher le résultat dans l’application réelle et préserver les changements concurrents. Garder networkId, droits serveur, refus indistinct, garde des fichiers, débit, i18n FR/EN et inventaires d’export/effacement. Aucun client Convex croisé, aucun double maître commercial. Une capacité non prête reste fermée avec un état honnête. Exécuter les contrôles appropriés aux changements selon les instructions du dépôt, avec génération préalable lorsque requise et sans concurrence de déploiements Convex. Rapporter sources, contrôles exécutés, résultat, limites et activation séparément. Ne pas ouvrir les fonds réels ou une spécialité sous condition externe sans ses preuves de mise en service.

Le propriétaire a approuvé l'exécution séquentielle MP00–MP14 le 21 octobre 2026. Les limites d'activation de ce préambule restent applicables.

## 4. Prompts prêts pour le relais

### MP00 — Référence et décisions

**Prompt :** « Établis la référence de ce chantier : inventorie schémas, routes, contrats et capacités réellement présents dans ANTSIA et PRO.GA ; relève les différences entre arbre partagé et versions publiées. Transforme les propositions validées A01–A10 en décisions traçables. Réserve les modules, versions de DTO, compatibilité des anciens liens, critères d’admission et matrices de droits. Définis les données et bornes de recherche ainsi que les scénarios de reprise. Conserve fermées les activations non prouvées. »

**Sortie :** owner map, ADR au numéro disponible, contrats proposés/migrations additives et registre des décisions externes. Aucun remplacement global des anciennes gardes.

### MP01 — Coques spécialisées

**Prompt :** « Implémente le contexte d’espace spécialisé et son retour social dans les routes/coques ANTSIA existantes. Préserve la session, les providers persistants, les appels et brouillons. Ajoute les compositions téléphone/tablette/ordinateur et la navigation métier sans double barre basse. Réutilise les jetons des sept chartes. Un lien direct et un retour après connexion doivent avoir des replis sûrs. »

**Propriété :** routes et coques ANTSIA ; extensions partagées seulement opt-in.  
**Sortie :** un parcours branché fil → espace → retour même contenu, clavier compris, sans modifier les autres réseaux.

### MP02 — Créer et configurer son activité

**Prompt :** « Fais évoluer startShop et l’assistant existant pour une activité à capacités produits/services/média. Sépare préparer, publier et encaisser ; traite le cas page existante et celui d’une nouvelle page commerciale par une politique ciblée. Ne desserre pas createPage pour les institutions. Ajoute prévisualisation responsive, gestion des blocs et états de liaison PRO.GA. La liaison garde preuve, scopes et révocation. »

**Découpage :** MP02a modèle/politique ; MP02b assistant et tableau de bord.  
**Sortie :** brouillon reprenable, page unique, permissions relues, absence de badge ou de mandat inventé.

### MP03 — Catalogue et facettes

**Prompt :** « Étends les contrats catalogue PRO.GA avec taxonomie, attributs typés, collections et axes de variantes nécessaires aux métiers retenus. Transporte ces projections de façon versionnée et rétractable ; prépare un index public borné, couvrant les offres admissibles. Définis les filtres, tris, curseurs et transitions de révision. Les prix/variants/stocks restent maîtres dans PRO.GA. »

**Découpage :** MP03a DTO/fixtures jumelles ; MP03b production/transport ; MP03c index et requêtes ANTSIA.  
**Sortie :** recherche au-delà d’une fenêtre récente, retrait cohérent, requêtes bornées et absence de fuite par résultats ou facettes.

### MP04 — Marketplace générale

**Prompt :** « Ajoute /marketplace et ses entrées depuis Explorer/rail, avec Produits, Boutiques et Services. Utilise les requêtes indexées MP03 : recherche, filtres métier, tri, pagination et états complets. Conserve filtres et position lors des détails/retours. Ne présente pas une sélection de boutiques comme un catalogue exhaustif. »

**Sortie :** destinations réellement raccordées et recette de recherche au-delà de la première page aux trois formats.

### MP05 — Boutique et achat

**Prompt :** « Transforme les vitrines existantes en sites de boutique : accueil marchand, rayons, collections, catalogue et informations de remise/retour. Ajoute une sélection progressive des variantes réelles. Conserve des paniers isolés par personne/réseau/vendeur tout en gardant chaque checkout mono-vendeur. Rends les CTA publics prévus, restaure leur intention après connexion et relis prix/stock/frais dans PRO.GA avant accord. »

**Découpage :** MP05a devanture ; MP05b variantes/paniers ; MP05c préparation/suivi et CTA publics.  
**Sortie :** parcours mode complet, changement de boutique sans perte silencieuse de panier, dernier article sous concurrence.

### MP06 — Services

**Prompt :** « Fais évoluer l’annuaire et les espaces prestataires avec les modèles devis/rendez-vous/forfait, portfolio et filtres adaptés. Réutilise les intentions et reprises P14, le canal commercial P10 et les avis de suivi existants. Traite devis remplacé, créneau concurrent, retrait d’offre et perte de réponse. Le paiement service reste fermé tant que son contrat et sa readiness dédiés ne sont pas validés. »

**Découpage :** MP06a annuaire/espace ; MP06b devis ; MP06c agenda/forfait/reprise ; MP06d admission financière service, après MP07/MP08 concernés.  
**Sortie :** vraie demande et suivi autorisé, pas seulement une carte ou un calendrier fictif.

### MP07 — Configuration et cœur financier

**Prompt :** « Raccorde l’assistant marchand ANTSIA aux capacités et comptes autorisés par PRO.GA. Complète le pipeline P12 en conservant ses garde-fous : bénéficiaire, version de politique, accord, intention idempotente, reprise par consultation et preuves rapprochées. Sépare collecte, allocation, réception, remboursement et reversement. Affiche les modalités réellement admises et les étapes manquantes. »

**Sortie :** matrice pays/devise/entité/rail, configuration serveur, états cohérents et scénarios simulés ; aucun fournisseur disponible par simple sélection de logo.

### MP08 — Un connecteur financier à la fois

**Prompt :** « Implémente uniquement le rail nommé et contractuellement qualifié : Airtel Money, Moov Money, carte ou PayPal sous conditions. Adapte initier/consulter/notification/rembourser aux capacités prouvées. Sépare sandbox/production et encaissement/reversement. Vérifie signature ou preuve serveur, montant, devise, marchand et anti-rejeu. Fais les recettes sandbox, sans transaction réelle implicite. »

**Découpage :** MP08a qualification ; MP08b Airtel/Moov, connecteurs distincts ; MP08c carte ; MP08d PayPal si éligible ; MP08e reversements selon contrat admis.  
**Sortie :** preuve par rail, dont refus, délai, retour sans notification, doublon, remboursement et bénéficiaire erroné. Un rail non éligible reste masqué.

### MP09 — Professionnels

**Prompt :** « Ajoute un profil professionnel volontaire et une découverte de compétences/activités. Réutilise identité, facettes et demandes de mise en relation sans exposer les talents DIASPORALE. Ajoute portfolio, disponibilité, choix de visibilité et propositions de collaboration. Différencie qualification déclarée, vérification et mandat d’activité. »

**Sortie :** parcours de collaboration distinct de la vente et du personnel, avec contrôle des champs visibles et des invitations.

### MP10 — Admission des rencontres personnelles

**Prompt :** « Implémente la participation et le profil privés de rencontres personnelles, après validation du mécanisme de majorité et des règles de données. Sépare tables/index/permissions du professionnel. Aucun profil automatique, aucune déduction depuis les achats ou le graphe ; garde de fichiers et consentements dédiés. Ajoute pause, retrait, export et effacement. »

**Découpage :** MP10a admission/preuve ; MP10b profil/visibilité/effacement.  
**Sortie :** refus non admis/mineur/non prouvé, absence de découverte publique et retrait immédiat des suggestions.

### MP11 — Affinités et conversation

**Prompt :** « Ajoute intérêt privé, passer, réciprocité atomique et contact admis sous une source fermée reconnue par iCom. Les appels restent soumis aux consentements et gardes. Un suivi social, commercial ou professionnel ne crée aucun accès personnel. Applique blocage, quotas, signalement et retrait dans toutes les branches. »

**Sortie :** une seule correspondance sous concurrence, aucun contact unilatéral et aucune fuite de refus ou de préférence d’autrui.

### MP12 — Rédaction

**Prompt :** « Ajoute au média des articles structurés, rubriques, habilitations éditoriales et états brouillon/relecture/validation/publication. Préserve la version publiée pendant les révisions, vérifie les droits des tâches programmées, protège les éditions concurrentes et trace les corrections. Les brouillons et preuves internes restent privés. »

**Découpage :** MP12a modèle/permissions ; MP12b éditeur/workflow/programmation.  
**Sortie :** auteur et responsable de publication ont des pouvoirs réellement distincts, versions préservées et médias sous garde.

### MP13 — Site média et réseau social

**Prompt :** « Construis la une, les rubriques et articles du média, responsive, avec une projection publique éditoriale dédiée. Garde intacte la porte des pages officielles. Raccorde les aperçus sociaux par référence, les commentaires et le retour au post d’origine. Gère URL canonique, correction, retrait et suppression des aperçus obsolètes. »

**Sortie :** média professionnel lisible publiquement selon consentement, article accessible et partageable, aucun brouillon indexé.

### MP14 — Vérifier et ouvrir les capacités prêtes

**Prompt :** « Fige les candidats issus des lots terminés en préservant les sources concurrentes et les variantes démo/production. Exécute les contrôles requis et la matrice de recette. Documente l’admission des prestataires, de chaque vendeur et de la majorité pour les capacités concernées. Ouvre un pilote par capacité après ses preuves, conserve le retour arrière et le suivi des engagements. Ne déclare pas livrées les branches restées fermées. »

**Sortie :** dossier de décision, versions précises, recettes et limites ; publication uniquement dans le périmètre validé.

## 5. Recette intégrée prévue après implémentation

| Parcours | Cas nominal | Cas de rupture |
|---|---|---|
| Navigation | Post → boutique/service/article → retour au même contenu | Retour après connexion, contexte expiré, contenu retiré |
| Produits | Mode, filtres, variante, panier et préparation | Dernière unité concurrente, prix changé, variante supprimée |
| Multi-boutiques | Paniers conservés et commandes séparées | Changement de personne ou de réseau |
| Services | Devis, forfait et rendez-vous confirmés | Devis révisé, créneau perdu, réponse incertaine |
| Paiement | Uniquement moyen admis, preuve et suivi | Faux callback, doublon, délai, mauvais bénéficiaire, remboursement |
| Professionnel | Profil volontaire et collaboration | Invitation refusée, qualification non prouvée, révocation |
| Personnel | Admission adulte, réciprocité et contact | Non admis, blocage, pause, fuite de préférences |
| Presse | Relecture, publication, correction et aperçu social | Droits révoqués, édition concurrente, retrait/média fermé |
| Commun | Langue, thème, clavier et session stable | Perte réseau, reconnexion, stockage démo/réel séparé |

Formats : 390×844,834×1112,1440×1000 ; ajouter320px/paysage, clair/sombre et contrôle des chartes existantes. Web et appareils physiques sont consignés séparément. Pour le natif : prévoir navigation spécialisée, liens profonds et retours PSP dans une tranche annoncée, puis recette iOS/Android propre.

Scénarios de données : boutique mode avec variantes, artisan avec collections, activité produits+services, prestataire sur rendez-vous, expert au forfait, média avec rédaction ; profils fictifs professionnels et adultes consentants pour le personnel. Aucune création réelle, message, acceptation de contrat ou paiement n’est autorisé par la rédaction de cette matrice.

## 6. Mesures et seuils de recette

Cibles proposées, **aucun résultat observé** :
- 100 % des scénarios critiques de droits, idempotence, retrait et paiement avant ouverture ;
- 100 % des retours sociaux de recette restaurent le contenu d’origine encore accessible ;
- au moins4participants sur5 réalisent sans aide les tâches principales retenues pour un pilote d’utilisabilité ;
- aucune capacité affichée « Disponible » sans ses prérequis techniques et commerciaux ;
- aucun débordement à320px, action centrale accessible au clavier et focus restauré après panneau ;
- budgets de recherche, de requêtes et de rendu fixés à MP00 sur une charge et un profil réseau documentés, puis mesurés sur candidats précis.

Mesurer par finalité et avec consentement ; aucun suivi de préférences sentimentales ou de contenu de conversations dans les outils de mesure.
