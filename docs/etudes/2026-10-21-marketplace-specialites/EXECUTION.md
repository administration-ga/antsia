# Exécution MP00–MP14

Autorisation : propriétaire, 21 octobre 2026. Ordre demandé : MP00 puis suites automatiques ; préserver l'autre session.

## Référence de départ

- Checkout partagé `codex/pa4-identite-session`, HEAD `c4d36f345707f87f20dbd970b2850c683c8581be` ; changements antérieurs conservés. État initial des fichiers ciblés et empreinte de l'index archivés hors source dans le cache du chantier.
- Santé publique relue le 21/10 : production `confidentialite-20261021-999a947c649ad78a`, démo `demo-sortie-20261021-demo-34f8d07b9ca175a6`, HTTP200. `origin/main` distant : `46b780bed977c4293ef634e920785a90fe6ba5b9`. Ces versions précèdent MP00 et ne le valident pas.
- Next3030 et Convex existants conservés ; aucune modification d'environnement.
- Réservation : dossier de ce plan, ADR0034 ; intégrations ciblées dans les coques/routes/boutiques ANTSIA. Ne pas reprendre les hunks antérieurs ni les modules DIASPORALE/events. Extensions de schéma et contrats coordonnés ici seulement.

## Lots

| Lot | État | Preuves / suite |
|---|---|---|
| MP00 | Terminé — référence documentaire | Acceptation A01–A10 dans ADR0034 ; référence, droits, contrats additifs et compatibilité dans09_REFERENCE_MP00 ; santé publique relue, aucun droit activé |
| MP01 | Sources raccordées, contrôles ciblés verts | Navigation membre/publique, reprise typée après connexion, retour réseau/personne/démo ;171tests+8cliquets et typage verts. Vitrine locale et retour Explorer observés ; recette visuelle3formats à achever (pilotage navigateur indisponible). |
| MP02 | Sources raccordées, contrôles ciblés verts | Configuration additive, capacités combinées, modèles, blocs ordonnés/masqués, aperçu téléphone/tablette/ordinateur ;35tests boutique+6données+19domaine ;224tests app puis17tests ciblés corrigés ; génération/typage/cliquets verts. Recette visuelle complète à achever. |
| MP03 | Sources raccordées, cas du lot verts ; limites globales PRO consignées | Contrat V2 opt-in/facettes, producteur/formulaire PRO et index ANTSIA. Génération et typages ANTSIA verts ;61tests backend,41domaine,45UI,18cliquets. PRO :28catalogue,15checkout,26services,9UI et cas JOBS V2 verts ; groupé99/100, un PDF historique422. Conformité jumelle6PRO/8ANTSIA ; typage UI PRO vert. Voir limites ci-dessous et10_CONTRATS_CATALOGUE_V2. |
| MP04 | Sources raccordées, contrôles ciblés et recette locale verts | Marketplace3vues, facettes OU/ET et recherche paginée, sélection démo séparée. Génération/typageConvex verts ;36backend,141UI(régressionclésincluse),21cliquets ; lint ciblé0/0. Index local génération1 construit. IAB390/834/1440 sans débordement ; recherche réelle Studio Objectif et retour produit→marketplace avec filtres/focus conservés. Clés React, priorité première image et déclaration smooth-scroll corrigées. Aucun catalogue marchand réel configuré localement ; sélection fictive explicitement distincte. Aucune activation production. |
| MP05 | Sources raccordées, contrôles ciblés et recette locale verts | Variantes/conditions figées PRO, paniers par vendeur, CTA public, catalogue local filtré et migration. PRO34catalogue+17checkout+26services+52UI ; contrats jumelés6/8. ANTSIA97backend,26paniers,50sélection,103catalogueUI initiaux,51aprèscorrectifSPA,87parent,14modération ; génération, types app/tests et21cliquets verts. IAB devanture390/834/1440, panier320/834/1440, filtres membre/public mis à jour sans recharge manuelle ; grille1produit stable. 21cas OTT/navigation et48tests catalogue incluant le curseur parent verts ; dernier typage app vert. |
| MP06 | Sources raccordées, contrôles ciblés verts ; finance service fermée | a/b/c : profils publiés, recherche, devis refusables V2, forfait figé, reprise et lecture de préparation sous mandat. ANTSIA64backend/78UI finaux,11routes/éditeur parent ; génération stricte, types app/tests et25cliquets verts. PRO18domaine/68backend/19UI/6routes, quatre typages et génération statique verts. Nombres recouvrants. Consultation locale membre/public390/834/1440 observée ; filtres prestataire membre/public sans recharge manuelle aux trois formats et retour marketplace conservé après remontage. Refus SSR pendant HMR non reproduit au passage gelé ; cause non attribuée. Voir11_SERVICES_MP06. |
| MP07 | Sources raccordées, contrôles ciblés verts | Préparation financière signée et consentement dédié ; politique vendeur dans le vrai écran PRO. ANTSIA74backend/40UI/10routes/4montage (recouvrements), types app/tests,25cliquets/génération/lint verts ; vues locales3formats et clair/sombre. PRO7domaine/53backend/8UI/7routes,4typages et génération statique verts. Aucun accord réel ou paiement exécuté ; voir12_PREPARATION_FINANCIERE_MP07_MP08. |
| MP08 | Qualification fermée raccordée ; connecteurs conditionnels | Registre exact des quatre rails vide, pays vendeur non prouvé, aucun contrat PSP. Aucun connecteur inventé ni fonds ouverts. MP08b–e et MP06d restent en attente des preuves externes, sans bloquer les lots indépendants. |
| MP09 | Sources raccordées, contrôles ciblés verts | Profils volontaires, visibilité et collaborations, modération et source iCom fermée ; génération/typage, cas domaine/backend/UI/données et recette locale vide3formats. Voir13_PROFESSIONNELS_MP09 ; aucun profil ni message réel créé. |
| MP10 | Admission fermée raccordée ; profils conditionnels | /rencontres informative et API fermée ; preuve de majorité non fournie. Aucune participation, préférence ou donnée sensible recueillie. |
| MP11 | Maintenu fermé | Aucune source iCom personnelle ni intérêt/réciprocité ; admission MP10 requise selon la décision du propriétaire. |
| MP12 | Sources raccordées, contrôles ciblés verts ; validation finale en attente | Modèle éditorial, habilitations acceptées, versions, workflow et médias gardés ;29backend et9nouveauxUI verts, lint ciblé0 ; voir14_PRESSE_MP12_MP13. Ces preuves ne couvrent pas les dernières extensions MP13. |
| MP13 | Sources raccordées, contrôles verts sur le candidat MP14 | Sites médias membre/public, annuaire, référence sociale canonique, fermeture des nouveaux commentaires. Vérifiés dans le candidat composé : génération, typages et suites moteur/application vertes (voir 16_RAPPORT_LIVRAISON_MP00_MP14). Aucun article réel publié. |
| MP14 | Candidat composé et vérifié ; publication en attente de l'accord du propriétaire | Branche `claude/marketplace-mp00-mp14-20261021` : `main` 5851d02 (PR 29) + instantané de l'arbre partagé eea4f0c (P, U, MP) + correctifs. 13 225 tests ANTSIA verts, build vert, typages et cliquets verts. Production non déployée : `convex deploy` puis Vercel exigent l'accord explicite. Voir 16_RAPPORT_LIVRAISON_MP00_MP14. |

