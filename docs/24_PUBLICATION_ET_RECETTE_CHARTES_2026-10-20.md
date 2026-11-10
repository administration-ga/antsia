# Publication des chartes et recette en ligne — 20 octobre 2026

Les corrections sont publiées sur **https://antsia.vercel.app** et
**https://antsia-demo.vercel.app**. Les deux sondes `/api/sante-fonctionnelle`
renvoient HTTP 200. La production sert `chartes-20261020-ad1664c2b27b81a4` ;
la démonstration sert désormais `logout-20261020-c52b73ee37effd0c`, qui conserve
ces corrections et ajoute le correctif de déconnexion publié par l'autre chat.

**Suivi du 20/10/2026 :** la limite initiale d'absence de session membre de
production est levée. Le raccordement IDN, la correction DNS, l'initialisation du
réseau racine par le chat voisin et la connexion réelle du propriétaire après
rechargement sont documentés dans
[`docs/25 — Raccordement IDN`](25_RACCORDEMENT_IDN_PRODUCTION.md). Les 126 contrôles
membre de production et leurs captures portent sur
`logout-20261020-c52b73ee37effd0c`, avant le nouveau correctif du sélecteur en
construction ; ils ne valident pas ce nouveau build. Les preuves et blocages
détaillés ci-dessous conservent leur valeur historique aux étapes décrites.

## Version effectivement publiée

| Élément | Valeur |
|---|---|
| Nature de la version | Instantané de contenu ; **ce nom n'est pas un commit Git** |
| Empreinte SHA-256 | `ad1664c2b27b81a4832117975788c22f9889e8a7a58750ca8f3bd900084b2aa9` |
| Base ANTSIA | `origin/main` / PR 17, `a29a6d81b815815f7f8aa77d2ac81f7bff134128` |
| Base DIASPORALE nécessaire à la construction | `fab55ef0b2101aac70c4351f02fdfc74b5ee3f3a` |
| Corrections intégrées | 182 chemins de corrections des chartes et préférences, inventaire explicite |
| Contrôle de stabilité | 2 969 fichiers identiques à leur inventaire après tests et publications |
| Vercel `antsia` | `dpl_94991LfeD7WvCZ2tLqXTZAh78xVx`, READY puis promotion sans reconstruction |
| Vercel `antsia-demo` | `dpl_7QKwPUYchXGkPdrCod2ttPW49abG`, READY puis promotion sans reconstruction |
| Dernière version de démonstration | `dpl_3W92ZpnB5rhewbqWd3vxggfYWs5f`, READY, ajout de déconnexion sur notre version |
| Convex production | `diligent-avocet-585` |
| Convex démonstration | `vivid-hedgehog-655` |

L'archive de livraison est construite à partir de `main` et des corrections
sélectionnées dans les sources réelles. Les travaux auth, sessions et DIASPORALE
voisins, présents dans l'arbre partagé, sont exclus. La porte des comptes de
démonstration de `main` est conservée dans l'écran d'entrée ; ses seuls styles
autorisés sont reportés. Aucun changement de branche, commit applicatif, push,
fusion, fichier `.env*` ou paramètre distant de fournisseur n'a été effectué.
Les corrections non commises doivent encore rejoindre une PR avant une prochaine
publication construite directement depuis Git.

Pendant la recette, le chat « Corrige la déconnexion de la démo » a publié une
version autorisée qui prend notre déploiement de démonstration comme base. La
comparaison des 2 969 fichiers confirme cinq seuls changements, tous de session
ou de tests, sans ajout ni retrait ; les chartes et les autres sources sont
identiques. Aucun retour à notre ancienne version n'a été effectué. Les 126
contrôles membre ci-dessous ont tous été repris sur cette **version finale**.
La parité des CSS servies a également été remesurée après cette publication.

Les deux déploiements Convex incluent la conversion des six identifiants historiques
de thème vers Gaboma. Le schéma et les index sont identiques à ceux de la base et de
la publication précédente `9b377f5`. Les deux simulations et les deux publications
réelles annoncent **« No indexes are deleted by this push »**. Aucune migration ni
graine n'est exécutée. Les contrôles sur l'archive passent : application 692 tests,
UI 2 255 tests et préférences serveur 40 tests ; typage Convex exécuté par chaque
publication. La validation locale générale précédente reste documentée dans
[`docs/23`](23_APPLICATION_STRICTE_DES_CHARTES.md).

## Recette navigateur en ligne

| Site et surface | Matrice | Résultat |
|---|---|---|
| Démonstration : fil | 7 thèmes × 2 modes × 390/834/1440 px = 42 | Palette et mode attendus ; aucun débordement horizontal. |
| Démonstration : composeur | Même matrice = 42 | Ouverture et fermeture sur téléphone et bureau ; champ de texte arrondi à 14 px ; aucune publication envoyée. |
| Démonstration : réglages | Même matrice = 42 | Cartes de choix et sélecteur du rail raccordés ; cartes 24 px, intérieur 16 px, champs 14 px, ombres ordinaires absentes. |
| Production : entrée et À propos | Gaboma × 2 modes × 3 formats × 2 surfaces = 12 | Présentation et largeurs conformes ; champs d'authentification désactivés par la configuration serveur. |
| Préférences de démonstration | Rechargement, page publique `/a-propos`, mode Système | Sable sombre conservé après rechargement et navigation publique ; Système suit le navigateur sombre. |
| CSS réellement servies | Deux domaines, sept chartes et leurs variantes sombres | Déclarations de charte identiques ; empreintes normalisées identiques après exclusion des seuls identifiants Vercel des URL de polices. |

