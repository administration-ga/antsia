// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/mobile/ReseauMobileHeader.tsx @ ad2e7fdc2 — adaptations : sans la coque de l'espace agent (`espace-mobile-volets` retiré) — la porte d'iCom mène à la messagerie en pages de l'application (`useRoutes().messages()`), la cloche du moteur montée sans base de l'espace (ses cibles se composent sur `useRoutes()`) ; `profileHref` devient `string | null` (un profil non publié n'a pas d'adresse : la pastille reste, sans lien) ; libellés par l'i18n (`reseau:reseauMobileHeader.*`, nom accessible d'iCom accordé par `count`) ; « iRéseau » devient « réseau » ; rendu, recherche à la demande et focus inchangés ; P02 (18/10/2026) : sous la navigation par destinations déclarée par l'application, la porte d'iCom et la pastille du profil quittent l'en-tête (Messages et Profil sont des destinations de la barre) — la recherche et la cloche restent. ; bascule clair/sombre en un appui (`AppearanceToggle`) à côté de la cloche, au rond des icônes de l'en-tête ; ADR-0028 : sous la présentation « charte », l'en-tête des chartes à la lettre — la marque, puis la recherche, la cloche et la porte des messages (pastille comprise, même sous la navigation par destinations), sans bascule clair/sombre (Paramètres > Affichage et la barre des autres pages la gardent) ni filet sous l'en-tête.
"use client"

/**
 * ReseauMobileHeader — l'en-tête collant de la coquille mobile.
 *
 * Quatre choses, et rien d'autre : où l'on est (« Réseau »), une recherche
 * ouverte à la demande, la porte d'iCom, qui l'on est. Deux en-têtes empilés
 * au-dessus d'un fil lui prendraient le tiers de l'écran : la coque de
 * l'application n'en pose pas d'autre sur cette page.
 *
 * La porte d'iCom est arrivée le 2026-08-21, quand l'onglet « Messages » a
 * quitté la barre basse : sans elle, répondre à un message depuis le fil
 * coûtait deux gestes de menu. C'est une NAVIGATION vers la messagerie — le
 * motif de la messagerie des réseaux sociaux — pas une réintégration du volet.
 *
 * ⚠️ Le mot « Réseau » est rendu par un `<p>`, pas par un `<h1>`. La page en
 * porte déjà un, en `sr-only` (cf. `ReseauMobilePage`) : deux titres de
 * niveau 1 donneraient deux points d'entrée à un lecteur d'écran, sur une page
 * qui n'en a qu'un.
 *
 * ⚠️ Le champ de recherche est à ≥ 16 px de corps. Sous ce seuil, Safari iOS
 * ZOOME automatiquement à la mise au point et laisse la page zoomée après la
 * saisie — l'écrire ici évite d'en dépendre ailleurs pour un champ qui est le
 * geste principal de l'en-tête.
 */

import { useNetwork, useNetworkNavigationLayout, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Icon, TextInput } from "@antsia/ui"
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { NotificationBell } from "../../features/notifications/NotificationBell"
import { AppearanceToggle } from "../appearance/AppearanceToggle"
import { Avatar } from "../../features/reseau-personnel/Avatar"
import { formatUnreadBadge } from "../../features/reseau-personnel/shared"
import { useReseauDestinationRoutes } from "../reseau-menu-destinations-ui"
import { ReseauCreateAction } from "../ReseauCreateAction"

export interface ReseauMobileHeaderProps {
  /** Lance la recherche — le parent décide ce que « chercher » veut dire. */
  onSearch: (query: string) => void
  /** La recherche EN COURS, pour que le champ reparte de ce qu'on regarde. */
  searchQuery: string
  /** Mon profil (`useRoutes().profile(handle)`) — `null` tant qu'il n'est pas publié. */
  profileHref: string | null
  avatarUrl: string | null
  displayName: string
  /** Conversations non lues d'iCom — la pastille de la porte d'en-tête. */
  unreadMessages?: number
}

