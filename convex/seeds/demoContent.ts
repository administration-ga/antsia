/**
 * Animation des comptes fictifs DÉJÀ inscrits par le parcours OTP.
 * Aucun compte, profil, consentement d'accueil, identité ou droit n'est créé ici.
 * Les clés sont stables ; un rejeu ne republie pas ce que son auteur a retiré.
 */
import { normalizeFamilyName, normalizeGivenNames } from "@antsia/social-domain/civilName"
import { missingConsentsToJoin } from "@antsia/social-domain/consent"
import { canonicalPair } from "@antsia/social-domain/connectionState"
import { assertHeadline, assertPersonalCommentBody, assertPostContent, type PersonalReactionKind } from "@antsia/social-domain/content"
import { assertPageHandle, assertPageName, normalizePageDescription, pageTrustRank } from "@antsia/social-domain/pages"
import type { ProvinceSlug } from "@antsia/social-domain/provinces"
import { assertStoryCaption, assertStoryMedia, storyExpiresAt, STORY_ACTIVE_PER_AUTHOR_MAX } from "@antsia/social-domain/stories"
import { normalizeSha256 } from "@antsia/social-domain/uploadPolicy"
import { v } from "convex/values"

import { components } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server"
import { getMembership, getRootNetwork } from "../lib/access"
import { checked, fail } from "../lib/errors"
import { assertFreshUpload, registerGeneratedBlob } from "../modules/files/admission"
import { followerCounts } from "../modules/graph/follows"
import { findConnection, isBlockedBetween } from "../modules/graph/graph"
import type { StoredMedia } from "../modules/media/media"
import { assertSocialWriteAllowed, contentState, moderateContentWrite } from "../modules/moderation/policy"
import { notifyPerson } from "../modules/notifications/notify"
import { assertPageHandleFree, pageSearchText } from "../modules/pages/access"
import { syncPersonDirectory } from "../modules/people/directory"
import { isDiscoverablePerson } from "../modules/people/miniProfile"
import { appendAudit } from "../modules/platform/audit"
import { applyReactionDelta, recordComment, recordPageFollower } from "../modules/posts/counters"
import { refreshReaderFeed } from "../modules/posts/feedMaterialization"
import { writePost } from "../modules/posts/postWrite"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "../modules/shops/rules"
import { assertDemoContentAllowed, DEMO_CONTENT_VERSION } from "./demoContentConfig"
import { DEMO_FIGURANTS, demoFigurantEmailOf } from "./demoFigurants"
import { demoMediaAsset } from "./demoMediaManifest"

type ReadCtx = Pick<QueryCtx, "db" | "runQuery">
export type Actor = "membre" | "verifie" | "presse" | "commercant" | "association" | "administration" | "moderateur"
type ActorSpec = { actor: Actor; handle: string; givenNames: string; familyName: string; originalHeadline: string; headline: string; asset: string; story: string }

/** L'identité est celle du catalogue OTP ; le huitième acteur, « nouveau », est exclu. */
export const DEMO_CONTENT_PERSONAS: readonly ActorSpec[] = [
  { actor: "membre", handle: "membre.demo", givenNames: "awa", familyName: "mba", originalHeadline: "Membre du réseau, à Libreville", headline: "Technicienne informatique à Libreville · Démo", asset: "service-informatique", story: "Démo · Une matinée à préparer un atelier informatique fictif." },
  { actor: "verifie", handle: "verifie.demo", givenNames: "jean-rémy", familyName: "ndong", originalHeadline: "Membre vérifié par IDN (démonstration)", headline: "Photographe et créateur à Libreville · Démo", asset: "service-photo", story: "Démo · Préparation d'une séance photo fictive au studio." },
  { actor: "presse", handle: "presse.demo", givenNames: "sylvie", familyName: "oyane", originalHeadline: "Journaliste à Gabon Actu Démo", headline: "Journaliste à Gabon Actu Démo · Actualités fictives", asset: "association-littoral", story: "Démo · Carnet de reportage fictif sur le littoral." },
  { actor: "commercant", handle: "commercant.demo", givenNames: "patrick", familyName: "moussavou", originalHeadline: "Commerçant à Owendo", headline: "Épicier à Owendo · Produits du quotidien · Démo", asset: "epicerie-produits", story: "Démo · Présentation fictive des produits de notre épicerie." },
  { actor: "association", handle: "association.demo", givenNames: "clarisse", familyName: "ella", originalHeadline: "Présidente d'une association de démonstration", headline: "Entraide et lecture à Lambaréné · Association Démo", asset: "association-lecture", story: "Démo · Des livres prêts pour notre rencontre fictive." },
  { actor: "administration", handle: "administration.demo", givenNames: "paul-henri", familyName: "nze", originalHeadline: "Agent de la Mairie Démo", headline: "Accueil et vie municipale · Mairie Démo fictive", asset: "association-littoral", story: "Démo · Un projet fictif de sensibilisation au cadre de vie." },
  { actor: "moderateur", handle: "moderation.demo", givenNames: "nadège", familyName: "koumba", originalHeadline: "Modératrice du réseau (démonstration)", headline: "Modératrice · Échanges respectueux et entraide · Démo", asset: "association-lecture", story: "Démo · Une pause lecture pour préparer un échange fictif." },
]

type PageSpec = { handle: string; actor: Actor; name: string; description: string; ownerKind: "media" | "company" | "association" | "institution"; trust: "verified" | "community" | "official"; asset: string; create?: true; model?: "products" | "quote_services" }
export const DEMO_CONTENT_PAGES: readonly PageSpec[] = [
  { handle: "gabon-actu-demo", actor: "presse", name: "Gabon Actu Démo", description: "Média fictif de démonstration : actualités locales et reportages.", ownerKind: "media", trust: "verified", asset: "association-littoral" },
  { handle: "epicerie-moussavou-demo", actor: "commercant", name: "Épicerie Moussavou Démo", description: "Boutique fictive de démonstration : produits du quotidien.", ownerKind: "company", trust: "community", asset: "epicerie-produits", model: "products" },
  { handle: "jeunes-lambarene-demo", actor: "association", name: "Jeunes de Lambaréné Démo", description: "Association fictive de démonstration : entraide et activités pour les jeunes.", ownerKind: "association", trust: "community", asset: "association-lecture" },
  { handle: "mairie-demo", actor: "administration", name: "Mairie Démo", description: "Institution fictive de démonstration : communiqués et services municipaux.", ownerKind: "institution", trust: "official", asset: "association-littoral" },
  { handle: "studio-objectif-demo", actor: "verifie", name: "Studio Objectif Démo", description: "Studio photo fictif de démonstration : portraits, produits et reportages à Libreville.", ownerKind: "company", trust: "community", asset: "service-photo", create: true, model: "quote_services" },
  { handle: "atelier-tech-demo", actor: "membre", name: "Atelier Tech Démo", description: "Atelier informatique fictif de démonstration : diagnostic, entretien et accompagnement à Libreville.", ownerKind: "company", trust: "community", asset: "service-informatique", create: true, model: "quote_services" },
]

type PostSpec = { key: string; actor: Actor; body: string; province: ProvinceSlug; page?: string; asset?: string; comment?: string }
/**
 * 42 publications personnelles et 10 publications de pages, explicitement fictives ;
 * 25 portent une image (illustration générée ou photo libre de droits).
 */
