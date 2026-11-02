// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ProfilReseauSection.tsx @ ad2e7fdc2 — adaptations : la gestion de MON profil social (montée sur ma fiche, `ProfilPersonnePage`) au lieu d'un onglet des paramètres de l'espace ; ma personne lue sur le moteur (`people.persons.getMyPerson`, sur soi) — plus de compte administratif (`functions.users.getMe`) ni de « photo du compte » à reprendre (rien n'est repris du compte : invariant 7), d'où le retrait de la panne du compte et du lien vers les paramètres du compte (`parametresHref`) ; aperçu offert pour un profil PUBLIÉ seulement, à l'adresse de ma fiche composée par `useRoutes().profile(handle)` (`profileApercuHref`) ; copie de visibilité lue par `visibilityFacts(t)` / `visibilityActions(t)` ; « vu par mes collègues » devient « vu par les membres du réseau » ; textes par l'i18n (`reseau:profilReseauSection.*`) ; historique du compte plateforme du socle retiré des commentaires.
"use client"

/**
 * La gestion de MON profil de réseau — publier, choisir son identifiant, sa
 * photo et sa couverture, passer hors connexion, se retirer.
 *
 * L'éditeur lui-même n'est PAS réécrit ici : c'est `ProfilePublicationCard`.
 * Un profil ne s'édite qu'à un seul endroit ; le déplacer voulait dire changer
 * sa PLACE, pas en faire une seconde copie qui divergerait au premier ajout de
 * champ.
 *
 * Ce que la section ajoute, c'est le contexte que la carte seule ne peut pas
 * porter : ce que publier veut dire, et ce que cela ne veut pas dire.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useRoutes } from "@antsia/api/network"
import { useRouter } from "@antsia/api/routing"
import { Alert } from "@antsia/ui"
import { useTranslation } from "react-i18next"
import { ProfilePublicationCard } from "./ProfilePublicationCard"
import { PrivacyLists } from "./PrivacyLists"
import { profileApercuHref } from "./profil-personne"
import { visibilityActions, visibilityFacts } from "./profile-visibility-copy"

export function ProfilReseauSection() {
  const { t } = useTranslation("reseau")
  const router = useRouter()
  const routes = useRoutes()
  /**
   * L'adresse publique d'un profil PUBLIÉ, et elle seule : c'est ce qui décide
   * si un aperçu est ATTEIGNABLE. Sans profil publié — jamais publié, ou
   * retiré, l'identifiant restant réservé — proposer l'aperçu mènerait sur une
   * fiche fermée ; une lecture en échec retombe du même côté (`data` absente ⇒
   * pas de bouton) : mieux vaut ne rien offrir qu'offrir un lien mort.
   */
  const mine = useAuthenticatedConvexQuery(
    api.modules.people.persons.getMyPerson,
    {},
  )
  const handle =
    mine.data !== undefined && mine.data !== null && mine.data.published
      ? (mine.data.handle ?? null)
      : null
  const facts = visibilityFacts(t)
  const actions = visibilityActions(t)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Les trois faits viennent d'un module PUR partagé
          (`profile-visibility-copy.ts`) : une seule source, pour que la
          prochaine révision n'en laisse pas deux derrière elle. */}
      <Alert tone="info" title={t("profilReseauSection.facts.title")}>
        <ul
          style={{
            listStyle: "none",
            margin: "0 0 8px",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {facts.map((fact) => (
            <li key={fact.id} style={{ lineHeight: 1.5 }}>
              <strong style={{ display: "block" }}>{fact.title}</strong>
              {fact.body}
            </li>
          ))}
        </ul>
        {t("profilReseauSection.facts.imagesNote")}
      </Alert>

      {/* L'aperçu n'est offert que si l'adresse mène à une fiche ouverte :
          un bouton qui mènerait à un refus vaut moins que pas de bouton du
          tout. */}
      {handle === null ? null : (
        <div>
          <button
            type="button"
            onClick={() => router.push(profileApercuHref(routes.profile(handle)))}
            style={{
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: "var(--esp-primitive-button-radius, 8px)",
              border: "1px solid var(--ink-200)",
              background: "var(--ink-0)",
              color: "var(--ink-900)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("profilReseauSection.preview")}
          </button>
        </div>
      )}

      <ProfilePublicationCard />
      <PrivacyLists />

      {/* Deux gestes DISTINCTS, et la carte ci-dessus porte les deux boutons :
          les dire d'une seule voix ferait promettre à l'un ce que seul l'autre
          fait. Chacun s'annonce en deux moitiés — ce qu'il produit, ce qu'il
          laisse intact — parce qu'un retrait dont on ignore la réversibilité
          ne se tente pas. « Sourdine », « masquer » et « bloquer » visent une
          AUTRE personne : ils vivent dans les listes ci-dessus, pas ici. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontSize: 12,
          color: "var(--ink-600)",
        }}
      >
        {(["hors_connexion", "retrait"] as const).map((id) => {
          const action = actions[id]
          return (
            <p key={action.id} style={{ margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: "var(--ink-800)" }}>{action.label}</strong>
              {" — "}
              {action.consequence} {action.reversibilite}
            </p>
          )
        })}
      </div>
    </div>
  )
}
