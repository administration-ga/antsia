"""Texte du dossier PDF « ANTSIA — Sept univers pour le Gabon ».

Une fonction par page (ou par paire de pages) : chaque page porte une idée et tient sur sa feuille.
Règle de véracité : l'existant est décrit tel que le code et les ADR le montrent ; toute proposition est
nommée comme telle ; chaque chiffre porte sa source dans donnees_etude.py.
"""
from __future__ import annotations

from html import escape

import donnees as D


# --- petites briques HTML -------------------------------------------------------------------
def esc(s: str) -> str:
    return escape(s, quote=False)


def page(kicker: str, color: str, title: str, chapo: str, body: str) -> str:
    chapo_html = f"<p class='chapo'>{chapo}</p>" if chapo else ""
    return (f"<section><p class='kicker {color}'>{esc(kicker)}</p><h2>{esc(title)}</h2>{chapo_html}{body}"
            f"</section>")


def figure(svg, slug: str, legende: str, max_width: str = "100%") -> str:
    return (f"<div class='figure' style='max-width:{max_width};margin-left:auto;margin-right:auto'>{svg(slug)}</div>"
            f"<p class='legende'>{legende}</p>")


def encadre(color: str, title: str, body: str) -> str:
    return f"<div class='encadre {color}'><h4>{esc(title)}</h4>{body}</div>"


def table(headers: list[str], rows: list[list[str]], num_cols: tuple[int, ...] = (), compact: bool = False) -> str:
    th = "".join(f"<th{' class=num' if i in num_cols else ''}>{esc(h)}</th>" for i, h in enumerate(headers))
    trs = "".join("<tr>" + "".join(f"<td{' class=num' if i in num_cols else ''}>{c}</td>" for i, c in enumerate(r))
                  + "</tr>" for r in rows)
    cls = " class='compact'" if compact else ""
    return f"<table{cls}><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def ul(items: list[str]) -> str:
    return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def ol(items: list[str]) -> str:
    return "<ol>" + "".join(f"<li>{i}</li>" for i in items) + "</ol>"


def pastille(text: str, color: str = "ink", plein: bool = False) -> str:
    return f"<span class='pastille {color}{' plein' if plein else ''}'>{esc(text)}</span>"


def cols(*blocks: str) -> str:
    cls = "cols3" if len(blocks) == 3 else "cols"
    return f"<div class='{cls}'>" + "".join(f"<div>{b}</div>" for b in blocks) + "</div>"


# --- couverture, synthèse, sommaire -----------------------------------------------------------
def couverture() -> str:
    return """
<div class="couverture">
  <div class="bandes"><span style="background:#007E4D"></span><span style="background:#F4BB44"></span>
  <span style="background:#2F67B5"></span></div>
  <div class="corps">
    <p class="programme">Digital GABON · NTSAGUI Digital · Écosystème ANTSIA</p>
    <h1>ANTSIA<br>Sept univers<br>pour le Gabon</h1>
    <p class="sous-titre">Étude stratégique : les besoins de la population, une page pour chaque activité,
    la vie publique dans le réseau national et iAsted pour orienter acheteurs et vendeurs.</p>
    <div class="cover-piliers">
      <div style="border-top:6px solid #F4BB44"><b>Divertissement</b><span>revenir chaque jour</span></div>
      <div style="border-top:6px solid #007E4D"><b>Business</b><span>sept univers pour vivre de son activité</span></div>
      <div style="border-top:6px solid #2F67B5"><b>Vie publique</b><span>s'informer et faire confiance</span></div>
    </div>
    <div class="formule">Une page pour exister, <span>des espaces pour vendre</span>, PRO.GA pour gérer.</div>
    <p class="cover-univers">Boutiques · Immobilier et foncier · Emploi et talents · Alimentation et restauration ·
    Services et artisans · Auto et mobilité · Cérémonies et sorties</p>
  </div>
  <div class="meta">
    <div><b>Date</b>21 octobre 2026</div>
    <div><b>Version</b>1.1 — 21 octobre 2026</div>
    <div><b>Statut</b>D01 à D08 validées (ADR-0035)</div>
    <div><b>Portée</b>étude : aucune activation, aucun code modifié</div>
  </div>
</div>"""