export const DEMO_CONTENT_POSTS: readonly PostSpec[] = [
  { key: "membre-atelier", actor: "membre", province: "estuaire", body: "Démo — À Libreville, je prépare un petit atelier fictif pour apprendre à entretenir son ordinateur : sauvegardes, rangement et mises à jour. Quel geste aimeriez-vous revoir ensemble ? #Estuaire #Informatique #Entraide" },
  { key: "membre-decouverte", actor: "membre", province: "haut-ogooue", body: "Démo — Dans notre carnet de voyage fictif, étape à Franceville : prendre le temps d'échanger avec les artisans et de découvrir leurs savoir-faire. Vos idées enrichissent cette conversation de démonstration. #HautOgooue #Decouverte" },
  { key: "verifie-creation", actor: "verifie", province: "estuaire", asset: "sac-wax", body: "Démo — Exercice photo fictif au studio : faire ressortir les couleurs d'un sac en wax, avec une lumière douce et un fond simple. L'image sert à illustrer notre réseau de démonstration. #Estuaire #Creation #Photo" },
  { key: "verifie-promenade", actor: "verifie", province: "ogooue-lolo", body: "Démo — Je compose un reportage imaginaire autour d'une promenade à Koulamoutou, entre paysage, rencontres et vie quotidienne. Ce récit fictif ouvre la discussion sur les regards que l'on porte sur nos provinces. #OgooueLolo #Photographie" },
  { key: "presse-carnet", actor: "presse", province: "ogooue-maritime", body: "Démo — Carnet de rédaction fictif : raconter une action citoyenne sur le littoral sans oublier celles et ceux qui y participent. Vérifier les faits et demander l'accord avant une photo restent de bonnes habitudes. #OgooueMaritime #VieLocale" },
  { key: "presse-lecture", actor: "presse", province: "woleu-ntem", body: "Démo — Notre sujet fictif du jour : les lieux de lecture et de rencontre à Oyem. Une bibliothèque, un club ou une initiative de quartier peuvent donner envie d'apprendre ensemble. #WoleuNtem #Lecture #Culture" },
  { key: "commercant-savon", actor: "commercant", province: "estuaire", asset: "savon-artisanal", body: "Démo — À l'épicerie fictive d'Owendo, nous préparons une présentation de savons artisanaux. Cette publication montre le quotidien d'une petite activité ; elle ne déclenche aucune commande ni aucun paiement. #Estuaire #Artisanat #CommerceLocal" },
  { key: "commercant-voisins", actor: "commercant", province: "nyanga", body: "Démo — Une idée pour notre boutique fictive : un carnet de recettes du quotidien, inspiré des échanges avec nos voisins de Tchibanga. Quelle recette familiale aimeriez-vous raconter ? #Nyanga #Cuisine #Partage" },
  { key: "association-littoral", actor: "association", province: "ogooue-maritime", asset: "association-littoral", body: "Démo — Notre association fictive imagine une sortie collective sur le littoral : observer, ramasser les déchets et discuter du cadre de vie. Il s'agit d'un scénario de démonstration, sans appel à une inscription réelle. #OgooueMaritime #Entraide #Environnement" },
  { key: "association-carnet", actor: "association", province: "moyen-ogooue", body: "Démo — À Lambaréné, nous préparons une rencontre de lecture fictive : chacun apporte un livre et raconte ce qu'il lui a donné envie de découvrir. Les petits groupes permettent à toutes les voix de trouver leur place. #MoyenOgooue #Lecture #Association" },
  { key: "administration-accueil", actor: "administration", province: "ngounie", body: "Démo — À la Mairie Démo, notre exercice fictif porte sur un accueil plus clair : expliquer les étapes, écouter la demande et orienter vers le bon interlocuteur. Ce compte ne représente aucune administration réelle. #Ngounie #Accueil #VieLocale" },
  { key: "administration-idees", actor: "administration", province: "estuaire", body: "Démo — Un espace vert bien entretenu peut devenir un lieu de rencontre. Pour ce scénario municipal fictif, nous échangeons sur l'ombre, les bancs et la propreté des chemins. Quelle idée choisiriez-vous en premier ? #Estuaire #CadreDeVie" },
  { key: "moderateur-bienvenue", actor: "moderateur", province: "ogooue-ivindo", body: "Démo — Bienvenue dans cet espace d'échanges fictifs. Pour aider quelqu'un, commençons par une question claire et une réponse respectueuse ; les désaccords peuvent rester courtois. #OgooueIvindo #Entraide #VieDuReseau" },
  { key: "moderateur-prudence", actor: "moderateur", province: "estuaire", body: "Démo — Petit rappel pour notre communauté de démonstration : demander l'accord avant de publier la photo d'une personne, garder ses coordonnées privées et signaler un contenu qui pose problème. #Estuaire #Respect #VieDuReseau" },
  { key: "page-presse", actor: "presse", page: "gabon-actu-demo", province: "ogooue-maritime", body: "Gabon Actu Démo — Dans ce reportage fictif, des habitants prennent soin du littoral et partagent leurs idées pour le préserver. Ce média de démonstration publie ici un exemple de récit local, sans actualité réelle annoncée. #OgooueMaritime #Environnement #VieLocale" },
  { key: "page-epicerie", actor: "commercant", page: "epicerie-moussavou-demo", province: "estuaire", asset: "epicerie-produits", body: "Épicerie Moussavou Démo — Présentation fictive de nos boissons au bissap et au gingembre, accompagnées d'une confiture d'ananas. Des images pour découvrir une vitrine de démonstration, sans vente réelle. #Estuaire #ProduitsLocaux #Epicerie" },
  { key: "page-association", actor: "association", page: "jeunes-lambarene-demo", province: "moyen-ogooue", asset: "association-lecture", body: "Jeunes de Lambaréné Démo — Notre cercle de lecture fictif réunit des jeunes autour de livres et d'histoires à partager. Cet exemple présente la vie d'une association de démonstration ; aucune rencontre réelle n'est programmée. #MoyenOgooue #Lecture #Jeunesse" },
  { key: "page-mairie", actor: "administration", page: "mairie-demo", province: "estuaire", body: "Mairie Démo — Exemple de communiqué fictif : prenons soin des espaces communs en prévoyant des points de collecte et des moments de sensibilisation. Cette page de démonstration ne diffuse aucune décision administrative réelle. #Estuaire #CadreDeVie #Commune" },
  { key: "page-studio", actor: "verifie", page: "studio-objectif-demo", province: "estuaire", asset: "service-photo", body: "Studio Objectif Démo — Portraits, photos de produits et petits reportages : notre studio fictif présente ici ses prestations sur devis. Les demandes servent uniquement à découvrir le parcours de démonstration, sans réservation ni facturation réelle. #Estuaire #Photographie #Services" },
  { key: "page-atelier", actor: "membre", page: "atelier-tech-demo", province: "estuaire", asset: "service-informatique", body: "Atelier Tech Démo — Diagnostic, entretien et accompagnement informatique : une activité fictive pour découvrir les prestations du réseau. Nous présentons un scénario de devis de démonstration, sans intervention ni paiement réel. #Estuaire #Informatique #Services" },
  { key: "page-panier", actor: "commercant", page: "epicerie-moussavou-demo", province: "estuaire", asset: "panier-raphia", body: "Épicerie Moussavou Démo — Un panier en raphia accompagne notre sélection fictive de produits du quotidien. Cette vitrine de démonstration met en valeur les matières et les savoir-faire ; aucun achat réel n'est proposé. #Estuaire #Raphia #Artisanat" },
  // Seconde vague (21/10) : quatre publications de plus par acteur, dont deux avec photo libre de droits.
  { key: "membre-carte-mere", actor: "membre", province: "estuaire", asset: "membre-reparation-portable", comment: "Démo — Merci pour le rappel des sauvegardes, je m'y mets ce soir.", body: "Démo — Matinée à l'atelier : une carte mère à nettoyer, un ventilateur à remplacer et un portable qui repart comme neuf. Avant de confier un ordinateur, pensez à sauvegarder vos fichiers ! #Estuaire #Informatique #Atelier" },
  { key: "membre-initiation", actor: "membre", province: "estuaire", asset: "membre-initiation-ordinateur", comment: "Démo — Belle initiative, ce genre de séance manque dans nos quartiers.", body: "Démo — Séance fictive d'initiation avec un voisin : créer une adresse e-mail, envoyer une photo à ses petits-enfants et choisir un mot de passe solide. Apprendre à tout âge, c'est possible. #Estuaire #Numerique #Entraide" },
  { key: "membre-mots-de-passe", actor: "membre", province: "estuaire", comment: "Démo — Un gestionnaire de mots de passe, et plus besoin de tout retenir.", body: "Démo — Astuce du jour : un mot de passe différent pour chaque compte, et la double vérification dès que possible. Vous utilisez un gestionnaire de mots de passe ? #Securite #Numerique" },
  { key: "membre-ateliers", actor: "membre", province: "estuaire", comment: "Démo — La réparation de téléphone, sans hésiter !", body: "Démo — Question à la communauté : quels ateliers aimeriez-vous voir à Libreville ce trimestre ? Bureautique, réparation de téléphone, création de site ? Je note toutes vos idées. #Estuaire #Ateliers" },
  { key: "verifie-lumiere", actor: "verifie", province: "estuaire", asset: "verifie-photographe-exterieur", comment: "Démo — La bonne humeur se voit aussi dans tes photos.", body: "Démo — Pause entre deux prises de vue en extérieur. La lumière de fin d'après-midi reste ma préférée pour les portraits : douce, chaude, généreuse. #Estuaire #Photographie #Portrait" },
  { key: "verifie-studio-pret", actor: "verifie", province: "estuaire", asset: "verifie-studio-eclairage", comment: "Démo — Le studio a l'air vraiment bien équipé.", body: "Démo — Le studio est prêt pour les séances de la semaine : deux boîtes à lumière, un fond clair et beaucoup de patience. Les demandes fictives passent par la page du studio. #Estuaire #Studio #Photo" },
  { key: "verifie-astuce", actor: "verifie", province: "estuaire", comment: "Démo — Testé tout de suite : la différence est nette.", body: "Démo — Conseil photo du jour : avec un téléphone, nettoyez l'objectif, reculez d'un pas et touchez l'écran sur le visage pour régler la lumière. Trois gestes, et vos portraits changent. #Photographie #Astuce" },
  { key: "verifie-marches", actor: "verifie", province: "moyen-ogooue", comment: "Démo — Le marché de Lambaréné le samedi matin, sans hésiter.", body: "Démo — Je prépare une petite exposition fictive sur les marchés de nos provinces : visages, couleurs, gestes du quotidien. Quel marché devrais-je absolument photographier ? #Photographie #Marches" },
  { key: "presse-point-presse", actor: "presse", province: "estuaire", asset: "presse-interview-micros", comment: "Démo — Recouper, toujours recouper. Merci de le rappeler.", body: "Démo — Point presse fictif ce matin : micros tendus, questions précises et réponses à vérifier. Le vrai travail commence ensuite, au moment de recouper. #Estuaire #Journalisme #Information" },
  { key: "presse-redaction", actor: "presse", province: "estuaire", asset: "presse-carnet-redaction", comment: "Démo — Le carnet papier reste imbattable sur le terrain.", body: "Démo — Journée de rédaction : les notes du terrain d'un côté, l'ordinateur de l'autre. Un bon article tient souvent dans un carnet bien tenu. #Estuaire #Redaction" },
  { key: "presse-verifier", actor: "presse", province: "ogooue-maritime", comment: "Démo — Trois questions simples, à retenir.", body: "Démo — Avant de partager une information, trois questions : qui la publie, de quand date-t-elle, et d'autres sources la confirment-elles ? Un réflexe simple contre les fausses nouvelles. #Information #EspritCritique" },
  { key: "presse-temoignages", actor: "presse", province: "ogooue-maritime", comment: "Démo — Mon oncle répare des pirogues, je lui transmets.", body: "Démo — Pour un reportage fictif sur les métiers de la mer à Port-Gentil, je cherche des témoignages : pêcheurs, mareyeuses, réparateurs de pirogues. Écrivez-moi en message. #OgooueMaritime #Reportage" },
  { key: "commercant-rayons", actor: "commercant", province: "estuaire", asset: "commercant-epicerie-rayons", comment: "Démo — Toujours bien accueilli chez vous.", body: "Démo — Les rayons sont remplis pour la semaine : riz, huile, conserves et produits d'entretien. Merci aux voisins fidèles de notre épicerie fictive d'Owendo ! #Estuaire #CommerceLocal #Epicerie" },
  { key: "commercant-tomates", actor: "commercant", province: "estuaire", asset: "commercant-etal-tomates", comment: "Démo — Parfaites pour une bonne sauce ce soir.", body: "Démo — Arrivage fictif de tomates du marché ce matin, bien rouges et bien fermes. Elles partent vite : pensez à les réserver par message. #Estuaire #ProduitsFrais #Marche" },
  { key: "commercant-horaires", actor: "commercant", province: "estuaire", comment: "Démo — Pratique, le dimanche matin.", body: "Démo — Rappel pour notre épicerie fictive : ouverture de 7 h à 20 h du lundi au samedi, et le dimanche matin jusqu'à 13 h. #Estuaire #Epicerie" },
  { key: "commercant-recette", actor: "commercant", province: "estuaire", comment: "Démo — Chez nous, on ajoute un peu de piment frais.", body: "Démo — Recette du dimanche : poisson fumé à la sauce d'arachide, avec du manioc ou des bananes plantain. Qui a une variante familiale à partager ? #Cuisine #Recette" },
  { key: "association-plantation", actor: "association", province: "moyen-ogooue", asset: "association-plantation", comment: "Démo — Quelle belle idée de donner un prénom à chaque plant.", body: "Démo — Matinée de plantation fictive avec les jeunes de l'association : chaque plant porte le prénom de celui ou celle qui l'a mis en terre. Rendez-vous dans un an pour les voir grandir ! #MoyenOgooue #Environnement #Jeunesse" },
  { key: "association-assemblee", actor: "association", province: "moyen-ogooue", asset: "association-reunion-arbre", comment: "Démo — Bravo pour la participation, c'est encourageant.", body: "Démo — Assemblée sous le grand arbre : bilan de l'année, projets de lecture et nouvelle équipe d'animation. Merci à toutes celles et tous ceux qui sont venus. #MoyenOgooue #VieAssociative" },
  { key: "association-livres", actor: "association", province: "moyen-ogooue", comment: "Démo — J'ai deux cartons de bandes dessinées à vous apporter.", body: "Démo — Collecte fictive de livres pour notre coin lecture : romans, bandes dessinées, manuels scolaires. Tout livre en bon état trouvera un lecteur à Lambaréné. #MoyenOgooue #Lecture #Solidarite" },
  { key: "association-benevoles", actor: "association", province: "moyen-ogooue", comment: "Démo — Je peux venir un mercredi sur deux.", body: "Démo — Nous cherchons des bénévoles pour accompagner l'aide aux devoirs le mercredi après-midi. Une heure par semaine suffit à faire la différence. #MoyenOgooue #Benevolat" },
  { key: "administration-facade", actor: "administration", province: "estuaire", asset: "administration-batiment", comment: "Démo — Le bâtiment a fière allure, bravo aux équipes.", body: "Démo — Les travaux fictifs de rénovation de la façade de la Mairie Démo sont terminés. L'accueil du public reprend normalement dès lundi. #Estuaire #VieMunicipale" },
  { key: "administration-conseil", actor: "administration", province: "estuaire", asset: "administration-seance-micro", comment: "Démo — Merci pour la transparence sur l'ordre du jour.", body: "Démo — Séance fictive du conseil municipal : espaces verts, éclairage public et propreté des marchés à l'ordre du jour. Le compte rendu sera publié sur la page de la mairie. #Estuaire #ConseilMunicipal" },
  { key: "administration-etat-civil", actor: "administration", province: "estuaire", comment: "Démo — Merci, c'est plus clair ainsi.", body: "Démo — Pour une demande d'acte de naissance dans ce scénario fictif, munissez-vous d'une pièce d'identité et des références de l'acte. Le service vous oriente si un document manque. #Estuaire #Demarches" },
  { key: "administration-encombrants", actor: "administration", province: "estuaire", comment: "Démo — Enfin une date pour les encombrants, merci.", body: "Démo — Collecte fictive des encombrants samedi matin dans les quartiers nord. Merci de déposer vos objets la veille au soir, sans gêner la circulation. #Estuaire #CadreDeVie" },
  { key: "moderateur-cafe", actor: "moderateur", province: "estuaire", asset: "moderateur-cafe-ordinateur", comment: "Démo — Merci pour ce travail souvent invisible.", body: "Démo — Petite séance de modération depuis un café : lire, comprendre le contexte, puis décider avec mesure. Une communauté se construit aussi par ces gestes discrets. #Estuaire #VieDuReseau" },
  { key: "moderateur-lecture", actor: "moderateur", province: "ogooue-ivindo", asset: "moderateur-lecture-telephone", comment: "Démo — Tellement vrai, on gagnerait tous à le faire.", body: "Démo — Lire une discussion jusqu'au bout avant de réagir : c'est souvent là que les malentendus se dissipent. #OgooueIvindo #VieDuReseau #Respect" },
  { key: "moderateur-signaler", actor: "moderateur", province: "estuaire", comment: "Démo — Bon à savoir, merci.", body: "Démo — Un contenu vous semble déplacé ? Ouvrez le menu de la publication et signalez-le en indiquant la raison. Chaque signalement est relu avec attention. #VieDuReseau #Securite" },
  { key: "moderateur-desaccord", actor: "moderateur", province: "estuaire", comment: "Démo — À afficher dans tous les groupes !", body: "Démo — Rappel bienveillant : on peut être en désaccord sans blesser. Critiquer une idée, jamais une personne. #VieDuReseau #Entraide" },
  { key: "page-epicerie-poisson", actor: "commercant", page: "epicerie-moussavou-demo", province: "estuaire", asset: "produit-poisson-fume", comment: "Démo — Le poisson fumé au feu de bois, il n'y a rien de meilleur.", body: "Épicerie Moussavou Démo — Le poisson fumé de la semaine est arrivé, préparé au feu de bois selon la tradition. Vitrine de démonstration : aucune vente réelle. #Estuaire #ProduitsLocaux" },
  { key: "page-studio-mariage", actor: "verifie", page: "studio-objectif-demo", province: "estuaire", asset: "photo-mariage", comment: "Démo — Des images pleines d'émotion, bravo.", body: "Studio Objectif Démo — Retour en images sur un mariage fictif : la première danse, les rires et les familles réunies. Les reportages de mariage se demandent sur devis. #Estuaire #Mariage #Photographie" },
  { key: "page-atelier-formation", actor: "membre", page: "atelier-tech-demo", province: "estuaire", asset: "info-formation", comment: "Démo — Une formation comme celle-ci aiderait toute mon équipe.", body: "Atelier Tech Démo — Formation fictive aux outils bureautiques pour une petite entreprise : traitement de texte, tableur et partage de documents. Une session de démonstration, sans inscription réelle. #Estuaire #Formation #Informatique" },
]

