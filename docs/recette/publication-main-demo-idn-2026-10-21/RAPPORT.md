# Conservation de /demo et des sessions avant publication de main

> Dépôt public : les identifiants internes d'hébergement (déploiements, projets, équipes, adresses techniques) sont tenus hors du dépôt ; ce document les désigne par leur rôle (EX-20, 10/11/2026).

Base : `31a7891e0329770fad79072811b9a9ec6a93de39`. Arbre de sources vérifié : `c1addf9c1160bbdb5b95acea6b5760884fc89ccc`.

Le main initial ne contenait pas le relais /demo et purgeait la reprise de session sur une erreur réseau sans statut. Cette intégration reprend les corrections déjà publiées pour les sessions IDN, la séparation des cookies et stockages, les liens et médias sous /demo, le catalogue illustratif et ses huit images. Les conteneurs bornés du fil et de la messagerie tiennent compte du bandeau démo. La garde de préparation du fil pendant la déconnexion, publiée parallèlement sous d76d559/0af6d49, est conservée.

Périmètre : 90 chemins de sources, tests et images ; hunks fonctionnels repris sur les styles de main. Références : 00d9fd9, 58de1eb, 71c7dac, 4191375, d76d559 et 0af6d49. Les PR19/20 restent distinctes. Aucun fichier Convex, environnement privé, thème ou manifeste de dépendances modifié.

## Validation complète

`bun run verify`, du 2026-10-21T09:43:03.552652+00:00 au 2026-10-21T09:51:41.637518+00:00 : code0, **14319 tests réussis**, 3 tests déjà ignorés, 12 espaces typés, 12 espaces testés, 11 lints, 0 erreur et 266 avertissements. Empreintes sources inchangées. Backend de codegen local isolé sur3220/3221 ; DIASPORALE depuis fab55ef. Le premier contrôle du jeton local de hauteur a échoué ; sa déclaration Tailwind locale a été corrigée, le cliquet ciblé et les sept tests de hauteur ont été rejoués, puis cette vérification complète a réussi.

La branche, HEAD et l'index réels du checkout partagé sont conservés. L'intégration utilise un index privé et des références commises ; aucun fichier de travail parallèle n'entre dans le commit.

## Publication et recette

Les constructions et la recette en ligne suivent la fusion de ce commit. Ce rapport ne les déclare pas effectuées. Les deux applications doivent être extraites du main fusionné, l'enfant protégé construit avant le principal, puis le principal promu après les contrôles de versions, CSP, HTML et images. URL publique de la démo : `/demo` du site principal. Ancienne adresse propre du projet de démonstration supprimée intentionnellement. Les backends déjà publiés restent en place. Aucun contenu social à publier.