def resume() -> str:
    phrases = [
        "<b>Trois piliers.</b> ANTSIA réunit le divertissement qui fait revenir chaque jour, le business qui fait "
        "vivre et la vie publique qui informe et rassure.",
        "<b>Sept univers business</b>, choisis d'après ce qui circule déjà sur les réseaux au Gabon : boutiques ; "
        "immobilier et foncier ; emploi et talents ; alimentation et restauration ; services et artisans ; auto et "
        "mobilité ; cérémonies et sorties.",
        "<b>Un business = une page.</b> La page porte l'identité ; l'activité y active les espaces métier dont elle a "
        "besoin ; une entité responsable se tient derrière. Quand l'activité grandit, PRO.GA la gère et ANTSIA devient "
        "un canal de vente parmi d'autres.",
        "<b>Le particulier n'a pas besoin de page</b> pour vendre son frigo ou louer son studio : il publie une "
        "annonce ; s'il publie souvent, ANTSIA lui propose de « passer pro ».",
        "<b>La vie publique a ses places réservées</b> : pages Officielles reflétées depuis administration.ga, agents "
        "publics volontaires, médias labellisés, annonceurs étiquetés — jamais confondus.",
        "<b>iAsted devient l'assistant du membre</b> : il comprend un besoin, trouve les offres publiées, prépare le "
        "contact, la visite ou la commande ; la personne confirme toujours.",
        "<b>On ouvre d'abord ce qui n'exige pas de paiement en ligne</b>, et l'on se conforme dès la conception à "
        "l'ordonnance 0011/PR/2026. Billetterie et rencontres attendent leurs conditions externes.",
    ]
    body = ol(phrases)
    body += encadre("rouge", "Le contexte de 2026",
                    "<p>Les réseaux sociaux sont suspendus par la HAC depuis le 17 février 2026 (statut au 21 octobre "
                    "incertain) et l'ordonnance 0011/PR/2026 encadre désormais les plateformes, ANTSIA compris. C'est "
                    "une fenêtre, et un risque : ANTSIA doit gagner par l'utilité et la confiance, jamais comme "
                    "réseau de remplacement d'une censure.</p>")
    body += encadre("vert", "Ce que l'étude garde, ce qu'elle ajoute",
                    "<p>Elle garde le plan marketplace validé le 21 octobre (ADR-0034, A01 à A10, lots MP00 à MP14 en "
                    "cours). Elle ajoute quatre univers (immobilier et foncier, alimentation et restauration, auto et "
                    "mobilité, cérémonies et sorties), l'annonce de particulier, les espaces de la vie publique, la "
                    "chaîne de confiance d'État, la conformité à l'ordonnance 0011 et l'entrée d'iAsted dans "
                    "ANTSIA.</p>")
    grid = "".join(f"<div class='dec'><b>{d[0]}</b> {esc(d[1])} "
                   f"{pastille('validée', 'vert') if d[4] == 'validée' else pastille('proposée', 'gris')}</div>"
                   for d in D.DECISIONS)
    body += (f"<h3>Les douze décisions : D01 à D08 validées le 21 octobre (ADR-0035)</h3>"
             f"<div class='decisions-grille'>{grid}</div>")
    return page("Synthèse", "ink", "La décision en une page",
                "Faut-il partir dans cette stratégie ? <b>Oui</b> — décision prise le 21 octobre pour D01 à D08 : "
                "ouvrir d'abord les univers qui ne demandent ni paiement ni preuve de majorité, et faire d'iAsted un "
                "service d'orientation gratuit pour le membre.", body)


def sommaire() -> str:
    items = ["La décision en une page", "Mode d'emploi", "Le constat au Gabon", "Choisir les sept univers",
             "Les trois piliers", "La roue de croissance", "Les sept univers et leurs fiches", "Ce qui se fait ailleurs",
             "Un business, une page ?", "L'échelle de l'activité", "Anatomie d'une page", "L'offre et le besoin",
             "Un parcours type", "La vie publique", "De administration.ga à ANTSIA", "La chaîne de confiance",
             "Réorganiser le site", "L'architecture", "iAsted", "Le modèle économique", "La feuille de route",
             "Indicateurs", "Risques", "Les décisions", "Où en est-on", "Sources"]
    body = "<div class='sommaire'>" + "".join(f"<div><span>{n + 1}</span><span>{esc(t)}</span></div>"
                                              for n, t in enumerate(items)) + "</div>"
    body += "<h3>Comment lire les schémas</h3>"
    body += table(["Signe", "Sens"], [
        ["Trait plein", "existe dans le code d'ANTSIA ou de ses voisins ; « en source » ne veut pas dire vérifié en "
                        "production"],
        ["Pointillé", "proposé par cette étude, à décider"],
        ["Rouge", "fermé, interdit ou risqué, avec la raison"],
        ["Couleurs", pastille("vert", "vert") + " business · " + pastille("jaune", "ink") + " divertissement · "
         + pastille("bleu", "bleu") + " vie publique — les trois couleurs du thème Gaboma"],
    ])
    body += "<h3>Méthode</h3>"
    body += ul([
        "<b>Lecture du code et des décisions</b> : routes et i18n d'antsia_ga, modules du moteur, ADR-0001 à 0034, "
        "études du 18, du 20 et du 21 octobre, PRO.GA (modules, packs, recherches sur le Gabon), doctrine de "
        "communication publique du socle, inventaire d'iAsted dans tout le programme.",
        "<b>Recherche documentaire</b> sur le Gabon (numérique, économie, ce qui se vend sur les réseaux, cadre "
        "juridique) et <b>benchmark</b> de plateformes étrangères ; chaque chiffre est daté et sourcé.",
        "<b>Notation</b> de douze univers candidats sur six critères ; les notes ordonnent, elles ne prédisent pas.",
        "<b>Limites</b> : pas d'enquête de terrain ; aucun volume d'annonces publié pour le Gabon ; quota de recherche "
        "web atteint en fin de session ; statut de la suspension au 21 octobre non confirmé. Aucun chiffre d'usage "
        "d'ANTSIA n'est avancé : il n'en existe pas de mesuré.",
    ])
    body += encadre("ink", "Le dossier compagnon",
                    "<p>Le fichier <b>ETUDE_SEPT_UNIVERS_ANTSIA.md</b> contient l'étude complète : tous les tableaux, "
                    "les chiffres détaillés, les fiches, les briques techniques et la liste des sources. Ce PDF en "
                    "est la version visuelle, pour décider.</p>")
    return page("Mode d'emploi", "ink", "Sommaire, légende et méthode",
                "Quatre temps : comprendre le terrain, concevoir le produit, construire l'architecture, décider et "
                "déployer.", body)