const COMMENTS = [
  "Démo — Un atelier en petit groupe permettrait de poser ses questions tranquillement.",
  "Démo — Prendre le temps d'écouter les artisans donnerait une belle place à leurs récits.",
  "Démo — La lumière douce fait bien ressortir les détails de cette création fictive.",
  "Démo — J'aimerais découvrir les paysages à travers ce carnet imaginaire.",
  "Démo — Expliquer comment un reportage se prépare rend la démarche plus claire.",
  "Démo — Un club de lecture donnerait envie de partager nos découvertes.",
  "Démo — Cette présentation fictive aide à imaginer la vie d'une petite boutique.",
  "Démo — Les recettes transmises en famille racontent aussi notre quotidien.",
  "Démo — Prévoir le tri dès le départ rendrait cette sortie fictive plus utile.",
  "Démo — Chacun pourrait proposer un livre et expliquer son choix.",
  "Démo — Des étapes expliquées simplement faciliteraient cet accueil fictif.",
  "Démo — L'ombre et des chemins propres seraient un bon début pour ce scénario.",
] as const

type FigurantPostSpec = { key: string; slot: number; body: string; asset?: string; comment: string }
/** Deux publications par figurant ; le pêcheur et le chauffeur publient une photo. */
export const DEMO_FIGURANT_POSTS: readonly FigurantPostSpec[] = [
  { key: "figurant-1-site", slot: 1, comment: "Démo — Bravo Kévin, le catalogue est très clair.", body: "Démo — Premier site mis en ligne pour une petite boutique de quartier : un catalogue simple, des photos nettes et un bouton pour écrire au vendeur. Fier du résultat ! #Estuaire #Web" },
  { key: "figurant-1-entraide", slot: 1, comment: "Démo — Partante pour animer une séance sur la sécurité.", body: "Démo — Qui serait partant pour un groupe d'entraide entre développeurs de Libreville ? Partage de code, conseils et petits défis chaque mois. #Estuaire #Developpement" },
  { key: "figurant-2-pagne", slot: 2, comment: "Démo — Les couleurs sont magnifiques.", body: "Démo — Nouvelle série de tenues en pagne pour les fêtes de fin d'année. Les commandes se prennent à l'atelier de Port-Gentil, sur mesure comme toujours. #OgooueMaritime #Couture" },
  { key: "figurant-2-merci", slot: 2, comment: "Démo — Une jolie façon de parler de son métier.", body: "Démo — Merci à toutes mes clientes pour leur fidélité. Coudre une robe, c'est aussi écouter une histoire. #OgooueMaritime #Artisanat" },
  { key: "figurant-3-transmettre", slot: 3, comment: "Démo — Merci pour toutes ces années au service des élèves.", body: "Démo — Quarante ans d'enseignement à Mouila, et toujours la même joie de croiser d'anciens élèves devenus parents. Transmettre reste le plus beau des métiers. #Ngounie #Education" },
  { key: "figurant-3-soutien", slot: 3, comment: "Démo — Une belle initiative pour les collégiens.", body: "Démo — Je propose des cours de soutien en mathématiques le samedi matin, pour les collégiens du quartier. Bénévolement, bien sûr. #Ngounie #Soutien" },
  { key: "figurant-4-garde", slot: 4, comment: "Démo — Merci pour ces conseils, et bon repos.", body: "Démo — Après une longue garde, un rappel simple : buvez de l'eau, dormez suffisamment et consultez si la fièvre dure. Prenez soin de vous. #WoleuNtem #Sante" },
  { key: "figurant-4-equipe", slot: 4, comment: "Démo — Bravo à toute l'équipe de nuit.", body: "Démo — Merci à l'équipe de nuit pour sa solidarité cette semaine. Ensemble, on tient. #WoleuNtem #Soignants" },
  { key: "figurant-5-veillee", slot: 5, comment: "Démo — Les enfants vont adorer cette veillée.", body: "Démo — Ce soir, veillée de contes avec les enfants du quartier à Tchibanga : la tortue, le léopard et la ruse qui gagne toujours. #Nyanga #Contes #Tradition" },
  { key: "figurant-5-memoire", slot: 5, comment: "Démo — Il faudrait enregistrer ces contes pour les garder.", body: "Démo — Nos histoires se transmettent de bouche à oreille. Racontez-les à vos petits-enfants : elles vivront encore longtemps. #Nyanga #Memoire" },
  { key: "figurant-6-filet", slot: 6, asset: "paysage-pecheur-lac", comment: "Démo — Quelle image, on sent tout le savoir-faire.", body: "Démo — Debout avant l'aube, filet lancé au bon moment : l'eau se respecte et nourrit ceux qui la connaissent. #Nyanga #Peche" },
  { key: "figurant-6-partage", slot: 6, comment: "Démo — Le partage avec les voisins, c'est ça la vraie richesse.", body: "Démo — Belle prise ce matin, partagée avec les voisins. À Mayumba, la pêche reste une affaire de famille. #Nyanga #Mer" },
  { key: "figurant-7-tresses", slot: 7, comment: "Démo — Je prends rendez-vous pour la semaine prochaine.", body: "Démo — Nouvelles tresses, nouveaux styles : le salon vous accueille du mardi au samedi à Libreville, de préférence sur rendez-vous. #Estuaire #Coiffure" },
  { key: "figurant-7-conseil", slot: 7, comment: "Démo — Merci pour l'astuce !", body: "Démo — Conseil du jour : hydrater ses cheveux régulièrement, surtout pendant la saison sèche. #Estuaire #Beaute" },
  { key: "figurant-8-partiels", slot: 8, comment: "Démo — Courage pour la dernière ligne droite !", body: "Démo — Fin des partiels à Franceville ! Une pensée pour tous les étudiants qui révisent encore. Courage, on y est presque. #HautOgooue #Etudes" },
  { key: "figurant-8-lecture", slot: 8, comment: "Démo — Passez à la bibliothèque de l'université, ils en ont plusieurs.", body: "Démo — Quelqu'un connaît un bon ouvrage d'introduction au droit administratif ? Toutes les suggestions sont bienvenues. #HautOgooue #Droit" },
  { key: "figurant-9-expose", slot: 9, comment: "Démo — Tu vas assurer, bonne chance !", body: "Démo — Exposé sur la gestion d'une petite entreprise demain matin. Le stress monte, mais la préparation est solide ! #Estuaire #Etudes" },
  { key: "figurant-9-merci", slot: 9, comment: "Démo — Avec plaisir, à la prochaine séance !", body: "Démo — Merci à l'Atelier Tech pour la séance de samedi : j'ai enfin compris les tableaux croisés dynamiques. #Estuaire #Formation" },
  { key: "figurant-10-trafic", slot: 10, asset: "paysage-rue-animee", comment: "Démo — Bon courage dans les embouteillages !", body: "Démo — Owendo – Libreville aux heures de pointe : patience et bonne humeur restent les meilleurs passagers. #Estuaire #Taxi" },
  { key: "figurant-10-objet-trouve", slot: 10, comment: "Démo — Bel exemple d'honnêteté, bravo.", body: "Démo — Un passager a oublié son téléphone dans mon taxi ce matin. Je l'ai déposé à l'accueil de la Mairie Démo. #Estuaire #Entraide" },
]

