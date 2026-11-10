# Raccorder IDN à ANTSIA — 20 octobre 2026

## État vérifié le 20 octobre 2026

Le raccordement et la connexion réelle IDN sont validés. Le serveur IDN
`flexible-panda-248` a été repris ; le client `antsia_prd_dnWDNoy7` est approuvé
pour le callback `https://antsia.vercel.app/api/auth/oauth2/callback/idn`, les
scopes `openid profile email` et le niveau minimal 1. Les quatre paramètres
`IDN_CLIENT_ID`, `IDN_CLIENT_SECRET`, `IDN_ISSUER` et `IDN_DISCOVERY_URL` sont
configurés sur `diligent-avocet-585`. Le secret neuf a transité en mémoire puis
par stdin, sans fichier ni affichage de sa valeur.

Chez Netim, les deux enregistrements A `site.identite.ga` et `api.identite.ga`
vers `102.208.104.151` ont chacun été remplacés par un CNAME vers
`convex.domains`, avec TTL 300. La comparaison des autres lignes de la zone est
exacte : MX, TXT et autres enregistrements sont conservés. Les réponses de
`ns1.netim.net`, `1.1.1.1` et `8.8.8.8` confirment les deux CNAME. La découverte
`https://site.identite.ga/api/auth/convex/.well-known/openid-configuration` et
`https://api.identite.ga/version` répondent HTTP 200 avec vérification TLS
normale. L’état initial « non vérifié » de la console Convex est conservé plus
bas comme historique ; aucune nouvelle validation visuelle de cette console
n’est annoncée.

Le réseau racine ANTSIA est désormais présent et actif. Son initialisation a
été réalisée dans le **chat voisin** : une racine et son historique, sans
création de profil, de compte ni de rôle de test. Ce geste n’est pas attribué à
la présente reprise du raccordement.

Le propriétaire a lui-même complété le PIN et le consentement IDN dans le
navigateur. Le retour sur `/fil` avec `@asted`, puis le maintien de l’état membre
après rechargement, sont constatés. L’inventaire du
`2026-10-20T16:42:05.081Z`, complet et borné à moins de 200 comptes/sessions,
compte un compte lié à IDN et deux sessions IDN actives, sans jeton ni identifiant
privé dans la preuve. Les contrôles transitoires à zéro session correspondent à
la recette de déconnexion simultanée du chat « Corrige la déconnexion de la démo » :
sa suppression volontaire de session a été vérifiée. Ils ne démontrent pas un
défaut IDN ; la recette avec deux comptes n’est pas annoncée comme terminée.

La recette membre de production compte **126 contrôles passés** : 7 thèmes ×
2 modes × 3 largeurs (390/834/1440 px) × 3 surfaces (fil, paramètres, composeur).
Les 126 captures et `mesures.json` sont conservés dans
`recette/idn-2026-10-20/chartes-production/`. Ces preuves portent sur
`logout-20261020-c52b73ee37effd0c`, **avant le correctif du sélecteur publié ensuite (voir
[rapport dédié](26_SELECTEUR_MEDIAS_RESPONSIVE_2026-10-20.md))** ; elles ne valident pas ce nouveau build. Aucun média n’a été
téléversé ni publié par cette recette. Un post média du propriétaire, déjà
présent et bloqué par la sécurité, était visible ; aucun contournement n’a été
effectué. La préférence de fin Gaboma / Système / Aucun a été restaurée et
constatée après rechargement.

Le raccordement n’a nécessité ni nouveau code IDN ou backend, ni publication
Convex. Aucun fichier `.env*` n’a été modifié.

Preuves de cette reprise dans [`recette/idn-2026-10-20/`](recette/idn-2026-10-20/) :
`raccordement.json`, `dns-verification.json`, `zone-netim-avant.json`,
`zone-netim-apres.json`, `zone-netim-corrigee.png` et
`antsia-connecte-apres-rechargement.png`.

## Reprise avec le propriétaire connecté — premiers contrôles historiques

Les observations ci-dessous précèdent la correction DNS et la connexion réelle
décrites ci-dessus.

Le 20/10, accès au projet `okatech / identite-ga` confirmé dans Chrome.
Le serveur `flexible-panda-248` a été repris dans les réglages Convex : état
`running` constaté, puis requêtes administratives à nouveau exécutables.
Aucun changement de forfait ni de limite de dépenses.