export function ReseauMobileHeader({ onSearch, searchQuery, profileHref, avatarUrl, displayName, unreadMessages }: ReseauMobileHeaderProps) {
  const { t } = useTranslation("reseau")
  const routes = useRoutes()
  /* Navigation par destinations : Messages et Profil sont des places de la
     barre basse — les répéter ici donnerait deux portes et deux pastilles. */
  const destinations = useReseauDestinationRoutes() !== null
  const { wordmark, postPresentation } = useNetwork()
  /* L'en-tête des chartes (ADR-0028) : recherche, cloche, messages — la porte
     des messages reste même quand la barre basse en porte une. */
  const charte = postPresentation === "charte"
  /* U09 (épure, opt-in adaptatif) : Messages est une place de la barre basse ;
     l'en-tête n'en répète pas la porte ni la pastille. */
  const { adaptive } = useNetworkNavigationLayout()
  const showMessagesDoor = !adaptive && (charte || !destinations)
  /**
   * Le brouillon est LOCAL, semé par la recherche en cours. Remonter chaque
   * frappe au parent relancerait la query à chaque lettre : la recherche se
   * valide, elle ne se devine pas (même conduite que sur le bureau).
   */
  const [draft, setDraft] = useState(searchQuery)
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setDraft(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    if (!searchOpen) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [searchOpen])

  const closeSearch = () => {
    setDraft(searchQuery)
    setSearchOpen(false)
    window.requestAnimationFrame(() => searchButtonRef.current?.focus())
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(draft.trim())
    setSearchOpen(false)
    window.requestAnimationFrame(() => searchButtonRef.current?.focus())
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    closeSearch()
  }

  const unreadBadge = formatUnreadBadge(unreadMessages)
  const avatar = <Avatar displayName={displayName} avatarUrl={avatarUrl} size={34} />

  /* La porte d'iCom. PAS d'`aria-label` sec : le nom accessible se compose du
     `sr-only` — pastille comprise quand elle existe. */
  const messagesDoor = showMessagesDoor ? (
    <Link href={routes.messages()} className="rm-tab min-h-11 min-w-11" style={{ flex: "0 0 auto", width: 44 }}>
      <span className="rm-tab-icon">
        <Icon name="messageCircle" size={20} />
        {unreadBadge !== null ? (
          <span className="rm-tab-badge">
            <span aria-hidden="true">{unreadBadge}</span>
          </span>
        ) : null}
      </span>
      <span className="sr-only">
        {unreadMessages !== undefined && unreadMessages > 0
          ? t("reseauMobileHeader.icomOpenWithUnread", { count: unreadMessages })
          : t("reseauMobileHeader.icomOpen")}
      </span>
    </Link>
  ) : null

  return (
    <header className="rm-header" data-presentation={charte ? "charte" : undefined}>
      <div className="rm-header-row">
        {!searchOpen ? <ReseauCreateAction /> : null}
        {searchOpen ? (
          <form role="search" aria-label={t("reseauMobileHeader.searchLabel")} onSubmit={submit} className="rm-search">
            <div style={{ minWidth: 0, flex: 1 }}>
              <TextInput
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={t("reseauMobileHeader.searchPlaceholder")}
                aria-label={t("reseauMobileHeader.searchLabel")}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  background: "var(--card)",
                  paddingTop: 10,
                  paddingBottom: 10,
                  paddingLeft: 14,
                  paddingRight: 14,
                  fontSize: 16,
                }}
              />
            </div>
            <button
              type="submit"
              aria-label={t("reseauMobileHeader.searchSubmit")}
              className="rm-tab min-h-11 min-w-11"
              style={{ flex: "0 0 auto", width: 44 }}
            >
              <Icon name="search" size={18} />
            </button>
            <button
              type="button"
              aria-label={t("reseauMobileHeader.searchClose")}
              className="rm-tab min-h-11 min-w-11"
              style={{ flex: "0 0 auto", width: 44 }}
              onClick={closeSearch}
            >
              <Icon name="x" size={18} />
            </button>
          </form>
        ) : (
          <>
            {/* La marque de l'application quand elle la déclare (ADR-0027), et son
                point d'identité ; sinon le libellé neutre du moteur. */}
            <p className="rm-wordmark" data-brand={wordmark !== null ? "" : undefined}>
              {wordmark ?? t("reseauMobileHeader.wordmark")}
              {wordmark !== null ? <span className="rm-wordmark-dot" aria-hidden="true" /> : null}
            </p>
            <button
              ref={searchButtonRef}
              type="button"
              aria-label={searchQuery.length > 0 ? t("reseauMobileHeader.searchEdit") : t("reseauMobileHeader.searchOpen")}
              aria-expanded={searchOpen}
              className="rm-tab min-h-11 min-w-11"
              style={{ flex: "0 0 auto", width: 44 }}
              onClick={() => setSearchOpen(true)}
            >
              <Icon name="search" size={20} />
            </button>
          </>
        )}
        {/* Les chartes (ADR-0028) : recherche, cloche, messages, dans cet ordre. */}
        {charte ? null : messagesDoor}
        {/* La cloche. Sur la page réseau au téléphone, la coque n'en pose
            aucune autre : sans elle, ce réseau serait le SEUL endroit sans
            accès aux notifications (R-03). Elle est posée ici, à la facture
            des onglets. */}
        {/* Le mode sombre en un appui (ADR-0027), au rond des icônes de l'en-tête —
            hors de l'en-tête des chartes, qui ne le porte pas. */}
        {charte ? null : <AppearanceToggle className="rm-tab min-h-11 min-w-11" style={{ flex: "0 0 auto", width: 44 }} />}
        <NotificationBell variant="reseau" />
        {charte ? messagesDoor : null}
        {destinations ? null : profileHref !== null ? (
          <Link href={profileHref} className="rm-avatar-link" aria-label={t("reseauMobileHeader.profileLink")}>
            {/* `Avatar` porte déjà `aria-hidden` : le nom du lien vient de
                l'`aria-label` ci-dessus, jamais des initiales. */}
            {avatar}
          </Link>
        ) : (
          // Sans profil publié, pas d'adresse : la pastille reste, décorative.
          <span className="rm-avatar-link">{avatar}</span>
        )}
      </div>
    </header>
  )
}