type FigurantTies = { friends: readonly Actor[]; figurantFriends: readonly number[]; requests: readonly Actor[]; requestedBy: readonly Actor[]; comment: string }
/**
 * Le graphe des figurants, posé UNE fois (à leur première publication) :
 * relations acceptées, demandes reçues par les acteurs (`requests`), demandes envoyées
 * par les acteurs (`requestedBy`) ; les figurants sans lien deviennent des suggestions.
 * `figurantFriends` ne nomme que des figurants de rang inférieur.
 */
export const DEMO_FIGURANT_TIES: Readonly<Record<number, FigurantTies>> = {
  1: { friends: ["membre", "verifie"], figurantFriends: [], requests: ["presse"], requestedBy: [], comment: "Démo — Je viendrai à l'atelier avec mon vieux portable !" },
  2: { friends: ["commercant", "association"], figurantFriends: [], requests: ["membre"], requestedBy: [], comment: "Démo — Je passe à l'épicerie ce week-end." },
  3: { friends: ["association", "administration"], figurantFriends: [2], requests: ["moderateur"], requestedBy: ["membre"], comment: "Démo — Une belle sortie, on devrait en organiser partout." },
  4: { friends: ["membre", "moderateur"], figurantFriends: [3], requests: ["verifie"], requestedBy: [], comment: "Démo — Très utile, merci pour ce partage." },
  5: { friends: ["association", "presse"], figurantFriends: [3, 4], requests: ["membre"], requestedBy: ["commercant"], comment: "Démo — Je connais de belles histoires sur le littoral." },
  6: { friends: ["commercant", "presse"], figurantFriends: [5], requests: ["administration"], requestedBy: [], comment: "Démo — Je garde une place pour ces savons dans mon panier." },
  7: { friends: ["verifie", "commercant"], figurantFriends: [1], requests: ["membre", "association"], requestedBy: [], comment: "Démo — Les couleurs du wax ressortent à merveille." },
  8: { friends: ["administration", "moderateur"], figurantFriends: [], requests: ["commercant"], requestedBy: ["presse"], comment: "Démo — Merci pour ces informations claires." },
  9: { friends: ["membre", "presse"], figurantFriends: [1, 7], requests: ["administration"], requestedBy: ["verifie"], comment: "Démo — J'ai appris plein de choses grâce à vous." },
  10: { friends: ["commercant", "administration"], figurantFriends: [6, 7], requests: ["verifie", "moderateur"], requestedBy: [], comment: "Démo — Je passe souvent devant, c'est toujours accueillant." },
}

