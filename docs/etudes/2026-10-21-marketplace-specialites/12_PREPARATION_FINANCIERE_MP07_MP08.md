# MP07–MP08 — Préparation financière et qualification

Le propriétaire a confirmé l'absence de contrat PSP. Aucun rail réel ni reversement n'est ouvert. MP08 est limité à la qualification technique fermée ; aucun adaptateur fictif n'est enregistré comme fournisseur réel.

## Séparation des autorités

PRO conserve les registres d'admission, bénéficiaires, politiques, accords vendeurs et preuves financières. ANTSIA lit une préparation minimale par un port signé, jamais les comptes de règlement ou secrets. Une administration de page ANTSIA n'accorde aucun pouvoir financier PRO.

Le contrat `PRO-COMMERCE-PAYMENT-PREPARATION-V1` est distinct de MERCHANT-READ-V1. Scope, opt-in de source et consentement dédiés ; titulaire exact de liaison, droits PRO vivants, requête/réponse corrélées. Lecture bornée à16KiB et60secondes. L'option serveur ANTSIA correspondante est fermée par défaut et aucune valeur réelle d'environnement n'a été changée.

La projection expose seulement environnement, XAF, pays effectivement prouvés ou inconnus, état de collecte, bénéficiaire validé par son libellé ou absence de validation, version/révision/parts de politique, état d'accord et quatre rails demandés. Initier, consulter, rembourser et reverser ont des capacités distinctes. La préparation est une lecture, pas une autorisation de débit.

## Interface

Panneau réel dans la configuration de l'activité : relecture manuelle, étapes manquantes, politique réellement reçue, lien vers l'écran Paiements PRO uniquement si autorisé. Changement de personne/réseau/activité/connectivité ou formulaire modifié invalide l'ancienne lecture. Après expiration, aucun lien ni ancien statut de disponibilité ne subsiste.

La politique vendeur s'accepte dans PRO sur sa version courante, avec action humaine et garde de révision ; aucun accord n'est accepté par cette session. Modifier le bénéficiaire ou la politique invalide un ancien accord selon les règles P12. Aucune saisie de PIN, mot de passe, carte complète ou pièces KYC dans ANTSIA.

## Pipeline conservé

Les intentions P12 figent politique, bénéficiaire et calcul exact. Après réponse incertaine : consultation de la même intention avant tout éventuel renvoi. Retour navigateur, réception de commande, allocation et versement restent des faits différents. Un retrait d'admission ferme les nouveaux effets et conserve le suivi des engagements.

## Validation

En cours sur sources locales. Scénarios simulés et recettes de production seront consignés séparément. Sans contrat ni sandbox qualifiée, MP08b–e et MP06d restent conditionnels, même si les tests unitaires passent.

### Preuves ANTSIA

Génération stricte, types app/tests et25cliquets verts. Port financier :43nouveaux cas et31régressions verts ; interface :40cas sur3fichiers ; destinations fermées :10cas ; montage réel ShopOffers :4cas (recouvrement UI). Lint ciblé propre. Aucun stockage métier ni accord vendeur modifié par une lecture.

Navigateur local, compte fictif @verifie.demo : ouverture de la configuration Studio Objectif Démo → Mes offres → lecture de préparation. Configuration absente : refus propre, aucun moyen proposé comme utilisable. Vues390×844,834×1112,1440×1000 sans débordement, un main/h1. Capture mp07-preparation-390-light.png inspectée. Aucun compte réel, consentement, message ou paiement modifié. Succès signé testé avec pair simulé uniquement ; aucun PRO marchand connecté prétendu éprouvé.

### Preuves PRO et clôture de la préparation

Génération statique sans backend :0 ; types domaine/UI/Convex/app :0 ;7tests de contrat,53backend (port et P12 paiement/politique),8UI,7routes verts. Contrats jumeaux identiques, empreinte14cdcfde838ea9ab1d251cb152dbc8f9d28377aaf43c425c20338c7dec113288. Les politiques et révisions ne qualifient aucun rail sans contrat exact. Pays vendeur inconnu, registre qualification vide : toutes capacités fournisseur fausses ; reversement fermé.

Vue sombre locale du panneau390px inspectée, mode clair de recette rétabli. Un avertissement React historique de refs de l’éditeur a été corrigé par les callbacks de refs directs ; les4tests de focus/étapes restent verts, lint parent sans avertissement après correction. Pas de publication de ce chantier.