L’inventaire borné des 11 applications est complet : aucun client ANTSIA/ANTIA.
Client **`antsia_prd_dnWDNoy7`** créé par la procédure existante, approuvé en
production, actif et rattaché au développeur vérifié existant d’OkaTech.
Callback `https://antsia.vercel.app/api/auth/oauth2/callback/idn`, scopes
`openid profile email`, niveau minimal 1. Aucun utilisateur ni rôle créé.

Les quatre paramètres `IDN_CLIENT_ID`, `IDN_CLIENT_SECRET`, `IDN_ISSUER` et
`IDN_DISCOVERY_URL` sont configurés sur `diligent-avocet-585`. Le secret neuf a
circulé en mémoire puis par stdin ; aucune valeur affichée ni fichier créé.
La projection publique annonce maintenant `idn=true` et le bouton IDN réel est
actif sur `/entrer`, sans republication applicative.

**État à ce premier contrôle : connexion complète non encore validée, blocage DNS découvert lors du test.**
Chrome reçoit `ERR_CONNECTION_CLOSED` sur `site.identite.ga`, et les sondes HTTPS
expirent. Le serveur de noms autoritaire Netim et le résolveur public renvoient
`site.identite.ga` et `api.identite.ga` vers **102.208.104.151** (A, TTL 300), sans
CNAME. Convex indique les deux domaines **non vérifiés** et demande le CNAME
`convex.domains`. Les TXT `_convex_domains.{site,api}.identite.ga` contiennent déjà
`flexible-panda-248`.

La découverte sur l’adresse canonique `flexible-panda-248.convex.site` répond
200 et garde l’issuer `https://site.identite.ga`. Le frontend `identite.ga`
répond aussi 200. Changer seulement le discovery ANTSIA ne réparerait pas les
endpoints token/userinfo annoncés sur le domaine indisponible.

Accès Netim demandé dans un onglet préparé. La mémoire IDN et les chantiers
examinés ne documentent aucune migration vers cette IP ; l’architecture prévue
reste Convex managé. Une migration récente non consignée reste possible.
L’inventaire administratif ANTSIA confirme aussi zéro réseau de slug `antsia` :
le réseau racine est absent, et pas seulement masqué dans la projection publique. Aucun DNS, domaine, issuer du serveur IDN,
client existant, code IDN ou .env modifié. Aucun consentement OIDC ni profil
public de l’utilisateur soumis ; aucune session ANTSIA réussie annoncée.

Preuves de cette étape historique : le bloc `initialControl` de
`recette/idn-2026-10-20/raccordement.json`,
`idn-repris.png`, `domaines-idn-non-verifies.png` et `netim-connexion.png`.

## Précontrôle initial (historique)