const REACTION_KINDS: readonly PersonalReactionKind[] = ["like", "bravo", "soutien", "instructif"]

function postKey(spec: { key: string }): string { return `${DEMO_CONTENT_VERSION}:post:${spec.key}` }
function storyKey(actor: Actor, now: number): string { return `${DEMO_CONTENT_VERSION}:story:${actor}:${new Date(now).toISOString().slice(0, 10)}` }

function expectedName(spec: { givenNames: string; familyName: string }): string {
  return `${normalizeGivenNames(spec.givenNames)} ${normalizeFamilyName(spec.familyName)}`
}

async function publishedState(ctx: Pick<QueryCtx, "db">, kind: "person" | "page" | "post" | "story", id: string): Promise<boolean> {
  const state = await contentState(ctx, kind, id)
  return state === null || state.status === "published"
}

/** Adresse réservée vérifiée, adhésion vivante, consentements et profil publiés : rien n'est réparé ici. */
async function eligiblePerson(ctx: ReadCtx, root: Doc<"networks">, handle: string, displayName: string, email: string): Promise<Doc<"persons"> | null> {
  const person = await ctx.db.query("persons").withIndex("by_handle", q => q.eq("handle", handle)).unique()
  if (!person || !isDiscoverablePerson(person) || person.displayName !== displayName) return null
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user", where: [{ field: "_id", value: person.authUserId }], select: ["_id", "email", "emailVerified"],
  }) as { _id: string; email: string; emailVerified?: boolean } | null
  if (!user || user._id !== person.authUserId || user.emailVerified !== true || user.email !== email) return null
  const membership = await getMembership(ctx, root._id, person._id)
  if (!membership || (membership.status !== "declaree" && membership.status !== "verifiee") || membership.leftAt !== undefined) return null
  const consents = await ctx.db.query("consents").withIndex("by_person_and_purpose", q => q.eq("personId", person._id)).take(101)
  if (consents.length > 100 || missingConsentsToJoin(consents).length > 0 || !await publishedState(ctx, "person", person._id)) return null
  return person
}

/** Toutes les préconditions sont relues AVANT la première écriture. */
export async function demoContext(ctx: ReadCtx, confirmation: string) {
  assertDemoContentAllowed(confirmation)
  const root = await getRootNetwork(ctx)
  if (!root || root.slug !== "antsia" || root.kind !== "root" || root.status !== "active" || root.managedBy !== undefined) return fail("policyRefused")
  const people = new Map<Actor, Doc<"persons">>()
  for (const spec of DEMO_CONTENT_PERSONAS) {
    const person = await eligiblePerson(ctx, root, spec.handle, expectedName(spec), `${spec.actor}@demo.antsia.test`)
    if (!person) return fail("policyRefused")
    await assertSocialWriteAllowed(ctx, root._id, person._id)
    people.set(spec.actor, person)
  }
  return { root, people }
}

/** Les figurants prêts (inscrits par OTP, publiés, membres) ; un figurant absent est simplement ignoré. */
export async function readyFigurants(ctx: ReadCtx, root: Doc<"networks">): Promise<Map<number, Doc<"persons">>> {
  const ready = new Map<number, Doc<"persons">>()
  for (const figurant of DEMO_FIGURANTS) {
    const person = await eligiblePerson(ctx, root, figurant.handle, expectedName(figurant), demoFigurantEmailOf(figurant.slot))
    if (!person) continue
    try {
      await assertSocialWriteAllowed(ctx, root._id, person._id)
    } catch {
      continue
    }
    ready.set(figurant.slot, person)
  }
  return ready
}

export function actorPerson(people: Map<Actor, Doc<"persons">>, actor: Actor): Doc<"persons"> {
  const person = people.get(actor)
  if (!person) throw new Error("Acteur de démonstration absent.")
  return person
}

/** Une page éditée, retirée ou dont l'administration a été révoquée n'est pas reprise. */
async function availablePage(ctx: Pick<QueryCtx, "db">, root: Doc<"networks">, person: Doc<"persons">, spec: PageSpec): Promise<Doc<"pages"> | null> {
  const page = await ctx.db.query("pages").withIndex("by_handle", q => q.eq("handle", spec.handle)).unique()
  if (!page) return null
  if (page.networkId !== root._id || page.createdByPersonId !== person._id) return fail("conflict")
  if (page.status !== "active" || page.deactivatedAt !== undefined || page.name !== spec.name || page.description !== spec.description || page.ownerKind !== spec.ownerKind || !await publishedState(ctx, "page", page._id)) return null
  const signatory = await ctx.db.query("pageSignatories").withIndex("by_page_person", q => q.eq("pageId", page._id).eq("personId", person._id)).unique()
  return signatory?.role === "admin" && signatory.acceptedAt !== undefined ? page : null
}

export async function livePages(ctx: Pick<QueryCtx, "db">, root: Doc<"networks">, people: Map<Actor, Doc<"persons">>): Promise<Map<string, Doc<"pages">>> {
  const pages = new Map<string, Doc<"pages">>()
  for (const spec of DEMO_CONTENT_PAGES) {
    const page = await availablePage(ctx, root, actorPerson(people, spec.actor), spec)
    if (page) pages.set(spec.handle, page)
  }
  return pages
}

async function ensurePages(ctx: MutationCtx, root: Doc<"networks">, people: Map<Actor, Doc<"persons">>): Promise<Map<string, Doc<"pages">>> {
  for (const spec of DEMO_CONTENT_PAGES) {
    const person = actorPerson(people, spec.actor)
    const existing = await ctx.db.query("pages").withIndex("by_handle", q => q.eq("handle", spec.handle)).unique()
    if (!existing && spec.create) {
      const handle = checked(() => assertPageHandle(spec.handle))
      await assertPageHandleFree(ctx, handle)
      const name = checked(() => assertPageName(spec.name))
      const description = checked(() => normalizePageDescription(spec.description))
      const now = Date.now()
      const pageId = await ctx.db.insert("pages", { networkId: root._id, handle, name, description, ownerKind: spec.ownerKind, trust: spec.trust, trustRank: pageTrustRank(spec.trust), country: "GA", city: "Libreville", visibility: "root", onRoot: true, status: "active", createdByPersonId: person._id, searchText: pageSearchText({ name, handle }), createdAt: now, updatedAt: now })
      await ctx.db.insert("pageSignatories", { networkId: root._id, pageId, personId: person._id, role: "admin", acceptedAt: now, createdAt: now, updatedAt: now })
      await moderateContentWrite(ctx, { networkId: root._id, ownerPersonId: person._id, kind: "page", id: pageId, text: `${name} ${description ?? ""}` })
    }
  }
  return await livePages(ctx, root, people)
}