# --- partie A : comprendre ---------------------------------------------------------------------
def constat(svg) -> list[str]:
    p1 = encadre("rouge", "Le contexte de 2026", D.SUSPENSION)
    p1 += figure(svg, "02-constat-chiffres", "Schéma 0 — Neuf repères datés et sourcés. Les audiences des réseaux "
                 "sociaux datent d'octobre 2025, avant la suspension ; l'usage actuel passe par VPN et n'est pas mesuré.")
    p2 = table(["Ce qui s'échange", "Comment aujourd'hui", "Douleur principale"],
               [[f"<b>{esc(a)}</b>", esc(b), esc(c)] for a, b, c in D.CIRCULATION], compact=True)
    p2 += encadre("vert", "Ce que le constat implique pour ANTSIA", ul(D.ENSEIGNEMENTS))
    return [page("Partie A · Comprendre", "vert", "Le constat : ce que les Gabonais font déjà en ligne",
                 D.CONSTAT_CHAPO, p1),
            page("Partie A · Comprendre", "vert", "Ce qui circule déjà, et ce qui fait mal",
                 "Les preuves sont des reportages, des communiqués et des observations directes : elles montrent "
                 "l'existence des flux, pas leur volume.", p2)]


def selection(svg) -> list[str]:
    rows = []
    for c in D.CANDIDATS:
        rows.append([f"<b>{esc(c['nom'])}</b>"] + [str(c[k]) for k in D.CRITERES_CLES]
                    + [f"<b>{c['score']}</b>", pastille(c['verdict'], c['couleur'])])
    p1 = "<p>" + D.METHODE_NOTATION + "</p>"
    p1 += table(["Candidat"] + D.CRITERES_TITRES + ["/25", "Verdict"], rows,
                num_cols=tuple(range(1, len(D.CRITERES_TITRES) + 2)))
    p1 += "<p class='petit'>" + D.NOTATION_NOTE + "</p>"
    p1 += encadre("ink", "Pourquoi ces sept, et pas les autres", ul([
        "<b>Retenus</b> : les quatre premiers ; à égalité (17), les services et les cérémonies plutôt que la mobilité, "
        "confiée à des partenaires ; l'automobile (16), forte en revenus et demandée ; les terrains rejoignent "
        "l'immobilier, avec vérification du titre.",
        "<b>Livraison et VTC</b> : une capacité commune assurée par des partenaires (Gozem, Yango, Taxi Gab+, "
        "coursiers), pas un univers ni un VTC maison.",
        "<b>Administration</b> : un pilier, la vie publique, pas un univers marchand.",
        "<b>Rencontres</b> : rangées dans le divertissement et fermées jusqu'à une preuve de majorité ; risque "
        "maximal, aucun revenu puisque le citoyen ne paie pas.",
        "<b>Tontines et cagnottes</b> : écartées tant qu'un établissement agréé ne porte pas les fonds.",
    ]))
    p2 = figure(svg, "03-matrice-priorisation", D.MATRICE_LEGENDE)
    p2 += cols(encadre("vert", "Ouvrir d'abord", "<p>Boutiques, emploi, services : le code existe en source "
                       "(MP04–MP06, P15, MP09). Restauration : un gabarit sur la boutique existante.</p>"),
               encadre("ink", "Forte valeur, plus de travail", "<p>Immobilier, auto, terrains : nouveaux types d'offre, "
                       "location de ressources, vérification foncière et cartes grises par conventions.</p>"))
    return [page("Partie A · Comprendre", "vert", "Choisir les sept univers", D.SELECTION_CHAPO, p1),
            page("Partie A · Comprendre", "vert", "La matrice de priorisation",
                 "La valeur dit quoi ouvrir ; la faisabilité dit dans quel ordre.", p2)]