La session de démonstration utilise l'acteur fictif fourni par l'application.
Son fil est vide ; les suggestions de personnes et de pages sont remplies. Aucun
post, message, téléversement ou achat n'a été envoyé. Le compte est remis à
Gaboma et l'appareil à Système à la fin de la recette. Les 18 premières mesures
des réglages, faites en visant les radios masquées, sont conservées dans
`reglages-essais.json` et **exclues** du résultat ; la passe valide vise les cartes
visibles et contrôle le thème appliqué. Une reconnexion de démonstration a été
nécessaire après cet essai d'automatisation.

Les identités et contenus métier fictifs ne prouvent ni une transaction ni le rendu
d'une publication remplie. La présence des sept CSS en production ne prouve pas
leur sélection dans une session membre de production.

## Blocages réels de la production

### IDN indisponible avant toute redirection

La requête publique `modules/platform/authentication:configuration` du bon
déploiement renvoie `idn=false`, ainsi que `emailOtp=false`, `smsOtp=false`,
`localCodes=false` et `demoAccounts=false`. `convex/betterAuth/settings.ts`
désactive exactement IDN si l'identifiant client ou le secret est vide, ou si
aucune adresse HTTPS valide n'est fournie pour l'issuer ou la découverte. Une
mauvaise origine ou un callback refusé interviendrait après cette première garde.
Les valeurs privées n'ont pas été consultées ; le paramètre précis manquant
n'est donc pas identifié individuellement.

La découverte publique répond HTTP 200 et annonce :

- issuer : `https://site.identite.ga` ;
- discovery : `https://site.identite.ga/api/auth/convex/.well-known/openid-configuration` ;
- autorisation : `https://identite.ga/api/auth/oauth2/authorize` ;
- PKCE : `S256`.

Raccordement minimal à terminer par le propriétaire dans le portail IDN et le
déploiement Convex de production, sans communiquer de secret dans un chat :

1. Contrôler le client OIDC ANTSIA de production, approuvé et non désactivé.
2. Renseigner `IDN_CLIENT_ID` et `IDN_CLIENT_SECRET` côté serveur ; poser
   `IDN_ISSUER=https://site.identite.ga` ou la découverte explicite ci-dessus.
3. Contrôler `SITE_URL` et déclarer exactement
   `<SITE_URL>/api/auth/oauth2/callback/idn` dans le portail. Pour les domaines
   concernés : `https://antsia.vercel.app/api/auth/oauth2/callback/idn` ou
   `https://antsia.ga/api/auth/oauth2/callback/idn`, selon l'origine réellement
   choisie. Ne pas déduire cette origine du seul catalogue des applications.
4. Contrôler les origines autorisées, les scopes `openid profile email` et les
   URL frontend/backend du même déploiement ; attendre `idn=true` dans la
   configuration publique avant la recette de connexion et de création.
5. Réaliser le parcours IDN avec le propriétaire, puis reprendre les 42
   combinaisons de thème en session membre sur `antsia.vercel.app`.

Le portail IDN contient aussi un exemple documentaire
`apps/developer/app/docs/_articles/register-app.tsx` qui donne encore `https://identite.ga` comme issuer ;
le SDK, la découverte publique et l'ADR IDN utilisent `https://site.identite.ga`.
Aucun code du projet frère n'a été modifié. La démonstration conserve son accès
fictif prévu par `docs/23_ENVIRONNEMENT_DE_DEMONSTRATION.md`.

### Aucun réseau racine actif exposé

La requête publique `modules/networks/networks:getBySlug` avec `slug=antsia`
renvoie `null` sur la production, alors qu'elle renvoie le réseau sur la
démonstration. Cela signifie **absent ou non actif**, sans permettre de trancher
ces deux cas. La page `/decouvrir` affiche donc « La lecture est momentanément
indisponible ». Vérifier le réseau dans la console opérateur et le créer ou
l'activer par le parcours audité approprié. Aucune graine de démonstration ni
modification directe des données de production n'a été utilisée.

## Preuves

Dans [`recette/chartes-en-ligne-2026-10-20/`](recette/chartes-en-ligne-2026-10-20/) :
`publication.json`, `sources-publiees.json`, `parite-css.json`, `demo-matrice.json`,
`reglages-matrice.json`, `production-entree.json`, `production-public.json`,
`preferences.json`, `systeme.json`, journaux des tests/publications et 264 captures
PNG. `version-finale-demo/` contient les 126 captures et les mesures de la version
finale, `persistance.json` prouve le thème conservé après rechargement et page
publique ; `parite-css-finale.json` et `publication.json` tracent la succession
des versions. La recherche Vercel des erreurs sur les deux identifiants exacts de
déploiement et une fenêtre de 30 minutes renvoie « No logs found » ; elle ne
remplace pas les deux blocages fonctionnels constatés dans l'interface.
