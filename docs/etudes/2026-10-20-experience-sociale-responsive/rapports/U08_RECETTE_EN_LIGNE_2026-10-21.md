# U08 — Contrôle responsive en ligne et correctifs

21 octobre 2026, fuseau Europe/Paris. Demande explicite de vérifier ANTSIA sur téléphone, tablette et ordinateur, puis corriger et publier les problèmes, en préservant les travaux parallèles.

## Observations sur la version publique

- Formats de navigateur émulés : 390×844, 834×1112 et 1440×1000. Aucun appareil physique n'est annoncé comme testé.
- Compte membre existant, parcours normal : fil, Explorer, Clips et espace personnel observés. Barre basse au téléphone, rail compact sur tablette, rail nommé sur ordinateur. La première série contient 12 mesures membres et trois mesures de l’entrée publique, sans débordement horizontal ; le fil téléphone a aussi été capturé séparément.
- Clips : passage au clip suivant par flèche bas et une seule vidéo en lecture observés. Le panneau de recherche précède le premier clip ; le défilement l'écarte du lecteur.
- Les préférences ont varié depuis la recette parallèle (Gaboma clair, Sable sombre). Aucun thème ni préférence de compte n'est écrit par cette session.
- Une déconnexion réelle opérée par la recette parallèle a ensuite fermé la session membre. Le propriétaire a ensuite terminé le parcours IDN normal ; aucun PIN, code OTP, cookie ou jeton n’est extrait ou saisi par l’agent. Messages (liste vide et espace de détail) et le profil réel chargé ont alors été observés aux trois formats, toujours sans débordement horizontal. Une seconde déconnexion explicite de la recette parallèle a interrompu la suite. Les captures de profil correspondent au contenu défilé, pas à une validation complète de ses commandes en tête.
- Trois captures accidentellement faites sur l'onglet IDN ont été écartées et supprimées du dossier local ; elles ne sont ni des preuves ANTSIA ni versionnées. Les trois captures publiques À propos ont été refaites avec le bon onglet et les dimensions confirmées.

## Corrections dans les sources réellement servies

1. **Messages** : en mode adaptatif, la conversation et son hôte restent à position React stable au passage téléphone/tablette. En-tête et liste changent de visibilité par CSS ; la branche historique reste inchangée. Régression : mêmes nœuds, montage unique, état local, brouillon, focus/sélection et retour liste.
2. **Stories** : commandes nommées Précédente/Pause/Suivante de 44 px, gauche/droite hors saisie et modificateurs. La pause volontaire reste distincte de l'appui maintenu. « Lire » respecte pause/feuille/inactivité ; les promesses tardives sont corrélées à la tentative, la story et au média. Aucun changement automatique du son.
3. **Panneaux voisins** : `inert` et `aria-hidden` sur les panneaux inactifs ; préchargement conservé et récupération du focus seulement depuis un panneau désormais masqué ou retiré, sans voler un focus extérieur.
4. **Profil** : « Voir mon profil » remplace « Voir mon profil public » en FR/EN pour ne pas suggérer une visibilité hors du réseau. Les audiences restent inchangées.

## Préservation du travail parallèle

La publication `stories-design-20261021-7330c9399dbe6b9a` (`dpl_H5NAB7BgouCeb8dNG94k2HsaYqFT`) est la base du candidat, avec ses 22 fichiers graphiques conservés. Ses 3069 fichiers de packaging ont été comparés aux empreintes avant copie. Onze sources de correction sont superposées ; les 2076 chemins techniques du candidat sont identifiés séparément. Pas d'édition d'environnement, de changement de branche/index partagé, de publication de backend, de données, de comptes, de fournisseur ou de capacité commerciale. DIASPORALE, natif, admin et démo ne sont pas déployés par cette tranche.

## Validation du candidat

- Codegen et typage Convex strict exécutés sur le déploiement local anonyme avant les tests ; aucun codegen de production.
- Tests ciblés Messages/Stories/pager réussis ; reprise StoryViewer 11/11 après relecture indépendante et correction du parcours Pause→Lire.
- Candidat : 270 suites / 4119 tests social-features ; 101 suites / 763 tests application ; 25 suites / 140 garde-fous réussis. Typage et lint des six workspaces ANTSIA réussis sans erreur ; avertissements historiques conservés.
- Build local Next 16.4.2 et TypeScript réussis. La vérification globale `bun run verify` du checkout partagé réussit aussi en 695,9 s (codegen, types, tests et lint des 11 paquets), avec les onze sources propres inchangées pendant son exécution. Elle inclut des travaux parallèles non publiés : elle est distincte du candidat figé. Les avertissements historiques de lint ne sont pas des erreurs.
- Aucune conversation n’existe dans ce compte : maintien du brouillon et de l’appel testé en régression unitaire, pas dans une conversation réelle en ligne. Les commandes Stories sont testées en composant ; aucune story existante n’était disponible. Aucun message, publication, story, appel, achat ou engagement commercial n'est créé pour cette recette. Les états métier absents du compte ne sont pas remplacés par de fausses données.

Les captures restent locales dans `docs/recette/responsive-en-ligne-2026-10-21/` ; seuls le bilan et les preuves structurées sans contenu privé sont destinés au commit. Logs et packaging : `Library/Caches/antsia-releases/20261021-responsive-recette/`.

## Publication et reprise après publication

- Branche `codex/recette-responsive-20261021` poussée : `a104de8` trace les 22 sources déjà publiées par la session graphique ; `5b89394` porte les onze corrections et leurs preuves. Les 2076 chemins techniques du candidat correspondent à l’arbre Git de cette livraison. Branche réelle `codex/pa4-identite-session`, HEAD et index partagés conservés.
- Version publique `responsive-recipe-20261021-5e87719d6f0eb0e7`, déploiement `dpl_H7tUFizo4AroUJ9XFgCUuCq4AdQH`, READY. Build hébergé réussi ; santé du candidat puis `https://antsia.vercel.app/api/sante-fonctionnelle` HTTP 200, `status=ok`, backend configuré et CSP de production vérifiés. La version de départ était toujours `7330c9399dbe6b9a` immédiatement avant promotion.
- Après publication : nouvel onglet membre ouvert normalement sur le fil et captures 390/834/1440, sans débordement. Page publique À propos aux trois formats et console sans avertissement ni erreur sur les onglets contrôlés. Cela complète 25 mesures avant publication et six après ; les captures privées restent locales.
- Deux Stories sont devenues disponibles depuis la recette parallèle : lecteur et commandes Précédente/Pause/Suivante rendus en ligne. La pause durable et la navigation de la série ne sont **pas déclarées validées en ligne** : retour au fil, puis nouvelle révocation du compte pendant la tentative de confirmation. Leurs régressions en composant restent vertes. Aucune Story créée, retirée ni modifiée par cette recette.
- La recette parallèle poursuit l’alternance des comptes réels et révoque leurs sessions ; elle empêche une campagne membre continue. Profil complet, conservation d’un vrai brouillon, appel et appareils physiques restent hors preuve. Aucun affaiblissement des gardes ni changement de cette autre recette pour obtenir une capture.

Preuves versionnées sans contenu privé : `docs/recette/responsive-en-ligne-2026-10-21/{validation,mesures-sans-contenu-prive,publication}.json`.