def piliers(svg) -> str:
    body = figure(svg, "01-trois-piliers", "Schéma 1 — Les trois piliers. Le pilier Divertissement existe dans "
                  "l'application ; les univers et les espaces réservés sont détaillés plus loin.")
    body += cols(
        encadre("jaune", "Divertissement", "<p>Il fait revenir chaque jour : fil, Clips, Stories, directs, groupes, "
                "évènements, Messages et appels. Les rencontres y sont rangées, fermées pour l'instant.</p>"),
        encadre("vert", "Business", "<p>Sept univers où l'on achète, visite, loue, candidate, commande, réserve. "
                "Chaque univers a son espace spécialisé, avec « Retour à ANTSIA ».</p>"),
        encadre("bleu", "Vie publique", "<p>Institutions, agents volontaires, médias et annonceurs y ont des places "
                "réservées et étiquetées.</p>"))
    body += ("<p>iAsted traverse les trois piliers ; le socle de confiance (badges calculés côté serveur, modération "
             "nationale, données au Gabon) les porte tous. C'est ce socle, plus que les fonctions, qui distingue "
             "ANTSIA : ce qui est vérifié l'est par l'autorité compétente.</p>")
    return page("Partie A · Comprendre", "ink", "Les trois piliers d'ANTSIA",
                "Une raison de revenir, une raison d'y gagner sa vie, une raison d'y faire confiance.", body)


def roue(svg) -> str:
    body = figure(svg, "06-roue-de-croissance", "Schéma 2 — La roue de croissance. Chaque étape nourrit la suivante ; "
                  "la vie publique alimente la confiance qui fait tourner la roue.")
    body += cols(
        encadre("ink", "Comment la roue démarre", ul([
            "Une zone pilote : le Grand Libreville (Libreville, Akanda, Owendo, Ntoum).",
            "Des contenus réels dès l'ouverture : reflets des administrations, membres de DIASPORALE, médias "
            "partenaires, créateurs invités.",
            "Des vendeurs pilotes consentants dans chaque univers ouvert.",
            "Un usage fondateur du quotidien : trouver un logement sans démarcheur, un emploi sans arnaque.",
        ])),
        encadre("rouge", "Ce qui l'arrête", ul([
            "Une vague d'arnaques : elle vide un univers.",
            "Un univers ouvert mais vide : aucune tuile tant qu'il n'a pas d'offres réelles.",
            "La propagande ou la publicité envahissante.",
            "La lenteur sur réseau mobile : le fil doit rester rapide en 3G.",
        ])))
    return page("Partie A · Comprendre", "ink", "La roue de croissance",
                "Le divertissement amène le public ; le public attire les offres ; les offres financent la confiance ; "
                "la confiance fait revenir le public.", body)


def univers(svg) -> str:
    body = figure(svg, "04-sept-univers", "Schéma 3 — Les sept univers retenus : action principale, état dans le code "
                  "au 21 octobre et vague de déploiement.")
    body += cols(
        encadre("vert", "Une action principale par univers",
                "<p>Acheter, visiter, candidater, commander, demander un devis, louer, réserver : chaque univers "
                "affiche le geste qui compte pour lui, jamais un faux bouton d'achat pour une offre sur devis.</p>"),
        encadre("ink", "Ce qui est commun aux sept",
                "<p>Une page et une entité responsable, une offre typée, le contact dans Messages, iAsted, les badges "
                "et vérifications, PRO.GA derrière, la livraison par partenaires, le paiement protégé quand un "
                "prestataire agréé sera contracté.</p>"))
    return page("Partie A · Comprendre", "vert", "Les sept univers",
                "Sept besoins quotidiens, sept espaces spécialisés, une seule identité par activité.", body)


def fiches() -> list[str]:
    out = []
    groups = [D.FICHES[0:2], D.FICHES[2:4], D.FICHES[4:6], D.FICHES[6:7]]
    for i, group in enumerate(groups):
        cards = ""
        for u in group:
            grille = "".join(f"<div><b>{esc(k)}</b>{esc(v)}</div>" for k, v in u["grille"])
            cards += (f"<div class='fiche'><h3>{esc(u['nom'])} {pastille(u['etat'], u['couleur_etat'])} "
                      f"{pastille(u['vague'], 'ink')}</h3><p>{esc(u['resume'])}</p>"
                      f"<div class='grille'>{grille}</div></div>")
        if i == len(groups) - 1:
            cards += encadre("ink", "Hors des sept univers, et à leur service", ul([
                "<b>Livraison et colis</b> : partenaires (coursiers, Gozem, Yango, Express Courrier), proposés au moment "
                "de commander ; pas de flotte ANTSIA.",
                "<b>Paiement protégé</b> : fonds reversés après réception (modèle P12), par un établissement agréé ; "
                "fermé tant qu'aucun contrat n'existe.",
                "<b>Avis vérifiés</b> : seulement après un engagement réel (achat, visite, prestation, billet).",
                "<b>Signalement</b> : un bouton sur chaque offre ; file prioritaire pour les arnaques et les mineurs.",
            ]))
        out.append(page("Partie A · Fiches", "vert", "Fiches des univers" + (f" ({i + 1}/4)"),
                        "Pour chaque univers : le besoin, l'existant, l'apport d'ANTSIA, la confiance, PRO.GA, iAsted, "
                        "les revenus et les risques." if i == 0 else "", cards))
    return out


