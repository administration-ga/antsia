// Dupliqué de socle/packages/agent-features/src/features/messagerie/IcomRelationsPanel.tsx @ ad2e7fdc2 — adaptations : portée poste/personnel retirée (`useOptionalOrg`, fonction et administration de la ligne d'identité) — toujours l'espace personnel ; appel par `calls.direct.callMember({ networkId, target: { personId } })` au lieu de `reseauPersonnel.messagerie.callByHandle` (la relation porte sa personne, `otherPersonId`) ; refus sans phrase du serveur (raison à code traduite par l'écran de fin) ; groupes par `groups.threads.paginateMyGroupThreads` (une page bornée, comme la liste du socle) ; relations du graphe du réseau (`use-dual-connection-pagination`, `use-relation-search`) avec leurs badges calculés ; nom nul d'une relation rendu par le libellé neutre ; textes traduits (i18n `messagerie`, clés `icomRelationsPanel.…`) ; « iRéseau » devient « le réseau » ; couleurs par fonction (ADR-0027) : « Écrire à » marqué `data-role="message"`, aux couleurs des messages quand il est l'action mise en avant. ; IM-01 (IC-04) : boutons d'appel d'une relation et vue « Nouvel appel » retirés quand l'application déclare `callsAvailable={false}`.
"use client"

/**
 * Les relations du RÉSEAU, servies par deux onglets d'iCom.
 *
 * Un seul composant, deux gestes — c'est le `mode` qui change, pas la donnée :
 *   - `appel`   → l'action première est d'APPELER ;
 *   - `contact` → l'action première est d'ÉCRIRE, et la fiche se consulte.
 *
 * ⚠️ La source est le graphe des relations (`graph.connections.paginateMine`),
 * jamais un annuaire. Il n'y a donc pas de recherche « dans tout le réseau »
 * ici : on ne peut joindre que qui l'on connaît. Trouver quelqu'un de nouveau
 * est le métier du volet Relations du réseau, qui passe par une demande de
 * connexion.
 */

import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useCallsAvailable, useNetwork } from "@antsia/api/network"
import { useMutation } from "convex/react"
import { MessageCircle, Phone, Search, Users, Video } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PostIdentityLines } from "../../components/identity"
import { callErrorMessage } from "../iappel/call-errors"
import { useCallStore } from "../../stores/call-store"
import { Avatar } from "../reseau-personnel/Avatar"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { usePersonalConnections } from "../reseau-personnel/use-dual-connection-pagination"
import { useRelationSearch } from "../reseau-personnel/use-relation-search"
import { IcomBrickHeader } from "./IcomBrickHeader"
import { GroupeAvatar } from "./GroupeAvatar"
import { nomAffichable } from "./groupe-gestion"
import { apercuThread } from "./messagerie-liste"
import {
  deriveRecipientListState,
  shouldOfferMoreRecipients,
} from "./messagerie-recipients"
import { refusalEndKind } from "../iappel/call-phase"
import { PresenceDot, useConnectionsPresence } from "../iappel/presence-dot"

/**
 * Les groupes listés par la brique : une page, la plus active. La liste du
 * socle s'arrêtait déjà aux cinquante appartenances les plus récentes, et le
 * serveur plafonne une page à cinquante.
 */
const GROUPES_PAR_PAGE = 50

export interface IcomRelationsPanelProps {
  mode: "appel" | "contact"
  /** Ouvre le BROUILLON vers une relation — le fil naît au premier envoi. */
  onOpenDraft: (handle: string) => void
  /** Ouvre une conversation de groupe existante. */
  onOpenGroup: (threadId: string) => void
  /** Ouvre le composeur de conversation de groupe. */
  onCreateGroup: () => void
  /**
   * La carte est-elle dépliée ? L'en-tête se rend TOUJOURS — c'est lui qui
   * porte le chevron de repli — mais le corps, lui, suit l'état de la carte,
   * exactement comme la liste des conversations.
   */
  open?: boolean
  /**
   * `dock` (défaut) = la carte repliable du bureau. `page` = la brique
   * mobile pleine page (barre iCom, ADR-0079) : en-tête SANS chevron — le
   * repli commande la carte, il n'a pas de sens en pleine page — et corps
   * toujours ouvert.
   */
  variant?: "dock" | "page"
  /** La barre globale de l'hôte porte-t-elle déjà Rétracter/Détacher ? */
  showDockControls?: boolean
  /**
   * Le JOURNAL des appels, rendu par la brique iAppel (mode `appel` seul).
   *
   * Fourni, le corps porte une bascule « Journal / Nouvel appel » et s'ouvre
   * sur le journal : c'est ce qu'on vient consulter en ouvrant iAppel, la
   * liste des relations servant à COMPOSER un appel — l'ordre d'un téléphone.
   * Il arrive comme fonction de rendu plutôt qu'en import direct pour que ce
   * panneau ne dépende pas de la tranche `iappel` (qui, elle, importe déjà
   * `messagerie/VoiceRecorderButton`). La fonction reçoit les deux contrôles
   * de niveau « Journal / Nouvel appel »
   * afin de les poser DANS la même rangée que « Tous / Manqués ». Deux rangées
   * de filtres superposées casseraient la hiérarchie et doubleraient la
   * hauteur de l'en-tête sur téléphone.
   */
  journal?: (viewControls: ReactNode) => ReactNode
}