/** Le propriétaire a explicitement demandé l'animation publique de ces boutiques fictives. */
async function ensureShops(ctx: MutationCtx, root: Doc<"networks">, people: Map<Actor, Doc<"persons">>, pages: Map<string, Doc<"pages">>): Promise<void> {
  for (const spec of DEMO_CONTENT_PAGES) {
    const page = pages.get(spec.handle)
    if (!page || !spec.model) continue
    const person = actorPerson(people, spec.actor)
    const existing = await ctx.db.query("shops").withIndex("by_page", q => q.eq("pageId", page._id)).unique()
    if (existing) {
      if (existing.networkId !== root._id || existing.model !== spec.model || (existing.preparedByPersonId !== person._id && existing.ownerPersonId !== person._id)) return fail("conflict")
      // Un retrait de vitrine ou de consentement n'est jamais annulé par le rejeu.
      if (existing.storefront !== "published" || existing.publicConsentRevokedAt !== undefined || existing.publicConsentAt !== undefined) continue
      await ctx.db.patch(existing._id, { publicConsentAt: Date.now(), publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: person._id, updatedAt: Date.now() })
      continue
    }
    // Seules les deux NOUVELLES pages de services reçoivent une nouvelle boutique.
    if (!spec.create) continue
    const now = Date.now()
    const shopId = await ctx.db.insert("shops", { networkId: root._id, preparedByPersonId: person._id, pageId: page._id, model: spec.model, storefront: "published", requestedAt: now, decidedAt: now, publishedAt: now, visibility: "root", publicConsentAt: now, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: person._id, createdAt: now, updatedAt: now })
    await appendAudit(ctx, { action: "shop.storefront_decide", capacity: "system", networkId: root._id, subject: { table: "shops", id: shopId }, details: { reason: "Animation explicitement demandée des seules activités fictives de démonstration.", decision: "published", version: DEMO_CONTENT_VERSION } })
  }
}

/** Relation acceptée posée une fois ; une ligne existante (refus, annulation, blocage) n'est jamais reprise. */
async function connectOnce(ctx: MutationCtx, root: Doc<"networks">, from: Id<"persons">, to: Id<"persons">, status: "accepted" | "requested"): Promise<boolean> {
  if (from === to || await isBlockedBetween(ctx, from, to) || await findConnection(ctx, root._id, from, to)) return false
  const pair = canonicalPair(from, to)
  const now = Date.now()
  const connectionId = await ctx.db.insert("connections", { networkId: root._id, personIdLow: pair.low, personIdHigh: pair.high, requestedByPersonId: from, recipientPersonId: to, status, requestedAt: now, ...(status === "accepted" ? { respondedAt: now } : {}), updatedAt: now })
  // Une demande en attente arrive dans la cloche du destinataire, comme une demande ordinaire.
  if (status === "requested") await notifyPerson(ctx, { networkId: root._id, recipientPersonId: to, actorPersonId: from, kind: "connection_request", subject: { connection: connectionId } })
  return true
}

async function followOnce(ctx: MutationCtx, root: Doc<"networks">, follower: Id<"persons">, target: Id<"persons">): Promise<boolean> {
  if (follower === target || await isBlockedBetween(ctx, follower, target)) return false
  const existing = await ctx.db.query("follows").withIndex("by_network_follower_target", q => q.eq("networkId", root._id).eq("followerPersonId", follower).eq("targetPersonId", target)).unique()
  if (existing) return false
  const id = await ctx.db.insert("follows", { networkId: root._id, followerPersonId: follower, targetPersonId: target, createdAt: Date.now() })
  const row = await ctx.db.get(id)
  if (row) await followerCounts.insert(ctx, row)
  return true
}

async function followPageOnce(ctx: MutationCtx, root: Doc<"networks">, page: Doc<"pages">, personId: Id<"persons">): Promise<boolean> {
  const existing = await ctx.db.query("pageFollows").withIndex("by_page_person", q => q.eq("pageId", page._id).eq("personId", personId)).unique()
  if (existing || (page.createdByPersonId && await isBlockedBetween(ctx, personId, page.createdByPersonId))) return false
  const createdAt = Date.now()
  const id = await ctx.db.insert("pageFollows", { networkId: root._id, pageId: page._id, personId, createdAt })
  await recordPageFollower(ctx, { _id: id, pageId: page._id, createdAt })
  return true
}

/** Graphe initial seulement : le rejeu respecte ensuite désabonnements et ruptures. */
async function seedGraph(ctx: MutationCtx, root: Doc<"networks">, people: Map<Actor, Doc<"persons">>, pages: Map<string, Doc<"pages">>): Promise<void> {
  for (let index = 0; index < DEMO_CONTENT_PERSONAS.length; index += 1) {
    const source = DEMO_CONTENT_PERSONAS[index]
    const next = DEMO_CONTENT_PERSONAS[(index + 1) % DEMO_CONTENT_PERSONAS.length]
    const second = DEMO_CONTENT_PERSONAS[(index + 2) % DEMO_CONTENT_PERSONAS.length]
    if (!source || !next || !second) continue
    const person = actorPerson(people, source.actor)
    await connectOnce(ctx, root, person._id, actorPerson(people, next.actor)._id, "accepted")
    for (const targetSpec of [next, second]) await followOnce(ctx, root, person._id, actorPerson(people, targetSpec.actor)._id)
    for (const page of pages.values()) await followPageOnce(ctx, root, page, person._id)
  }
}

/** Une réaction par personne et par publication ; un blocage ou une réaction existante l'empêche. */
async function reactOnce(ctx: MutationCtx, root: Doc<"networks">, postId: Id<"posts">, personId: Id<"persons">, ownerId: Id<"persons">, kind: PersonalReactionKind): Promise<boolean> {
  if (personId === ownerId || await isBlockedBetween(ctx, personId, ownerId)) return false
  const existing = await ctx.db.query("postReactions").withIndex("by_post_and_person", q => q.eq("postId", postId).eq("personId", personId)).unique()
  if (existing) return false
  await ctx.db.insert("postReactions", { networkId: root._id, postId, personId, kind, createdAt: Date.now() })
  await applyReactionDelta(ctx, postId, personId, kind, 1)
  return true
}

async function commentOnce(ctx: MutationCtx, root: Doc<"networks">, postId: Id<"posts">, personId: Id<"persons">, ownerId: Id<"persons">, text: string): Promise<boolean> {
  if (await isBlockedBetween(ctx, personId, ownerId)) return false
  const body = checked(() => assertPersonalCommentBody(text))
  const now = Date.now()
  const commentId = await ctx.db.insert("postComments", { networkId: root._id, postId, authorPersonId: personId, body, status: "published", createdAt: now, updatedAt: now })
  const admitted = await moderateContentWrite(ctx, { networkId: root._id, ownerPersonId: personId, kind: "comment", id: commentId, text: body })
  if (admitted) await recordComment(ctx, { _id: commentId, postId, createdAt: now })
  return true
}

async function engageNewPost(ctx: MutationCtx, root: Doc<"networks">, people: Map<Actor, Doc<"persons">>, spec: PostSpec, postId: Id<"posts">, slot: number): Promise<{ comments: number; reactions: number }> {
  if (!await publishedState(ctx, "post", postId)) return { comments: 0, reactions: 0 }
  const ownerIndex = DEMO_CONTENT_PERSONAS.findIndex(person => person.actor === spec.actor)
  const owner = actorPerson(people, spec.actor)
  let reactions = 0
  for (let offset = 1; offset <= 2; offset += 1) {
    const actor = DEMO_CONTENT_PERSONAS[(ownerIndex + offset) % DEMO_CONTENT_PERSONAS.length]
    if (!actor) continue
    const kind = offset === 1 ? "like" as const : REACTION_KINDS[1 + slot % 3] ?? "bravo"
    if (await reactOnce(ctx, root, postId, actorPerson(people, actor.actor)._id, owner._id, kind)) reactions += 1
  }
  const text = spec.comment ?? COMMENTS[slot]
  const commenter = DEMO_CONTENT_PERSONAS[(ownerIndex + 1) % DEMO_CONTENT_PERSONAS.length]
  if (!text || !commenter) return { comments: 0, reactions }
  return { comments: await commentOnce(ctx, root, postId, actorPerson(people, commenter.actor)._id, owner._id, text) ? 1 : 0, reactions }
}