## MP14 — candidat du 21 octobre (reprise après interruption Codex)

Les sessions Codex ont été interrompues à 17 h 50 pendant la composition dans un bac à sable Vercel inaccessible à la reprise. Le candidat a été recomposé localement, hors de l'arbre partagé (instantané par index privé, fusion dans un dossier temporaire, backend Convex local propre au dossier). Détails, chiffres, conditions DIASPORALE et plan de mise en ligne : [16_RAPPORT_LIVRAISON_MP00_MP14](16_RAPPORT_LIVRAISON_MP00_MP14.md).

## Conditions externes

L'approbation du plan n'active aucun PSP ni les rencontres personnelles. Continuer les travaux indépendants et consigner les branches fermées ; ne pas remplacer leurs preuves par une déclaration locale ou un connecteur simulé en production.

## Contrôles PRO.GA MP03 — limites distinctes

Génération statique `--dry-run --system-udfs` seulement : aucun backend PRO démarré et aucun `_generated` écrasé, pour conserver le seul backend local ANTSIA existant. Cette simulation ne vaut pas un déploiement/génération serveur PRO complet. Typage domaine et UI PRO verts. Le typage Convex global avec tests signale cinq diagnostics antérieurs hors MP03 : commercePrivateReads.test.ts47/48, serviceQuoteProof.ts22 (`Object.hasOwn`/libES2021), commerceServiceNotices.test.ts89/161 (fixtures). Le passage groupé d'intégration est99/100 : l'ancien upload PDF JOBS attend200 et reçoit422, sans modification de sa garde par ce lot. Les cinq diagnostics de typage ont ensuite été corrigés dans MP06 par des ajustements bornés de types et de fixtures ; les quatre typages PRO passent. Le défaut PDF422 reste distinct et non corrigé à ce stade.


## MP05 — preuve et limites

Les conditions vendeur V2 ne sont affichées que sous état de modération publié, mapping/contrat/parent et consentement vivants. L'approbation ou le refus exigent la révision et l'empreinte présentées ; une mise à jour entre lecture et décision est refusée. Les clauses intégrales sont servies à la prélecture. Les appelants historiques commerceOffer sans preuve restent une dette distincte ; la nouvelle UI transmet toujours la paire.

La recette réelle a trouvé puis corrigé deux défauts : sélection de filtres membre ignorée lorsque l'arbre RSC conservait ses props initiales ; sélection publique nécessitant une revalidation RSC. Le membre lit désormais l'URL canonique ; le public masque l'ancienne sélection avant revalidation du même rendu serveur, avec garde de session. Aucun transport public alternatif, aucun repli après refus de session. Une offre de démonstration n'ouvre ni panier ni transaction. Les paniers positifs sont éprouvés par harnais ; le navigateur local a vérifié leur état vide. Aucun catalogue marchand PRO réel ni transaction de production ne sont prétendus testés.

Captures locales du chantier dans Library/Caches/antsia-marketplace-20261021/screenshots (devantures, paniers et filtres). Le disque a fluctué jusqu'à1,6GiB libres puis est revenu à10,30GiB sans nettoyage par cette session ; aucune suppression ni arrêt de service.

## Conditions confirmées par le propriétaire

Aucun contrat PSP disponible : collecte, remboursements fournisseur et reversements réels restent fermés. Aucun service de preuve de majorité disponible : inscription et découverte personnelles restent fermées à la demande du propriétaire. Les préparations techniques et les lots indépendants continuent.

## MP10a–MP11 : fermeture confirmée

Deux tests purs, quatre backend et cinq UI verts ; génération stricte et typages app/tests verts. /rencontres observée à390/834/1440px avec un main, un h1, sans débordement et sans aucun formulaire personnel. Les profils sensibles, intérêts/réciprocité et conversations personnelles restent conditionnels ; aucun vivier fictif contournant la preuve de majorité.
