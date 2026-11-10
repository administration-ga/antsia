# ADR-0036 : iCom et iCom Pro — deux espaces de messagerie, une bascule

- **Statut** : Accepté par le propriétaire le 2026-10-22.
- **Date** : 2026-10-22

## Contexte

La messagerie d'ANTSIA mêle aujourd'hui trois familles de conversations dans une seule
destination nommée « Messages » (épure U09, PR 35) :

- les conversations personnelles (à deux et en groupe, tables `personalThreads` et `groupThreads`) ;
- les conversations de boutique (P10, `commercialThreads`, côté client ou côté boutique) ;
- les mises en relation (CC, `contextualThreads` : collaborations professionnelles, mentorat,
  candidatures, demandes de service).

Les deux dernières n'apparaissent que comme filtres de la page Messages, et pas du tout dans la carte
iCom de la colonne droite. Le propriétaire demande de distinguer clairement les contacts d'une
boutique, les relations personnelles et les membres du réseau.

## Décision

Nous allons séparer la messagerie en **deux espaces** :

1. **iCom** : relations personnelles, groupes, appels et contacts personnels (relations).
2. **iCom Pro** : tout ce qui touche une boutique ou une prestation, **côté client compris** :
   - mes achats et démarches (conversations de boutique où je suis le demandeur) ;
   - chaque boutique que je tiens ou pour laquelle je suis mandaté (côté boutique) ;
   - les mises en relation (collaborations, mentorat, candidatures, prestations).

Règles :

- **Apparition.** iCom Pro n'apparaît que si la personne a une activité professionnelle : une boutique
  tenue ou mandatée, un profil professionnel, une conversation de boutique ou une mise en relation.
- **Bascule.** Une pilule interrupteur « iCom | iCom Pro » en tête de la page et de la carte iCom.
  L'espace se lit dans l'adresse (`?espace=pro`) ; une conversation de boutique ou une mise en
  relation ouvre toujours iCom Pro.
- **Activités.** iCom Pro se trie par activité (Mes achats, Mises en relation, chaque boutique), et
  la boîte d'une boutique par état (nouvelles demandes, en cours, closes).
- **Contacts.** Les clients de ma boutique et mes partenaires professionnels vivent dans iCom Pro, les
  relations dans iCom. Les contacts pro sont dérivés des échanges réels : rien n'est importé, et la
  boutique ne voit jamais les relations personnelles (règle déjà en place avec PRO.GA).
- **Appels.** Le journal d'appels se partage par famille : appels personnels dans iCom, appels de
  boutique et de mise en relation dans iCom Pro.
- **Noms.** « iCom » remplace « Messages » dans l'interface d'ANTSIA ; « iCom Pro » nomme l'espace pro.
- **Module autonome.** iCom Pro est un module à part entière (assemblage dans l'application, capacité
  `icomPro` déclarée au moteur), pour pouvoir devenir plus tard une application téléchargeable seule.
- **Moteur partagé.** La capacité est un opt-in d'ANTSIA (`NetworkProvider icomPro`) : DIASPORALE et
  les autres consommateurs gardent la messagerie unique.

## Lots

1. **ICP-1** (front, sans backend) : capacité, bascule, iCom Pro par activité et par état, journal
   d'appels partagé, contacts pro (clients, partenaires, boutiques contactées), noms.
2. **ICP-2** : conversations de démonstration (graines), pour que les deux espaces soient vivants.
3. **ICP-3** : réglages pro (horaires, message d'absence, réponses rapides), assignation visible.
4. **iCom** : demandes de message hors relations, archivage, sourdine des conversations à deux,
   recherche dans tout l'historique.

## Conséquences

- La page et la carte iCom ne montrent plus les filtres « Boutiques » et « Mises en relation » : ces
  conversations passent dans iCom Pro.
- Les listes pro restent des fenêtres paginées par le serveur ; les états (nouvelles demandes, en
  cours, closes) se filtrent dans la fenêtre chargée tant qu'aucun index par état n'existe.
- Revient sur la partie « Messages » du lexique U09 pour ANTSIA.