/**
 * L'identité minimale d'une relation, telle que la fenêtre d'appel la NOMME —
 * et la PERSONNE qu'on appelle.
 *
 * ⚠️ Type NOMMÉ, et pas inline dans la signature de `ring` : un type d'objet
 * écrit dans la signature se lit mal là où l'on cherche la garde du corps.
 */
interface RelationIdentity {
  personId: Id<"persons">
  handle: string
  displayName: string
  avatarUrl: string | null
}

/**
 * Une relation sans handle est une personne qui s'est DÉPUBLIÉE : elle reste
 * ma connexion, mais elle n'a plus d'adresse à laquelle la joindre. L'écarter
 * est plus honnête que d'afficher un bouton qui échouerait — pour les pages
 * chargées comme pour les résultats de recherche.
 */
function hasPublishedHandle<P extends { handle: string | null }>(
  person: P,
): person is P & { handle: string } {
  return typeof person.handle === "string" && person.handle.length > 0
}

export function IcomRelationsPanel({
  mode,
  onOpenDraft,
  onOpenGroup,
  onCreateGroup,
  open = true,
  variant = "dock",
  journal,
  showDockControls = true,
}: IcomRelationsPanelProps) {
  const { t } = useTranslation("messagerie")
  const { networkId } = useNetwork()
  // IM-01 : sans appels déclarés, ni bouton d'appel sur une relation ni vue « Nouvel appel » (le journal reste).
  const callsAvailable = useCallsAvailable()
  const asPage = variant === "page"
  const bodyOpen = asPage ? true : open
  const bodyId = useId()
  const relations = usePersonalConnections({ pageSize: 25 })
  /**
   * La présence de mes relations — « disponible », « en appel », « ne pas
   * déranger ». Elle change la décision d'appeler AVANT de composer : appeler
   * quelqu'un qu'on sait en ligne évite un manqué de plus, et voir un silence
   * déclaré évite d'insister.
   *
   * ⚠️ Rendue par le serveur pour les SEULES relations, et seulement si la
   * personne accepte de la partager — ce n'est pas un annuaire de qui est en
   * ligne. Une relation absente de la réponse veut dire « on ne sait pas », et
   * l'écran n'affiche alors aucune pastille plutôt que d'en inventer une.
   */
  const { presenceOf } = useConnectionsPresence()
  const call = useMutation(api.modules.calls.direct.callMember)
  /**
   * ⚠️ L'onglet iAppel n'ouvrait AUCUNE fenêtre chez l'appelant (corrigé le
   * 2026-08-20) : l'appelé sonnait, l'appelant restait devant sa liste avec un
   * toast. C'est le store d'appel qui monte la fenêtre sortante — canal iAppel.
   */
  const { openOutgoingCall, openRefusedCall } = useCallStore()
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null)
  /**
   * Quelle vue la brique iAppel montre : le JOURNAL (défaut) ou la liste des
   * relations pour composer un nouvel appel. N'existe qu'en mode `appel` avec
   * un journal fourni — en mode `contact`, il n'y a rien à basculer.
   */
  const [journalView, setJournalView] = useState<"journal" | "relations">(
    "journal",
  )
  const [contactView, setContactView] = useState<"relations" | "groupes">(
    "relations",
  )
  const hasJournal = mode === "appel" && journal !== undefined
  const showJournal = hasJournal && (journalView === "journal" || !callsAvailable)
  const showGroups = mode === "contact" && contactView === "groupes"
  const groupes = useAuthenticatedConvexQuery(
    api.modules.groups.threads.paginateMyGroupThreads,
    showGroups
      ? {
          networkId,
          paginationOpts: { numItems: GROUPES_PAR_PAGE, cursor: null },
        }
      : "skip",
  )
  const listeGroupes = groupes.data?.page ?? []

  const items = relations.items.filter(hasPublishedHandle)
  /**
   * Chercher parmi TOUTES mes relations (IC-05) — le même sélecteur que le
   * « nouveau message » : pré-filtre instantané des pages chargées, puis, dès
   * deux caractères, la recherche SERVEUR `graph.connections.searchMine`.
   * Aucune recherche dans l'annuaire : on ne peut joindre que qui l'on connaît.
   */
  const [requete, setRequete] = useState("")
  const terme = requete.trim()
  const recherche = useRelationSearch(terme)
  const etat = deriveRecipientListState({
    terme,
    loaded: items,
    hasMore: relations.hasMore,
    search: { ...recherche, items: recherche.items.filter(hasPublishedHandle) },
  })
  const lignes = (etat.kind === "vide" ? [] : etat.items).filter(hasPublishedHandle)

  // Écrire n'ouvre PAS un fil vide : un fil sans message n'est pas une
  // conversation. Le brouillon porte l'intention jusqu'au premier envoi, qui
  // le promeut.
  const write = (handle: string) => onOpenDraft(handle)

  /**
   * Appeler une relation.
   *
   * ⚠️ `mediaType` était codé en dur à `"audio"` : le bouton « Appeler » de
   * cette carte ne pouvait donc JAMAIS ouvrir un appel vidéo, et la caméra
   * activée à la main en cours d'appel se faisait recouper à la première
   * reconnexion (la salle avait été montée avec `video={false}`). Le média
   * demandé voyage maintenant jusqu'au serveur, qui le grave sur l'appel.
   *
   * ⚠️ L'identité de l'appelé voyage AUSSI : sans elle, la fenêtre d'appel
   * s'intitulait « Appeler » avec l'initiale « A » — elle ne savait pas qui
   * elle appelait, alors que l'utilisateur venait de le choisir dans cette
   * liste même.
   */
  const ring = async (
    person: RelationIdentity,
    mediaType: "audio" | "video",
  ) => {
    setBusyPersonId(person.personId)
    const callee = {
      userId: person.personId,
      name: person.displayName,
      avatarUrl: person.avatarUrl,
      handle: person.handle,
    }
    try {
      const appel = await call({
        networkId,
        target: { personId: person.personId },
        mediaType,
      })
      // Le destinataire peut avoir écarté l'appel (ne pas déranger, ligne
      // occupée, hors de ses relations). Ce n'est pas une erreur : le serveur
      // rend la raison, et aucune fenêtre d'appel ne s'ouvre.
      if (appel.admitted === false) {
        // L'écran de FIN plutôt qu'un toast : il dit la raison et il laisse
        // déposer un message vocal — un toast disparaît sans rien offrir.
        openRefusedCall({
          meetingId: appel.callId,
          mediaType,
          endKind: refusalEndKind(appel.reason),
          voicemailOffered: appel.voicemailOffered,
          scope: "personnel",
          callee,
        })
        return
      }
      // La fenêtre d'appel SORTANT est montée par la coque dès que le store
      // porte l'appel — cette carte ne rend elle-même aucune salle.
      openOutgoingCall({
        meetingId: appel.callId,
        participantUserId: person.personId,
        mediaType: appel.mediaType,
        startedAt: Date.now(),
        scope: "personnel",
        callee,
      })
    } catch (err) {
      toast.error(callErrorMessage(err, t), { duration: 8000 })
    } finally {
      setBusyPersonId(null)
    }
  }

  const title =
    mode === "appel"
      ? t("icomRelationsPanel.titleCall")
      : t("icomRelationsPanel.titleContact")
  const appelViewControls = hasJournal && callsAvailable ? (
    <>
      <button
        type="button"
        className="msg-filter-btn"
        aria-pressed={journalView === "journal"}
        onClick={() => setJournalView("journal")}
      >
        {t("icomRelationsPanel.viewJournal")}
      </button>
      <button
        type="button"
        className="msg-filter-btn"
        aria-pressed={journalView === "relations"}
        onClick={() => setJournalView("relations")}
      >
        {t("icomRelationsPanel.viewNewCall")}
      </button>
    </>
  ) : null

  return (
    <>
      <IcomBrickHeader
        icon={mode === "appel" ? Phone : Users}
        title={title}
        repliable={!asPage}
        open={bodyOpen}
        bodyId={bodyId}
        showDockControls={showDockControls}
      />

      {bodyOpen ? (
    <div className="msg-body" id={bodyId} role="group" aria-label={
      mode === "appel"
        ? t("icomRelationsPanel.bodyCall")
        : t("icomRelationsPanel.bodyContact")
    }>
      {hasJournal && !showJournal ? (
        <div
          className="msg-filter-row"
          role="group"
          aria-label={t("icomRelationsPanel.viewSwitch")}
        >
          {appelViewControls}
        </div>
      ) : null}

      {mode === "contact" ? (
        <div
          className="msg-filter-row"
          role="group"
          aria-label={t("icomRelationsPanel.contactSwitch")}
        >
          <button
            type="button"
            className="msg-filter-btn"
            aria-pressed={contactView === "relations"}
            onClick={() => setContactView("relations")}
          >
            {t("icomRelationsPanel.contactRelations")}
          </button>
          <button
            type="button"
            className="msg-filter-btn"
            aria-pressed={contactView === "groupes"}
            onClick={() => setContactView("groupes")}
          >
            {t("icomRelationsPanel.contactGroups")}
          </button>
        </div>
      ) : null}

      {showGroups ? (
        <>
          <div
            style={{ display: "flex", justifyContent: "flex-end", padding: "8px 4px 4px" }}
          >
            <button
              type="button"
              className="icom-relations-action"
              style={{ minHeight: 44 }}
              onClick={onCreateGroup}
            >
              {t("icomRelationsPanel.newGroup")}
            </button>
          </div>
          {groupes.isLoading ? (
            <p className="icom-relations-empty">
              {t("icomRelationsPanel.groupsLoading")}
            </p>
          ) : groupes.isError ? (
            <ReseauQueryError
              title={t("icomRelationsPanel.groupsErrorTitle")}
              message={t("icomRelationsPanel.groupsErrorMessage")}
              onRetry={() => void groupes.refetch()}
            />
          ) : listeGroupes.length === 0 ? (
            <p className="icom-relations-empty">
              {t("icomRelationsPanel.groupsEmpty")}
            </p>
          ) : (
            <ul className="msg-list" aria-label={t("icomRelationsPanel.groupsList")}>
              {listeGroupes.map((groupe) => (
                <li key={String(groupe.threadId)}>
                  <button
                    type="button"
                    className="msg-row"
                    data-unread={groupe.unreadCount > 0 ? "true" : "false"}
                    onClick={() => onOpenGroup(String(groupe.threadId))}
                  >
                    <GroupeAvatar
                      title={groupe.title}
                      avatarUrl={groupe.avatarUrl}
                      size={variant === "page" ? 44 : 32}
                    />
                    <span className="msg-row-main">
                      <span className="msg-row-name">{groupe.title}</span>
                      <span className="msg-row-preview">
                        {t("icomRelationsPanel.groupPreview", {
                          membres: t("icomRelationsPanel.groupMembers", {
                            count: groupe.memberCount,
                          }),
                          apercu: apercuThread(
                            groupe.lastMessageText,
                            groupe.lastMessageByMe,
                            t,
                          ),
                        })}
                      </span>
                    </span>
                    {groupe.unreadCount > 0 ? (
                      <>
                        <span aria-hidden="true" className="msg-badge">
                          {groupe.unreadCapped ? "99+" : groupe.unreadCount}
                        </span>
                        <span className="sr-only">
                          {t("icomRelationsPanel.groupUnread", {
                            count: groupe.unreadCount,
                          })}
                        </span>
                      </>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : showJournal ? (
        journal?.(appelViewControls)
      ) : (
        <>
        {/* Un <label> : toute la pastille (44 px) donne le focus au champ. */}
        <label className="msg-search-row" style={{ minHeight: 44 }}>
          <Search aria-hidden="true" size={14} />
          <input
            type="search"
            value={requete}
            placeholder={t("icomRelationsPanel.searchPlaceholder")}
            aria-label={
              mode === "appel"
                ? t("icomRelationsPanel.searchCall")
                : t("icomRelationsPanel.searchContact")
            }
            onChange={(event) => setRequete(event.target.value)}
          />
        </label>
        {relations.isLoading ? (
        <p className="icom-relations-empty">
          {t("icomRelationsPanel.relationsLoading")}
        </p>
      ) : relations.isError ? (
        <ReseauQueryError
          title={t("icomRelationsPanel.relationsErrorTitle")}
          message={t("icomRelationsPanel.relationsErrorMessage")}
          onRetry={relations.retry}
        />
      ) : items.length === 0 ? (
        <p className="icom-relations-empty">
          {t("icomRelationsPanel.relationsEmpty")}
        </p>
      ) : (
        <>
        {etat.kind === "erreur" ? (
          <ReseauQueryError
            title={t("icomRelationsPanel.searchErrorTitle")}
            message={t("icomRelationsPanel.searchErrorMessage")}
            onRetry={recherche.refetch}
          />
        ) : null}
        {etat.kind === "attente" ? (
          <p className="icom-relations-empty" role="status">
            {t("icomRelationsPanel.searchPending")}
          </p>
        ) : null}
        {etat.kind === "vide" ? (
          etat.exhaustive ? (
            <p className="icom-relations-empty">
              {t("icomRelationsPanel.searchNoMatch", { terme })}
            </p>
          ) : (
            <p className="icom-relations-empty">
              {t("icomRelationsPanel.searchNoLoadedMatch", { terme })}
            </p>
          )
        ) : null}
        {lignes.length > 0 ? (
        <ul className="icom-relations-list">
          {lignes.map((person) => {
            const busy = busyPersonId === person.otherPersonId
            const nom = nomAffichable(person.displayName, t)
            const identite: RelationIdentity = {
              personId: person.otherPersonId,
              handle: person.handle,
              displayName: nom,
              avatarUrl: person.avatarUrl,
            }
            return (
              <li key={person.connectionId} className="icom-relations-row">
                <Avatar
                  displayName={nom}
                  avatarUrl={person.avatarUrl}
                  size={36}
                />
                <PostIdentityLines
                  className="icom-relations-ident"
                  badges={person.badges}
                  size="sm"
                  nameClassName="icom-relations-name"
                  name={
                    <>
                      {nom}
                      <PresenceDot state={presenceOf(person.otherPersonId)} />
                    </>
                  }
                  handleClassName="icom-relations-handle"
                  handleLine={`@${person.handle}${person.headline ? ` · ${person.headline}` : ""}`}
                />
                <span
                  className="icom-action-group"
                  role="group"
                  aria-label={t("icomRelationsPanel.actionsFor", { nom })}
                >
                  {/* Écrire : couleur des messages (ADR-0027). */}
                  <button
                    type="button"
                    className="icom-action-group-btn"
                    data-role="message"
                    data-primary={mode === "contact" ? "true" : "false"}
                    disabled={busy}
                    aria-label={t("icomRelationsPanel.writeTo", { nom })}
                    title={t("icomRelationsPanel.writeTitle")}
                    onClick={() => write(person.handle)}
                  >
                    <MessageCircle aria-hidden="true" size={17} />
                  </button>
                  {/* L'appel VIDÉO n'existait nulle part dans cette carte : la
                      seule façon d'en obtenir un était d'allumer sa caméra en
                      cours d'appel — ce que la reconnexion suivante défaisait. */}
                  {callsAvailable ? <button
                    type="button"
                    className="icom-action-group-btn"
                    disabled={busy}
                    aria-label={t("icomRelationsPanel.callVideo", { nom })}
                    title={t("icomRelationsPanel.callVideoTitle")}
                    onClick={() => void ring(identite, "video")}
                  >
                    <Video aria-hidden="true" size={17} />
                  </button> : null}
                  {callsAvailable ? <button
                    type="button"
                    className="icom-action-group-btn"
                    data-primary={mode === "appel" ? "true" : "false"}
                    disabled={busy}
                    aria-label={t("icomRelationsPanel.callAudio", { nom })}
                    title={t("icomRelationsPanel.callAudioTitle")}
                    onClick={() => void ring(identite, "audio")}
                  >
                    <Phone aria-hidden="true" size={17} />
                  </button> : null}
                </span>
              </li>
            )
          })}
        </ul>
        ) : null}
        {/* Atteignable MÊME sans résultat local : c'était le défaut IC-05. */}
        {shouldOfferMoreRecipients(etat, relations.hasMore) ? (
          <button
            type="button"
            className="icom-relations-action"
            style={{ margin: 12, minHeight: 44 }}
            onClick={relations.loadMore}
          >
            {t("icomRelationsPanel.loadMore")}
          </button>
        ) : null}
        {relations.isLoadingMore ? (
          <p className="icom-relations-empty">
            {t("icomRelationsPanel.loadingMore")}
          </p>
        ) : null}
        </>
      )}
        </>
      )}
    </div>
      ) : null}
    </>
  )
}

/** Ce que la présence d'une relation vaut, quand on la connaît. */
// La pastille et son vocabulaire vivent dans `features/iappel/presence-dot.tsx`
// — partagés avec le profil et l'en-tête de conversation (quatre états,
// « Hors ligne » compris).