Le propriétaire demande de faire le nécessaire pour enregistrer et raccorder le
client OIDC de production ANTSIA. Référence fournie ensuite :
[`ntsagui/idn-gabon`](https://github.com/ntsagui/idn-gabon), `main`
`2b10012f04b242f9b4da298c1973be366a076236`.

Le précontrôle est terminé. Aucun client créé, secret consulté ou renouvelé,
rôle attribué, environnement modifié ou code IDN publié à ce stade.

Deux blocages sont distingués :

- ANTSIA `diligent-avocet-585` : `IDN_CLIENT_ID`, `IDN_ISSUER` et
  `IDN_DISCOVERY_URL` sont absents. Le secret n'a pas été consulté. Ces absences
  suffisent à maintenir `idn=false` et le bouton de connexion désactivé.
- IDN `flexible-panda-248`, équipe **okatech**, projet **identite-ga** :
  l'inventaire administratif en lecture seule des applications ANTSIA est refusé
  par « Cannot run functions while this deployment is paused ». La raison de la
  pause n'est pas encore connue. Les comptes de navigateur disponibles n'ont
  pas accès à cette équipe ; un onglet de connexion ciblant le projet est préparé
  pour le propriétaire. Aucun changement de forfait ni de limite de dépenses.

La découverte OIDC répond et les métadonnées de fonctions restent lisibles. Cela
ne prouve pas que les fonctions de connexion d'un serveur en pause s'exécutent.

## Cibles et paramètres préparés

| Paramètre | Valeur ou règle |
|---|---|
| Nom du client | `ANTSIA` ; vérifier les applications existantes avant création |
| Serveur IDN | `flexible-panda-248`, API `https://api.identite.ga` |
| Issuer OIDC | `https://site.identite.ga` |
| Découverte | `https://site.identite.ga/api/auth/convex/.well-known/openid-configuration` |
| Site principal ANTSIA confirmé | `https://antsia.vercel.app` |
| Callback autorisé | `https://antsia.vercel.app/api/auth/oauth2/callback/idn` |
| Scopes | `openid profile email` uniquement |
| Niveau minimal | 1 ; aucune vérification fictive ni élévation de rôle |
| Démonstration | Aucune modification ; son accès fictif est conservé |

Le callback est central et dérivé du `SITE_URL` de Convex, pas du catalogue des
applications. N'ajouter les domaines futurs qu'après leur raccordement effectif.

## Procédure préparée lors du précontrôle — historique, exécutée depuis

1. Consulter la cause de pause dans la console Convex. Reprendre le serveur si la
   pause est une simple opération d'exploitation autorisée ; toute décision de
   paiement ou de changement de forfait reste un geste du propriétaire.
2. Reprendre l'inventaire **borné et sans secret** des clients dont le nom contient
   ANTSIA/ANTIA : identifiant public, statut, propriétaire, callbacks et scopes.
   Un client existant ne doit pas être remplacé ou son secret renouvelé sans
   vérifier ses usages. Aucun utilisateur n'est impersonné pour cet inventaire.
3. Si aucun client n'existe, utiliser la procédure administrative first-party
   `developer/apps:bootstrapTrustedClient`, déjà déployée et présente dans le
   [dépôt de référence](https://github.com/ntsagui/idn-gabon/blob/2b10012f04b242f9b4da298c1973be366a076236/packages/backend/convex/developer/apps.ts#L1274).
   Elle crée un client de production approuvé, garde le secret sous empreinte et
   refuse les homonymes. Identifier un propriétaire développeur existant pour sa
   gestion future ; ne créer ni compte ni rôle par commodité de recette.
4. Transmettre le secret **nouvellement créé** directement entre processus vers
   `convex env set IDN_CLIENT_SECRET` sur `diligent-avocet-585`, par l'entrée
   standard prévue par le CLI. Capturer la réponse de création en mémoire sans
   l'afficher. Aucun secret dans les arguments de processus, le presse-papiers,
   les fichiers, `.env*`, traces, captures ou journaux. Ne pas lancer la création
   avant que cette destination soit prête à recevoir la valeur.
5. Renseigner aussi l'identifiant public du client et l'issuer. Vérifier par la
   requête publique `modules/platform/authentication:configuration` que
   `idn=true`, puis recharger l'entrée ANTSIA. Aucun rebuild frontend ne doit
   être supposé nécessaire pour une configuration lue du serveur.
6. Ouvrir le vrai parcours IDN avec la session du propriétaire et vérifier le
   consentement, le callback, l'échange PKCE et le retour attendu dans ANTSIA.
   Toute étape de consentement ou de création de profil doit être examinée avant
   soumission ; aucune identité publique n'est inventée pour tester les chartes.

La procédure first-party ne crée ni personne ni session ni rôle. Son refus d'un
homonyme est sans écriture, et son secret est retourné une seule fois. Aucun
déploiement du WIP local IDN n'est requis pour disposer de cette fonction.

## Sources et limites

Le dépôt local fourni pour IDN a un remote `administration-ga/identite.ga` et un
HEAD `0e5414c`, avec des travaux d'authentification non commis. Il n'est pas
assimilé au dépôt `ntsagui/idn-gabon`. Le bloc `bootstrapTrustedClient` et le SDK
Better Auth sont identiques aux éléments de la référence propriétaire ; les
autres différences d'authentification n'ont pas été publiées. Les métadonnées du
serveur prouvent la présence de la fonction, pas le SHA global déployé.

Au précontrôle, le réseau racine ANTSIA de production restait également à vérifier
dans sa console (absent ou inactif dans la projection publique). Ce point est levé
par l'initialisation du chat voisin décrite en tête de rapport. Le raccordement
OIDC n'est pas une autorisation de créer de faux profils, d'octroyer des rôles d'opérateur ou de
jouer une graine de démonstration en production.

Preuves : [`recette/idn-2026-10-20/preflight.json`](recette/idn-2026-10-20/preflight.json)
et écran de connexion propriétaire préparé dans le même dossier.