def benchmark(svg) -> list[str]:
    p1 = figure(svg, "05-benchmark-modeles", D.BENCHMARK_LEGENDE, max_width="76%")
    p1 += table(["Plateforme", "Unité d'identité", "Modules", "Ce qu'ANTSIA en retient"],
                [[f"<b>{esc(a)}</b>", esc(b), esc(c), esc(d)] for a, b, c, d in D.BENCHMARK], compact=True)
    p2 = encadre("vert", "Dix leçons pour ANTSIA", ol(D.LECONS))
    p2 += encadre("rouge", "Ce que les plateformes ont abandonné, et pourquoi", ul([
        "<b>Meta</b> : les offres d'emploi (2022, hors États-Unis et Canada), la vente en direct (2022-2023), les "
        "flux auto et immobilier sur Marketplace (2021), le paiement dans les boutiques (2025) — trop lourds à "
        "exploiter, retour à la découverte et à la publicité.",
        "<b>Google</b> : les sites générés depuis la fiche et la messagerie (2024), pour faible engagement.",
        "<b>LinkedIn</b> : l'onglet produits et services (2014), remplacé par des pages de marque.",
        "<b>ChatGPT</b> : l'achat intégré revu en mars 2026 ; les marchands préfèrent leur propre parcours.",
        "<b>Zalo</b> : frais et conditions imposés en bloc fin 2025, chute dans les classements et amende en 2026.",
    ]))
    return [page("Partie A · Comprendre", "ink", "Ce qui se fait ailleurs", D.BENCHMARK_CHAPO, p1),
            page("Partie A · Comprendre", "ink", "Les leçons du benchmark",
                 "Une seule identité, des modules vérifiés un par un, et le courage de fermer ce qu'on exploite mal.",
                 p2)]


# --- partie B : concevoir ----------------------------------------------------------------------
def modeles(svg) -> str:
    body = figure(svg, "07-trois-modeles-page-boutique", "Schéma 5 — Trois façons de représenter un business. Le "
                  "modèle C a été retenu le 21 octobre pour boutiques, services et médias (ADR-0034, A01) ; l'étude "
                  "l'étend aux sept univers.")
    body += cols(
        encadre("vert", "La réponse à la question posée",
                "<p>Pour le public, <b>c'est une page qui se configure selon son métier</b> : boutique, agence, loueur, "
                "restaurant. Elle porte une seule identité et active des espaces métier, chacun avec sa propre "
                "navigation et sa propre admission. Derrière, une entité responsable : la personne, ou la structure "
                "PRO.GA qui détient catalogue, stock et engagements.</p>"),
        encadre("ink", "Exemples", ul([
            "Une couturière : Boutique (pagnes, tenues) et Prestations (retouches).",
            "Une agence : Biens, puis Emplois quand elle recrute.",
            "Un loueur : Location, puis Boutique de pièces.",
            "Un média : sa page et son site éditorial, jamais de panier par défaut.",
        ])))
    return page("Partie B · Concevoir", "vert", "Un business, une page ? La réponse",
                "Ni deux identités qui se concurrencent, ni une page enfermée dans un seul métier : une page, des "
                "espaces, un système derrière.", body)


def echelle(svg) -> str:
    body = figure(svg, "08-echelle-activite", "Schéma 6 — L'échelle de l'activité. On monte une marche quand le besoin "
                  "apparaît, sans changer d'adresse ni perdre ses abonnés.")
    body += encadre("vert", "Proposition : l'annonce de particulier (décision D03)", ul([
        "Une publication typée (univers, prix, lieu approximatif, photos), rattachée à la personne, sans page ni "
        "PRO.GA : ni stock, ni commande, ni encaissement, seulement une mise en relation.",
        "Quotas par univers et par mois ; catégories encadrées : vendre un terrain exige l'identité Vérifiée, publier "
        "un emploi exige une page employeur ; catégories interdites refusées.",
        "Contact par Messages en demande filtrée ; signalement et blocage ; retrait automatique à échéance.",
        "Au-delà d'un seuil, « Passer pro » : la page reprend les annonces, sans perte d'audience. Une porte de "
        "formalisation pour les 62,9 % d'entreprises informelles.",
    ]))
    return page("Partie B · Concevoir", "vert", "À quel moment une page, à quel moment un système ?",
                "Le particulier publie une annonce ; l'activité crée sa page ; la page active ses espaces ; "
                "l'entreprise branche PRO.GA. Institutions et médias suivent leur propre voie.", body)


def anatomie(svg) -> str:
    body = figure(svg, "09-anatomie-page-activite", "Schéma 7 — Anatomie d'une page d'activité. Le gabarit configure "
                  "les espaces ; PRO.GA alimente les espaces par projection publiée et reçoit les commandes privées.")
    body += table(["Gabarit", "Espaces par défaut", "Action principale"],
                  [[g[0], esc(g[1]), esc(g[3])] for g in D.GABARITS], compact=True)
    return page("Partie B · Concevoir", "vert", "Anatomie d'une page d'activité",
                "Quatre couches : la page sociale, le gabarit de spécialité, les espaces métier, PRO.GA.", body)


