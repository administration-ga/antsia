# Accueil et accès — Réseau public et entrée

Source : [Accueil et accès](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-5fbccc167e3a).
Relevé DOM/CSS du 20 octobre 2026. [Index](../README.md) · [Socle](../00_SOCLE_COMMUN.md).

## Inventaire des quatorze planches

Chaque planche présente **mobile 390 × 844**, **tablette 834 × 1194** et
**bureau 1440 × 1024**. Les chemins ci-dessous sont ceux indiqués par le canevas.

| N° | Fichier | Route | Composition et actions relevées |
|---|---|---|---|
| 1 | `Accueil.dc.html` | `/` | Présentation du réseau, Entrer / Découvrir sans compte, aperçu du fil, quatre badges, réseaux enfants, contributions, neuf provinces, pied de page |
| 2 | `Entrer.dc.html` | `/entrer` | Adresse électronique, code à six chiffres, Changer d'adresse, Entrer, Renvoyer un code, accès public |
| 3 | `Bienvenue.dc.html` | `/bienvenue` | Nom affiché, identifiant et propositions, langue, fuseau, accord de visibilité, aperçu du profil, Rejoindre ANTSIA |
| 4 | `Decouvrir.dc.html` | `/decouvrir` | Recherche, Tout / Publications / Pages / Personnes / Provinces / Tags, pages, tendances, publications, provinces |
| 5 | `Province.dc.html` | `/provinces/estuaire` | Titre et localités, Publications / Pages / Évènements, contributions et pages locales, autres provinces |
| 6 | `Tag.dc.html` | `/tags/akanda` | Sujet et volume borné, sujets voisins, médias et publications, pages associées, province |
| 7 | `Publication-publique.dc.html` | `/publications/…` | Auteur, texte et média, public/origine, réactions agrégées, commentaires, Entrer pour participer, autres publications |
| 8 | `Profil-public.dc.html` | `/@clarisse.obame` | Couverture, avatar, nom et bio, compteurs publics, profil réduit, Entrer pour suivre / Écrire, publications et albums |
| 9 | `Page-publique.dc.html` | `/pages/mairie-libreville` | Identité Officiel, page reflétée en lecture seule, suivi, publications / évènements, informations et agents |
| 10 | `Boutique-publique.dc.html` | `/boutiques/nzeng-couture` | Vitrine sans compte, catalogue et collections, emplois, prestations, retrait/livraison, paiement annoncé, présentation d'activité |
| 11 | `A-propos.dc.html` | `/a-propos` | Six sections sur le réseau, identité, badges, visibilité, effacement et réseaux enfants |
| 12 | `Transparence.dc.html` | `/transparence` | Cinq sections : agrégats, processus, motifs, recours et périodes publiées |
| 13 | `Confidentialite.dc.html` | `/confidentialite` | Huit sections : données, finalités, durées, consentements, droits, autorité, diaspora et références |
| 14 | `Mentions-legales.dc.html` | `/mentions-legales` | Sept sections : éditeur, publication, hébergement, contact, protection des données, validation et références |

## En-tête, navigation et pied de page

Sur mobile, la marque ANTSIA et Entrer structurent l'en-tête public.
Les vues plus larges ajoutent Découvrir, Provinces, À propos et Créer un compte.
Le pied de page relie À propos, Transparence, Confidentialité, Mentions légales
et Mes données. Les pages éditoriales ont un sommaire : bouton « Sur cette page »
sur les petits formats, navigation latérale sur le bureau.

Les liens de prototype en `*.dc.html` décrivent les destinations ; leur
raccordement utilisera les routes applicatives existantes.

## Entrer et rejoindre

L'état d'entrée dessiné est celui d'un **code e-mail déjà envoyé**, à six
chiffres et annoncé valable cinq minutes. Adresse, modification et renvoi
restent visibles. La copie décrit un parcours sans mot de passe et la création
du compte à la première entrée. Ce dessin ne supprime pas les autres portes
IDN / SMS déjà définies par le produit.

Bienvenue laisse choisir le nom affiché et le handle sans recopier un registre.
Les suggestions de handle coexistent avec un exemple déjà pris. Langue et
fuseau sont modifiables avant Rejoindre. L'accord explicite conditionne la
visibilité du profil ; l'aperçu montre nom, handle, badge et ancienneté.

Aucun envoi de code ni création de profil n'a été déclenché lors de ce relevé.

## Lecture publique et participation

Les aperçus ne montrent que le contenu rendu public. Réagir, commenter,
suivre ou acheter invitent à entrer quand une session est nécessaire.
La publication conserve son origine et sa visibilité ; une page institutionnelle
reflétée reste en lecture seule.

Les quatre badges sont expliqués séparément : Officiel, Vérifié, Agent public,
Communauté. Leur présence est un fait du service, pas un choix du thème.

La province est celle du contenu choisie par l'auteur ; elle ne révèle pas sa
résidence ou sa localisation. Les tendances indiquent une période et une
mesure bornée. Les compteurs de la maquette sont illustratifs.

## Vitrine publique

La boutique expose identité, badge, catalogue, prix XAF, variantes, collections,
offre d'emploi, prestations, modes de remise et présentation.
L'action « Entrer pour acheter ou écrire » sépare lecture et engagement.
Les prestations précisent qu'une demande ne déclenche pas de paiement.

Les informations publiques ne donnent aucun accès au panier, à l'adresse,
à la commande ou aux échanges privés.

## Pages d'information

Les sommaires, titres hiérarchiques, définitions et liens structurent les longs
textes. Confidentialité et Mentions légales affichent une **version de travail**
et des champs à renseigner. Ne pas transformer les textes de maquette en
déclaration de conformité ni inventer les coordonnées manquantes.

Transparence décrit des agrégats ; les nombres attendus à l'ouverture du
service ne sont pas des statistiques observées.

## Adaptation et contrôles pour l'implémentation

Conserver les actions principales sur les trois formats, le repli du sommaire
et les distinctions public / privé. Le cadre fixe de l'appareil n'est pas une
contrainte de hauteur à imposer aux pages longues.

Vérifier ensuite dans l'application : parcours d'entrée réel, champs et erreurs,
lecture publique autorisée, responsive sans débordement, clavier, sombre,
traductions, contenu long et liens. La lecture des trois vues ne vaut pas
une recette de ces parcours.
