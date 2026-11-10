# ANTSIA — Pages Compte et données

Date : **2026-10-20** · Statut : **relevé DOM/CSS de la référence**, sans recette de l’application.

Source : [Compte et données](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-38b9cbf88e7d).

Cette fiche transcrit les quatre planches de la famille Compte et données.
Elle distingue les réglages dessinés, les consentements, les décisions de
modération et l’écran d’état du service, sans en attester l’exécution réelle.

À lire avec le [socle commun](../00_SOCLE_COMMUN.md) et le
[registre des écarts entre référence et code](../08_ECARTS_REFERENCE_ET_CODE.md).

## 1. Inventaire des quatre planches

Les noms des fichiers et les routes sont conservés tels que relevés.

| Fichier de planche | Route | Composition relevée | Actions dessinées |
|---|---|---|---|
| `Parametres.dc.html` | `/parametres` | Apparence, sept thèmes, cinq motifs, langue fr/en, fuseau IANA personnel, autres réglages. | Choisir immédiatement l’apparence et le thème ; Enregistrer les préférences pour langue et fuseau. |
| `Mes-donnees.dc.html` | `/mes-donnees` | Hors coque membre, accessible même suspendu ; export JSON, décisions et recours, consentements, notifications, effacement. | Exporter dans le navigateur, déposer un recours, révoquer des consentements/notifications, confirmer l’effacement par SUPPRIMER. |
| `Moderation.dc.html` | `/moderation` | Équipe et périmètres actuels, Signalements/Prélecture/Recours réseau, extraits limités et décisions motivées. | Classer sans suite, Retirer, Avertir, Suspendre temporairement, dans les droits existants. |
| `Sante.dc.html` | `/sante-fonctionnelle` | Écran sobre État du service : Application antsia-ga, Moteur configuré, Version. | Retour à l’accueil. |

## 2. Paramètres : choix et portée de conservation

| Réglage | Choix dessinés | Application et conservation indiquées |
|---|---|---|
| Apparence | Système, Clair, Sombre. | Changement immédiat, local. |
| Thème | Sept radios, avec trois couleurs de nuancier par thème. | Changement immédiat, porté par le compte. |
| Motif | Aucun, Points, Quadrillage, Grain, Projecteur. | Choix local. |
| Langue | Français et anglais (`fr` / `en`). | Sauvegarde via Enregistrer les préférences. |
| Fuseau personnel | Identifiant de fuseau IANA. | Sauvegarde via Enregistrer les préférences. |
| Autres réglages | Mon fil ; Mes données et mes recours. | Liens vers les sourdines / publications masquées et vers les droits, décisions et notifications. |

Le sélecteur de thème présente les sept choix du système :

- **Gaboma**.
- **Soleil**.
- **Forêt**.
- **Corail**.
- **Lagon**.
- **Électrique**.
- **Sable**.

Le choix de thème et le choix d’apparence restent distincts.
Les nuanciers indiquent trois couleurs par option ; leurs valeurs et les jetons
communs sont documentés dans le [socle](../00_SOCLE_COMMUN.md) et les fiches de thème.

## 3. Mes données : accès et export

Mes données est dessiné **hors de la coque membre**.
L’accès reste prévu pour une personne **suspendue**.

L’export est préparé dans le navigateur sous la forme d’un **seul fichier JSON**.
Les **clés de connexion et de notification en sont exclues**, selon le texte de la planche.
Le canevas ne constitue pas une preuve qu’un export a été exécuté ou qu’un fichier
réel contient uniquement les données attendues.

| Section dessinée | Données ou action visible |
|---|---|
| Décisions de modération | Date et motif. |
| Recours | Texte de **10 à 500 caractères**. |
| Export | JSON dans le navigateur. |
| Effacement | Confirmation textuelle exacte **SUPPRIMER**. |

La confirmation d’effacement est un état de formulaire représenté.
Elle ne prouve pas, à elle seule, l’effacement de données dans l’application.

## 4. Consentements et notifications

| Famille de réglage | État ou geste relevé |
|---|---|
| Mesure | Consentement facultatif, révocable. |
| Commercial PRO.GA | Consentement révocable. |
| CRM | Consentement révocable. |
| Agent public | Indiqué non actif. |
| Notifications de l’appareil | Autorisation révocable. |
| Récapitulatif e-mail | Réglage de récapitulatif et plafond hebdomadaire. |

Chaque accord porte sa date et se retire en un geste. La planche précise
qu’aucune case de nouvel accord n’est précochée.

Les familles de notifications dessinées sont :

- **Publications et relations**.
- **Messages**.
- **Appels**.
- **Vie du réseau**.
- **Modération**.
- **Fichiers**.

Le relevé ne donne pas de valeur numérique au plafond hebdomadaire.
Il n’établit pas qu’une autorisation d’appareil, une délivrance e-mail ou une
révocation réelle ait été exercée pendant cette mission.

## 5. Modération : périmètre, extraits et décisions

La planche affiche l’équipe et ses périmètres actuels :
**réseau**, **Estuaire**, **Commerce**.
Les sections sont **Signalements**, **Prélecture** et **Recours réseau**.

Les éléments traités utilisent un extrait limité de **publication**,
de **commentaire** ou d’**offre de boutique**.
Le motif est obligatoire et le libellé de l’action reprend la décision.

| Décision dessinée | Contrainte visible |
|---|---|
| Classer sans suite | Motif obligatoire ; action libellée selon la décision. |
| Retirer | Motif obligatoire ; action libellée selon la décision. |
| Avertir | Motif obligatoire ; action libellée selon la décision. |
| Suspendre temporairement | Motif obligatoire ; action libellée selon la décision. |

La présence de ces commandes n’élargit pas les droits d’une personne.
La référence conserve les périmètres actuels ; aucune nouvelle attribution
d’équipe ou d’autorisation n’est déduite de la maquette.

## 6. Santé fonctionnelle : écran d’état

La planche Santé reste sobre et expose :

- **État du service**.
- **Application : antsia-ga**.
- **Moteur configuré**.
- **Version**.
- **Retour à l’accueil**.

Ces libellés représentent un écran de maquette.
Ils ne constituent pas une preuve d’exploitation, de disponibilité du moteur,
de bon déploiement ou d’état des dépendances.

## 7. Les trois formats de la référence

Chaque planche de cette famille possède les trois vues suivantes :

| Vue | Dimensions de planche |
|---|---|
| Téléphone | **390 × 844** |
| Tablette | **834 × 1 194** |
| Ordinateur | **1 440 × 1 024** |

Ces dimensions sont celles des cadres dessinés, pas des seuils CSS.
Le relevé transmis ne détaille pas les colonnes ou réordonnancements de réglages
par format ; aucune adaptation responsive supplémentaire n’est prescrite ici.

## 8. Portée de la fiche

Le document relève les composants, états et contraintes visibles du canevas
le 20 octobre 2026. Il ne contient aucune recette de l’application.

Les contrôles réels de conservation des préférences, export, recours,
consentements, notifications, effacement et autorisations doivent être rapprochés
du [registre des écarts](../08_ECARTS_REFERENCE_ET_CODE.md).
La géométrie et les traitements partagés se lisent dans le
[socle commun](../00_SOCLE_COMMUN.md).