def offre(svg) -> str:
    body = figure(svg, "10-offre-et-besoin", "Schéma 8 — Une offre typée commune aux univers, un besoin exprimé par "
                  "l'acheteur. Le profil de rencontre n'est jamais une offre.")
    body += cols(
        encadre("ink", "Pourquoi un seul modèle d'offre", ul([
            "Une recherche, un index, des facettes par type : la base de MP03–MP04 et du catalogue V2.",
            "Les mêmes règles de confiance, de retrait et de modération partout.",
            "iAsted n'a qu'un langage à comprendre.",
        ])),
        encadre("bleu", "Le besoin, symétrique de l'offre", ul([
            "Univers, critères, budget, zone, échéance ; privé par défaut.",
            "Une alerte prévient quand une offre compatible arrive.",
            "PRO.GA modélise déjà le besoin B2B (needs) ; il manque celui du particulier.",
        ])))
    return page("Partie B · Concevoir", "ink", "L'offre et le besoin",
                "Toutes les spécialités partagent un modèle : c'est ce qui permet une seule recherche et un seul "
                "assistant.", body)


def parcours(svg) -> str:
    body = figure(svg, "11-parcours-louer-maison", "Schéma 9 — Parcours type dans l'univers Immobilier et foncier. Les "
                  "mêmes étapes valent pour une voiture à louer, un artisan, un traiteur ou un emploi.")
    body += table(["Étape", "Ce que voit la personne", "Ce qui se passe derrière"], [
        ["1 · Demande", "elle écrit ou dit son besoin à iAsted", "iAsted extrait univers, critères, budget, zone"],
        ["2 · Résultats", "cinq biens, badges et raisons du classement", "index public des offres admissibles ; "
                                                                         "sponsorisé à part"],
        ["3 · Choix", "« Demander une visite » sur deux biens", "confirmation explicite, aucune action sans elle"],
        ["4 · Contact", "la demande arrive à l'agence dans Messages", "contact commercial filtré (P10)"],
        ["5 · Organisation", "créneau, dossier, bail", "agenda et documents dans PRO.GA si l'agence l'utilise"],
        ["6 · Après", "avis vérifié", "avis lié à un engagement réel"],
    ], compact=True)
    return page("Partie B · Concevoir", "vert", "Un parcours type : louer une maison",
                "La promesse d'ANTSIA en six étapes : trouver vite, parler à la bonne personne, ne pas se faire "
                "arnaquer.", body)


def vie_publique(svg) -> str:
    body = figure(svg, "12-vie-publique-fil", "Schéma 10 — Les espaces réservés du fil. Officiel, Presse et badges "
                  "existent en source ; le sponsorisé et la densité plafonnée sont proposés.", max_width="92%")
    body += table(["Acteur", "Où il parle", "Ce qui le distingue", "Interdit"], D.VIE_PUBLIQUE, compact=True)
    return page("Partie B · Concevoir", "bleu", "La vie publique dans le réseau de tous",
                "administration.ga est le réseau fermé des agents ; ANTSIA donne aux mêmes administrations une place "
                "pour parler à toute la population, à côté des médias et des annonceurs, sans jamais les confondre.",
                body)


def federation(svg) -> str:
    body = figure(svg, "13-federation-administration", "Schéma 11 — Une publication d'administration n'entre dans "
                  "ANTSIA que par un geste explicite et un contrat signé ; l'agent public n'y existe que s'il le veut.")
    body += encadre("bleu", "Ce que l'étude ajoute à la fédération existante", ul([
        "Une catégorie <b>Alerte</b> réservée aux pages Officielles (coupures, intempéries, santé publique, résultats "
        "d'examens), en tête du fil, en nombre limité.",
        "Les liens <b>« Faire la démarche »</b> vers demarche.ga et <b>« Voir l'offre »</b> vers travail.ga, sans "
        "copier leurs données.",
        "Les <b>concours et recrutements publics</b> rejoignent l'univers Emploi, étiquetés Officiel.",
        "La <b>neutralité</b> : une page Officielle informe ; elle ne fait ni campagne ni publicité. Le badge se "
        "retire quand l'attestation tombe ; les comptes publics abandonnés sont archivés.",
    ]))
    return page("Partie B · Concevoir", "bleu", "De administration.ga à ANTSIA",
                "La chaîne existe en source (PA9) : pages et publications reflétées, agents volontaires. Reste à la "
                "configurer, à l'éprouver et à lui donner sa place dans le fil.", body)


def confiance(svg) -> str:
    body = figure(svg, "14-chaine-de-confiance", "Schéma 12 — La chaîne de confiance. Les trois premières lignes "
                  "existent (IDN en production, Agent public et Officiel en source) ; les autres sont proposées.")
    body += encadre("vert", "Le différenciateur d'ANTSIA",
                    "<p>Sur un réseau étranger, n'importe qui peut prétendre vendre un terrain. Sur ANTSIA, une annonce "
                    "peut afficher « Document contrôlé » parce que le service foncier l'a attesté par contrat signé. "
                    "<b>C'est la vie publique qui rend le business sûr.</b> Chaque label est calculé à l'affichage, "
                    "jamais saisi, gratuit, et disparaît si l'attestation est retirée.</p>")
    return page("Partie B · Concevoir", "vert", "La chaîne de confiance",
                "Ce qui est vérifié, par qui, et ce que voit le public.", body)