export const run = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({ profiles: v.number(), pages: v.number(), postsCreated: v.number(), postsExisting: v.number(), commentsCreated: v.number(), reactionsCreated: v.number() }),
  handler: async (ctx, args) => {
    const { root, people } = await demoContext(ctx, args.confirmNonProduction)
    let profiles = 0
    for (const spec of DEMO_CONTENT_PERSONAS) {
      const person = actorPerson(people, spec.actor)
      if (person.headline === spec.originalHeadline) {
        const headline = checked(() => assertHeadline(spec.headline))
        await ctx.db.patch(person._id, { headline, updatedAt: Date.now() })
        await moderateContentWrite(ctx, { networkId: root._id, ownerPersonId: person._id, kind: "person", id: person._id, text: `${person.displayName ?? ""} ${headline ?? ""}` })
        await syncPersonDirectory(ctx, person._id)
        profiles += 1
      }
    }
    const pages = await ensurePages(ctx, root, people)
    await ensureShops(ctx, root, people, pages)
    let postsCreated = 0
    let postsExisting = 0
    let commentsCreated = 0
    let reactionsCreated = 0
    for (let slot = 0; slot < DEMO_CONTENT_POSTS.length; slot += 1) {
      const spec = DEMO_CONTENT_POSTS[slot]
      if (!spec) continue
      const person = actorPerson(people, spec.actor)
      const existing = await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", q => q.eq("authorPersonId", person._id).eq("idempotencyKey", postKey(spec))).unique()
      if (existing) {
        if (existing.networkId !== root._id) return fail("conflict")
        postsExisting += 1
        continue
      }
      const page = spec.page ? pages.get(spec.page) : undefined
      if (spec.page && !page) continue
      const body = checked(() => assertPostContent({ body: spec.body, mediaCount: 0, isShare: false }))
      // Geste PUBLIC explicite, limité par l'adresse fictive vérifiée et la garde de déploiement.
      const { postId } = await writePost(ctx, { network: root, authorPersonId: person._id, body, audience: "public", visibility: "root", province: spec.province, idempotencyKey: postKey(spec), ...(page ? { pageId: page._id } : {}) })
      postsCreated += 1
      const engagement = await engageNewPost(ctx, root, people, spec, postId, slot)
      commentsCreated += engagement.comments
      reactionsCreated += engagement.reactions
    }
    if (postsExisting === 0 && postsCreated > 0) await seedGraph(ctx, root, people, pages)
    if (postsCreated > 0) for (const person of people.values()) await refreshReaderFeed(ctx, root._id, person._id)
    return { profiles, pages: pages.size, postsCreated, postsExisting, commentsCreated, reactionsCreated }
  },
})

/** Les premières publications personnelles d'un acteur, encore publiées et intactes. */
async function actorPostsOf(ctx: Pick<QueryCtx, "db">, root: Doc<"networks">, person: Doc<"persons">, actor: Actor, limit: number): Promise<Doc<"posts">[]> {
  const posts: Doc<"posts">[] = []
  for (const spec of DEMO_CONTENT_POSTS) {
    if (posts.length >= limit) break
    if (spec.actor !== actor || spec.page) continue
    const post = await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", q => q.eq("authorPersonId", person._id).eq("idempotencyKey", postKey(spec))).unique()
    if (post && post.networkId === root._id && post.status === "published" && post.removedAt === undefined && await publishedState(ctx, "post", post._id)) posts.push(post)
  }
  return posts
}

/**
 * Les figurants : leurs publications, leur engagement et leur graphe. Le graphe d'un
 * figurant n'est posé qu'au moment où sa première publication est créée : un rejeu ne
 * recrée ni relation rompue, ni demande annulée ou refusée, ni abonnement retiré.
 */
export const runFigurants = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({ figurants: v.number(), postsCreated: v.number(), postsExisting: v.number(), connections: v.number(), requests: v.number(), follows: v.number(), reactionsCreated: v.number(), commentsCreated: v.number() }),
  handler: async (ctx, args) => {
    const { root, people } = await demoContext(ctx, args.confirmNonProduction)
    const figurants = await readyFigurants(ctx, root)
    const pages = await livePages(ctx, root, people)
    const totals = { figurants: figurants.size, postsCreated: 0, postsExisting: 0, connections: 0, requests: 0, follows: 0, reactionsCreated: 0, commentsCreated: 0 }
    for (const figurant of DEMO_FIGURANTS) {
      const person = figurants.get(figurant.slot)
      const ties = DEMO_FIGURANT_TIES[figurant.slot]
      if (!person || !ties) continue
      const specs = DEMO_FIGURANT_POSTS.filter(spec => spec.slot === figurant.slot)
      let firstSeen = false
      for (const [index, spec] of specs.entries()) {
        const existing = await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", q => q.eq("authorPersonId", person._id).eq("idempotencyKey", postKey(spec))).unique()
        if (existing) {
          if (existing.networkId !== root._id) return fail("conflict")
          totals.postsExisting += 1
          continue
        }
        if (index === 0) firstSeen = true
        const body = checked(() => assertPostContent({ body: spec.body, mediaCount: 0, isShare: false }))
        const { postId } = await writePost(ctx, { network: root, authorPersonId: person._id, body, audience: "public", visibility: "root", province: figurant.province, idempotencyKey: postKey(spec) })
        totals.postsCreated += 1
        if (!await publishedState(ctx, "post", postId)) continue
        // Les amis réagissent ; le premier ami acteur commente.
        const reactors = [...ties.friends.map(actor => actorPerson(people, actor)._id), ...ties.figurantFriends.flatMap(slot => figurants.get(slot)?._id ?? [])]
        for (const [rank, reactor] of reactors.slice(0, 3).entries()) {
          if (await reactOnce(ctx, root, postId, reactor, person._id, REACTION_KINDS[(rank + figurant.slot) % REACTION_KINDS.length] ?? "like")) totals.reactionsCreated += 1
        }
        const commenter = ties.friends[0]
        if (commenter && await commentOnce(ctx, root, postId, actorPerson(people, commenter)._id, person._id, spec.comment)) totals.commentsCreated += 1
      }
      if (!firstSeen) continue
      for (const actor of ties.friends) {
        if (await connectOnce(ctx, root, person._id, actorPerson(people, actor)._id, "accepted")) totals.connections += 1
        if (await followOnce(ctx, root, person._id, actorPerson(people, actor)._id)) totals.follows += 1
      }
      for (const slot of ties.figurantFriends) {
        const friend = figurants.get(slot)
        if (friend && await connectOnce(ctx, root, person._id, friend._id, "accepted")) totals.connections += 1
      }
      for (const actor of ties.requests) if (await connectOnce(ctx, root, person._id, actorPerson(people, actor)._id, "requested")) totals.requests += 1
      for (const actor of ties.requestedBy) if (await connectOnce(ctx, root, actorPerson(people, actor)._id, person._id, "requested")) totals.requests += 1
      for (const page of pages.values()) if (await followPageOnce(ctx, root, page, person._id)) totals.follows += 1
      // Le figurant réagit aux trois premières publications de ses amis acteurs et en commente une.
      for (const [rank, actor] of ties.friends.entries()) {
        for (const post of await actorPostsOf(ctx, root, actorPerson(people, actor), actor, 3)) {
          if (await reactOnce(ctx, root, post._id, person._id, actorPerson(people, actor)._id, REACTION_KINDS[(rank + figurant.slot) % REACTION_KINDS.length] ?? "like")) totals.reactionsCreated += 1
        }
      }
      const firstFriend = ties.friends[0]
      const target = firstFriend ? (await actorPostsOf(ctx, root, actorPerson(people, firstFriend), firstFriend, 1))[0] : undefined
      if (firstFriend && target && await commentOnce(ctx, root, target._id, person._id, actorPerson(people, firstFriend)._id, ties.comment)) totals.commentsCreated += 1
    }
    if (totals.postsCreated > 0) {
      for (const person of people.values()) await refreshReaderFeed(ctx, root._id, person._id)
      for (const person of figurants.values()) await refreshReaderFeed(ctx, root._id, person._id)
    }
    return totals
  },
})

export type DemoMediaTarget = { key: string; kind: "post" | "story" | "page_banner" | "person_cover" | "person_avatar"; ownerHandle: string; asset: string; file: string; targetId: string | null; caption: string | null; attached: boolean }
const mediaTargetValidator = v.object({ key: v.string(), kind: v.union(v.literal("post"), v.literal("story"), v.literal("page_banner"), v.literal("person_cover"), v.literal("person_avatar")), ownerHandle: v.string(), asset: v.string(), file: v.string(), targetId: v.union(v.string(), v.null()), caption: v.union(v.string(), v.null()), attached: v.boolean() })

/** Le chemin public d'un asset du catalogue fermé (`<collection>/<fichier>`). */
function assetFile(asset: string): string {
  const spec = demoMediaAsset(asset)
  if (!spec) throw new Error("Illustration inconnue.")
  return `${spec.collection}/${spec.filename}`
}