def navigation(svg) -> str:
    body = figure(svg, "15-navigation-proposee", "Schéma 13 — Navigation proposée. Les cinq destinations du téléphone et "
                  "les entrées existantes de Créer sont conservées.")
    body += table(["Destination", "Route", "État"], D.ROUTES, compact=True)
    return page("Partie B · Concevoir", "ink", "Réorganiser le site",
                "Ne pas ajouter d'icônes : ranger. Découvrir devient la porte des trois piliers ; chaque univers ouvre "
                "son espace spécialisé et revient au fil sans perdre sa place.", body)


# --- partie C : construire ---------------------------------------------------------------------
def architecture(svg) -> str:
    body = figure(svg, "16-architecture-ecosysteme", "Schéma 14 — Architecture de l'écosystème. Aucune base n'est lue "
                  "par un autre produit ; tout passe par des contrats signés, versionnés et rejouables.", max_width="80%")
    body += table(["Brique proposée", "Où", "Règle tenue"], [[esc(b[0]), esc(b[1]), esc(b[3])] for b in D.BRIQUES],
                  compact=True)
    return page("Partie C · Construire", "ink", "L'architecture",
                "ANTSIA garde le social et la présentation ; PRO.GA, la vérité commerciale ; les autorités délivrent "
                "les attestations ; iAsted passe par une passerelle unique.", body)


def iasted(svg) -> list[str]:
    p1 = figure(svg, "17-iasted-architecture", "Schéma 15 — iAsted dans ANTSIA : trois rôles, six étapes, la "
                "confirmation humaine à l'étape 5, huit garde-fous.", max_width="88%")
    p1 += cols(encadre("ink", "Ce qui existe", ul(D.IASTED_EXISTE)),
               encadre("vert", "Ce qu'il faut construire", ul(D.IASTED_CONSTRUIRE)))
    p2 = table(["Étape", "Contenu", "Pré-requis"], D.IASTED_ETAPES)
    p2 += encadre("rouge", "Ce que les agents d'achat ont appris (2024-2026)", ul([
        "Confirmation explicite avant tout achat (Google, protocole d'OpenAI et Stripe) ; mandats signés et "
        "plafonnés pour aller plus loin (AP2).",
        "Passage à un humain et reprise par le vendeur à tout moment (agent de Meta pour les entreprises).",
        "Ce que dit l'agent engage l'exploitant : Air Canada a été tenue par une politique inventée par son robot.",
        "Un agent a acheté sans accord (Operator) ; un autre a été détourné par une consigne cachée dans une page "
        "(Comet) ; un agent commerçant s'est laissé arracher des remises (Project Vend).",
        "ChatGPT a revu son achat intégré en mars 2026 : préparer, puis passer la main au parcours du vendeur.",
        "Le marquage de l'IA devient obligatoire : ordonnance 0011 (article 53, 12 mois) et AI Act européen.",
    ]))
    p2 += encadre("vert", "Proposition de coût", "<p>L'iAsted du membre est <b>gratuit dans ANTSIA</b>, financé par "
                  "les revenus professionnels ; l'agent du vendeur reste dans l'offre PRO.GA (essai de 90 jours puis "
                  "abonnement, barème provisoire). Cela tient la règle du cahier : « le citoyen ne paie jamais ».</p>")
    return [page("Partie C · Construire", "ink", "iAsted, l'assistant qui oriente, trouve et prépare",
                 "iAsted a été exclu d'ANTSIA lors de la duplication du socle ; l'étude propose de rouvrir ce choix "
                 "(D05), avec les garde-fous déjà éprouvés dans PRO.GA.", p1),
            page("Partie C · Construire", "ink", "iAsted : étapes et garde-fous",
                 "Chercher d'abord, répondre pour le vendeur ensuite, agir avec confirmation enfin ; les mandats "
                 "d'achat attendent l'ouverture des paiements.", p2)]


# --- partie D : décider et déployer ------------------------------------------------------------
def economie(svg) -> str:
    body = figure(svg, "19-modele-economique", "Schéma 16 — Qui paie quoi. Aucun taux n'est fixé ici : barèmes et "
                  "contrats restent à décider.")
    body += cols(
        encadre("vert", "Ce qui finance la confiance", "<p>Les revenus professionnels paient la modération, les "
                "vérifications et iAsted. Les mises en avant et le sponsorisé sont étiquetés, plafonnés et publiés "
                "dans une bibliothèque.</p>"),
        encadre("rouge", "Une tension tranchée", "<p>La vérification de base reste gratuite et calculée : on vend la "
                "visibilité et les outils, jamais le badge (contre-exemple : badge payant chez Jiji, abonnements "
                "« vérifiés » chez Meta).</p>"))
    return page("Partie D · Décider", "vert", "Le modèle économique",
                "Gratuit pour le citoyen, payé par les professionnels, toujours étiqueté.", body)


def feuille_de_route(svg) -> list[str]:
    p1 = figure(svg, "20-feuille-de-route", "Schéma 17 — Six vagues ordonnées par leurs dépendances. Les losanges "
                "jaunes sont des portes externes.")
    p1 += table(["Vague", "Porte de sortie"], [
        ["V0 · Décider et se conformer", "ADR accepté ; analyse de l'ordonnance 0011 et de la loi 025/2023"],
        ["V1 · Consolider l'existant", "MP14 ouvre Boutiques et Services en recette réelle"],
        ["V2 · Univers sans paiement en ligne", "pilote Grand Libreville mesuré"],
        ["V3 · Vie publique", "HAC consultée ; premières administrations reflétées"],
        ["V4 · iAsted", "évaluation au vert : exactitude, fuite, biais, injection"],
        ["V5 · Paiement, cérémonies, sorties", "contrat de paiement (porte externe)"],
        ["Sous condition · Rencontres", "preuve de majorité qualifiée (porte externe)"],
    ], compact=True)
    p2 = table(["Lot", "Contenu", "Dépend de", "Taille"], D.LOTS, compact=True)
    p2 += cols(
        encadre("ink", "Parallélisme possible", "<p>Après SU00 et SU01, les catalogues (SU03), les annonces (SU07), "
                "l'emploi (SU08) et iAsted (SU11) peuvent avancer en parallèle si leurs fichiers ne se recouvrent "
                "pas ; schéma, routes, i18n, registres et contrats gardent un seul responsable à la fois.</p>"),
        encadre("rouge", "Frontières", "<p>Implémenter dans les vrais sources ; préserver DIASPORALE et la session "
                "marketplace ; aucun changement de branche dans l'arbre partagé ; aucun fonds réel ni univers sous "
                "condition ouvert sans ses preuves.</p>"))
    return [page("Partie D · Décider", "ink", "La feuille de route",
                 "Ordonner par dépendances : d'abord ce qui existe, puis ce qui ne demande pas de paiement en ligne, "
                 "puis ce qui attend une condition externe.", p1),
            page("Partie D · Décider", "ink", "Les lots proposés",
                 "Préfixe SU, libre dans le dépôt. Les tailles sont relatives, pas des délais promis.", p2)]


def indicateurs() -> list[str]:
    p1 = table(["Domaine", "Indicateur", "Pourquoi"], D.INDICATEURS)
    p1 += encadre("ink", "Règle de mesure", "<p>Aucune cible chiffrée n'est fixée : elles se fixent après trois mois "
                  "de mesure réelle, conformément à la règle de véracité du programme. Les mesures sont consenties et "
                  "minimisées : aucune conversation, candidature ou préférence de rencontre dans l'analytique.</p>")
    p2 = table(["Risque", "Effet", "Parade"], D.RISQUES, compact=True)
    return [page("Partie D · Décider", "ink", "Indicateurs de réussite",
                 "On mesure des demandes utiles et des engagements tenus, pas le temps passé à faire défiler.", p1),
            page("Partie D · Décider", "ink", "Risques et parades",
                 "Les risques les plus graves sont la confiance, la conformité et l'image.", p2)]


def decisions() -> list[str]:
    p1 = table(["", "Décision", "Recommandation", "Si non", "Statut"],
               [[f"<b>{d[0]}</b>", f"<b>{esc(d[1])}</b>", esc(d[2]), esc(d[3]),
                 pastille(d[4], "vert" if d[4] == "validée" else "gris")] for d in D.DECISIONS], compact=True)
    teintes = {"fait": "vert", "livrée": "bleu", "à faire": "gris"}
    p2 = table(["Critère pour dire « on part »", "État", "Preuve ou responsable"],
               [[esc(c), pastille(e, teintes[e]), esc(p)] for c, e, p in D.CRITERES_GO])
    p2 += cols(encadre("ink", "Au propriétaire", ul([esc(a) for a in D.ACTIONS_PROPRIETAIRE])),
               encadre("vert", "Prochains lots", ul([esc(lot) for lot in D.PROCHAINS_LOTS])))
    return [page("Partie D · Décider", "ink", "Les décisions",
                 "D01 à D08 ont été validées par le propriétaire le 21 octobre 2026 et consignées dans l'ADR-0035 ; "
                 "D09 à D12 restent à décider. Les portes externes (paiement, majorité, conventions) ne bloquent pas "
                 "le reste.", p1),
            page("Partie D · Décider", "ink", "Où en est-on au 21 octobre",
                 "Les décisions sont prises et la conformité est analysée. Restent les gestes du propriétaire, les "
                 "arbitrages juridiques et les premiers sous-lots de SU01.", p2)]


def sources() -> str:
    body = "<ol class='sources'>" + "".join(f"<li>{s}</li>" for s in D.SOURCES) + "</ol>"
    return page("Annexe", "ink", "Sources", "Sources locales (code, ADR, études) et références externes consultées le "
                "21 octobre 2026.", body)


def document(svg) -> str:
    parts = [couverture(), resume(), sommaire(), *constat(svg), *selection(svg), piliers(svg), roue(svg),
             univers(svg), *fiches(), *benchmark(svg), modeles(svg), echelle(svg), anatomie(svg), offre(svg),
             parcours(svg), vie_publique(svg), federation(svg), confiance(svg), navigation(svg), architecture(svg),
             *iasted(svg), economie(svg), *feuille_de_route(svg), *indicateurs(), *decisions(), sources()]
    return "".join(parts)