/** La purge enlève la story mais garde son état de modération : le retrait reste acquis. */
async function purgedStoryToday(ctx: Pick<QueryCtx, "db">, root: Doc<"networks">, person: Doc<"persons">, now: number): Promise<boolean> {
  const dayStart = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`)
  const states = await ctx.db.query("moderationContentStates").withIndex("by_network_owner_updatedAt", q => q.eq("networkId", root._id).eq("ownerPersonId", person._id).gte("updatedAt", dayStart)).take(101)
  if (states.length > 100) return true
  for (const state of states) {
    if (state.targetKind !== "story" || state.createdAt < dayStart) continue
    const id = ctx.db.normalizeId("stories", state.targetId)
    if (id && !await ctx.db.get(id)) return true
  }
  return false
}

/** Une publication intacte (ni retirée, ni éditée, ni masquée) peut recevoir son image. */
async function intactPost(ctx: Pick<QueryCtx, "db">, root: Doc<"networks">, person: Doc<"persons">, spec: { key: string; body: string }): Promise<Doc<"posts"> | null> {
  const post = await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", q => q.eq("authorPersonId", person._id).eq("idempotencyKey", postKey(spec))).unique()
  if (!post || post.networkId !== root._id || post.status !== "published" || post.removedAt !== undefined || post.editedAt !== undefined || post.body !== spec.body || !await publishedState(ctx, "post", post._id)) return null
  return post
}

async function plannedMedia(ctx: ReadCtx, confirmation: string): Promise<DemoMediaTarget[]> {
  const { root, people } = await demoContext(ctx, confirmation)
  const targets: DemoMediaTarget[] = []
  for (const spec of DEMO_CONTENT_POSTS) {
    if (!spec.asset) continue
    const person = actorPerson(people, spec.actor)
    const post = await intactPost(ctx, root, person, spec)
    if (!post) continue
    if (spec.page) {
      const pageSpec = DEMO_CONTENT_PAGES.find(page => page.handle === spec.page)
      if (!pageSpec || !await availablePage(ctx, root, person, pageSpec)) continue
    }
    targets.push({ key: `${postKey(spec)}:image`, kind: "post", ownerHandle: person.handle ?? "", asset: spec.asset, file: assetFile(spec.asset), targetId: post._id, caption: null, attached: (post.media?.length ?? 0) > 0 })
  }
  for (const spec of DEMO_CONTENT_PAGES) {
    const person = actorPerson(people, spec.actor)
    const page = await availablePage(ctx, root, person, spec)
    if (page) targets.push({ key: `${DEMO_CONTENT_VERSION}:banner:${spec.handle}`, kind: "page_banner", ownerHandle: person.handle ?? "", asset: spec.asset, file: assetFile(spec.asset), targetId: page._id, caption: null, attached: page.bannerStorageId !== undefined })
  }
  const now = Date.now()
  for (const spec of DEMO_CONTENT_PERSONAS) {
    const person = actorPerson(people, spec.actor)
    if (["membre", "verifie", "commercant", "association"].includes(spec.actor)) targets.push({ key: `${DEMO_CONTENT_VERSION}:cover:${spec.actor}`, kind: "person_cover", ownerHandle: spec.handle, asset: spec.asset, file: assetFile(spec.asset), targetId: person._id, caption: null, attached: person.coverStorageId !== undefined })
    const key = storyKey(spec.actor, now)
    const story = await ctx.db.query("stories").withIndex("by_author_idempotency", q => q.eq("authorPersonId", person._id).eq("idempotencyKey", key)).unique()
    if (story && story.networkId !== root._id) return fail("conflict")
    const live = await ctx.db.query("stories").withIndex("by_network_author_expiresAt", q => q.eq("networkId", root._id).eq("authorPersonId", person._id).gt("expiresAt", now)).take(STORY_ACTIVE_PER_AUTHOR_MAX)
    const consumed = story !== null || live.length >= STORY_ACTIVE_PER_AUTHOR_MAX || await purgedStoryToday(ctx, root, person, now)
    targets.push({ key, kind: "story", ownerHandle: spec.handle, asset: spec.asset, file: assetFile(spec.asset), targetId: story?._id ?? null, caption: spec.story, attached: consumed })
  }
  const figurants = await readyFigurants(ctx, root)
  for (const figurant of DEMO_FIGURANTS) {
    const person = figurants.get(figurant.slot)
    if (!person) continue
    // Un portrait choisi par la personne n'est jamais remplacé.
    targets.push({ key: `${DEMO_CONTENT_VERSION}:avatar:figurant-${figurant.slot}`, kind: "person_avatar", ownerHandle: figurant.handle, asset: figurant.avatar, file: assetFile(figurant.avatar), targetId: person._id, caption: null, attached: person.avatarStorageId !== undefined })
    for (const spec of DEMO_FIGURANT_POSTS) {
      if (spec.slot !== figurant.slot || !spec.asset) continue
      const post = await intactPost(ctx, root, person, spec)
      if (post) targets.push({ key: `${postKey(spec)}:image`, kind: "post", ownerHandle: figurant.handle, asset: spec.asset, file: assetFile(spec.asset), targetId: post._id, caption: null, attached: (post.media?.length ?? 0) > 0 })
    }
  }
  return targets
}

/** Plan serveur seulement : aucun upload, aucune URL ni donnée étrangère au catalogue. */
export const mediaTargets = internalQuery({
  args: { confirmNonProduction: v.string() },
  returns: v.array(mediaTargetValidator),
  handler: async (ctx, args) => await plannedMedia(ctx, args.confirmNonProduction),
})

/** Le serveur a déjà stocké les octets du catalogue : leur empreinte immuable reste obligatoire ici. */
export const attachMedia = internalMutation({
  args: { confirmNonProduction: v.string(), key: v.string(), storageId: v.id("_storage"), asset: v.string() },
  returns: v.object({ attached: v.boolean() }),
  handler: async (ctx, args) => {
    const targets = await plannedMedia(ctx, args.confirmNonProduction)
    const target = targets.find(item => item.key === args.key)
    if (!target || target.asset !== args.asset) return fail("policyRefused")
    if (target.attached) return { attached: false }
    const manifest = demoMediaAsset(args.asset)
    const stored = await ctx.db.system.get("_storage", args.storageId)
    if (!manifest || !stored || normalizeSha256(stored.sha256) !== manifest.sha256 || stored.size !== manifest.bytes || stored.contentType !== manifest.mimeType) return fail("policyRefused")
    const person = await ctx.db.query("persons").withIndex("by_handle", q => q.eq("handle", target.ownerHandle)).unique()
    const root = await getRootNetwork(ctx)
    if (!person || !root) return fail("policyRefused")
    // Une analyse, une réservation ou un asset catalogue préexistant refuse la reprise du blob.
    await assertFreshUpload(ctx, person._id, args.storageId)
    const media: StoredMedia = { storageId: args.storageId, kind: "image", mimeType: manifest.mimeType, sizeBytes: stored.size, width: manifest.width, height: manifest.height, altText: manifest.altText }
    if (target.kind === "story") checked(() => assertStoryMedia(media))
    await registerGeneratedBlob(ctx, args.storageId, { mimeType: manifest.mimeType, filename: manifest.filename, networkId: root._id, uploadedByPersonId: person._id })
    if (target.kind === "post") {
      const id = target.targetId ? ctx.db.normalizeId("posts", target.targetId) : null
      if (!id) return fail("notFound")
      await ctx.db.patch(id, { media: [media] })
    } else if (target.kind === "page_banner") {
      const id = target.targetId ? ctx.db.normalizeId("pages", target.targetId) : null
      if (!id) return fail("notFound")
      await ctx.db.patch(id, { bannerStorageId: args.storageId, updatedAt: Date.now() })
    } else if (target.kind === "person_cover" || target.kind === "person_avatar") {
      if (target.targetId !== person._id) return fail("notFound")
      await ctx.db.patch(person._id, target.kind === "person_cover" ? { coverStorageId: args.storageId, updatedAt: Date.now() } : { avatarStorageId: args.storageId, updatedAt: Date.now() })
      await syncPersonDirectory(ctx, person._id)
    } else {
      const caption = checked(() => assertStoryCaption(target.caption ?? undefined))
      const now = Date.now()
      const storyId = await ctx.db.insert("stories", { networkId: root._id, authorPersonId: person._id, media, caption, audience: "public", publishedAt: now, expiresAt: storyExpiresAt(now), idempotencyKey: target.key })
      await moderateContentWrite(ctx, { networkId: root._id, ownerPersonId: person._id, kind: "story", id: storyId, text: caption ?? "" })
    }
    return { attached: true }
  },
})
