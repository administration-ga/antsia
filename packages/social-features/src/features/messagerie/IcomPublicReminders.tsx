// Dupliqué de socle/packages/agent-features/src/features/messagerie/IcomPublicReminders.tsx @ ad2e7fdc2 — adaptations : rappels lus par `pages.followedUpdates.list` du moteur (réseau courant, DTO projeté par `pageUpdateFromEngine`) ; badge de la page CALCULÉ par le serveur (libellé `social:badges.…`) au lieu d'un « Page officielle » posé sur toute page ; destination par la table des routes injectée (`useRoutes()`) : la page quand l'application la sert, sinon un rappel sans lien ; « Tout voir » mène à l'accueil du réseau (`routes.home()`) ; textes traduits (i18n `messagerie`, clés `icomPublicReminders.…`) ; « iRéseau » devient « le réseau » ; feuille de style sortie du JSX dans une constante de module (`ICOM_PUBLIC_REMINDERS_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface — règles inchangées. ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil).
"use client"

/**
 * Rappels PUBLICS sous les statuts personnels d'iCom.
 *
 * Cette section est une porte, pas un mini-fil : elle n'affiche ni réaction,
 * ni commentaire, et chaque rappel quitte iCom pour la page dans le réseau. La
 * frontière reste ainsi lisible : privé ici, public là-bas.
 */

import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import type { Badge as PageBadge } from "@antsia/social-domain/badges"
import { Badge, Button, Icon, type IconName, type Tone } from "@antsia/ui"
import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Avatar } from "../reseau-personnel/Avatar"
import {
  pageUpdateFromEngine,
  publicReminderHref,
  publicReminderTime,
  publicRemindersForIcom,
  type IcomPublicReminder,
} from "./icom-public-reminders"

/**
 * Le badge de la page, tel que le serveur l'a CALCULÉ : son libellé vient de
 * l'espace `social` (`badges.…`), son ton et son pictogramme d'ici. Une page
 * de communauté n'est pas « officielle » : le socle posait ce mot sur toute
 * page parce qu'il n'en connaissait que d'administration.
 */
const BADGE_VUE: Record<PageBadge, { key: string; tone: Tone; icon: IconName }> = {
  official: { key: "social:badges.official", tone: "primary", icon: "shieldCheck" },
  verified: { key: "social:badges.verified", tone: "primary", icon: "checkCircle" },
  public_agent: { key: "social:badges.publicAgent", tone: "info", icon: "userCheck" },
  community: { key: "social:badges.community", tone: "neutral", icon: "users" },
}

/**
 * La feuille de la vue, hors du JSX : un littéral enfant de `<style>` passerait
 * pour une chaîne d'interface (cliquet `no-hardcoded-strings`). Jetons de la
 * charte seulement, aucune couleur littérale.
 */
const ICOM_PUBLIC_REMINDERS_CSS = `
        .icom-public-reminders {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
          padding: 14px 6px 4px;
          border-top: 1px solid var(--ink-200);
        }
        .icom-public-reminders-head { padding: 0 8px; }
        .icom-public-reminders-head h2 {
          margin: 0;
          color: var(--ink-900);
          font-size: 14px;
          font-weight: 750;
          line-height: 1.35;
        }
        .icom-public-reminders-head p {
          margin: 4px 0 0;
          color: var(--ink-500);
          font-size: 11.5px;
          line-height: 1.45;
        }
        .icom-public-reminders-state {
          display: flex;
          min-height: 44px;
          align-items: center;
          gap: 10px;
          margin: 0;
          padding: 8px;
          color: var(--ink-500);
          font-size: 12px;
          line-height: 1.45;
        }
        .icom-public-reminders-state p { margin: 0; flex: 1; }
        .icom-public-reminders-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .icom-public-reminder-link {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          min-height: 68px;
          align-items: start;
          gap: 10px;
          padding: 8px;
          border-radius: var(--esp-primitive-chip-radius, var(--radius-lg));
          color: inherit;
          text-decoration: none;
          transition: background 120ms ease;
        }
        .icom-public-reminder-link:hover { background: var(--ink-100); }
        .icom-public-reminder-link[data-static="true"]:hover { background: none; }
        .icom-public-reminder-link:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 1px;
        }
        .icom-public-reminder-copy {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }
        .icom-public-reminder-name {
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          color: var(--ink-900);
          font-size: 12.5px;
          font-weight: 700;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .icom-public-reminder-excerpt {
          display: -webkit-box;
          width: 100%;
          overflow: hidden;
          color: var(--ink-600);
          font-size: 12px;
          line-height: 1.4;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .icom-public-reminder-time {
          padding-top: 2px;
          color: var(--ink-500);
          font-size: 10.5px;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .icom-public-reminders-cta {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 8px 10px;
          border-radius: var(--esp-primitive-button-radius, var(--radius-lg));
          color: var(--primary-600);
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
        }
        .icom-public-reminders-cta:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 1px;
        }
        @media (prefers-reduced-motion: reduce) {
          .icom-public-reminder-link { transition: none; }
        }
      `

export interface IcomPublicRemindersViewProps {
  reminders: readonly IcomPublicReminder[]
  now: number
  loading?: boolean
  failed?: boolean
  onRetry?: () => void
}

export function IcomPublicRemindersView({
  reminders,
  now,
  loading = false,
  failed = false,
  onRetry,
}: IcomPublicRemindersViewProps) {
  const { t } = useTranslation("messagerie")
  const timeZone = useViewerTimeZone()
  const routes = useRoutes()
  const titleId = useId()

  return (
    <section className="icom-public-reminders" aria-labelledby={titleId}>
      <div className="icom-public-reminders-head">
        <h2 id={titleId}>{t("icomPublicReminders.title")}</h2>
        <p>{t("icomPublicReminders.intro")}</p>
      </div>

      {loading ? (
        <p className="icom-public-reminders-state" role="status">
          {t("icomPublicReminders.loading")}
        </p>
      ) : failed ? (
        <div className="icom-public-reminders-state" role="alert">
          <p>{t("icomPublicReminders.failed")}</p>
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onRetry}
              style={{ minHeight: 44 }}
            >
              {t("icomPublicReminders.retry")}
            </Button>
          ) : null}
        </div>
      ) : reminders.length === 0 ? (
        <p className="icom-public-reminders-state">
          {t("icomPublicReminders.empty")}
        </p>
      ) : (
        <ul className="icom-public-reminders-list">
          {reminders.map((reminder) => {
            switch (reminder.kind) {
              case "page": {
                const badge = BADGE_VUE[reminder.pageBadge]
                const href = publicReminderHref(reminder, routes)
                const contenu: ReactNode = (
                  <>
                    <Avatar
                      displayName={reminder.pageName}
                      avatarUrl={reminder.pageLogoUrl}
                      shape="square"
                      size={42}
                    />
                    <span className="icom-public-reminder-copy">
                      <span className="icom-public-reminder-name">
                        {reminder.pageName}
                      </span>
                      <Badge tone={badge.tone} size="sm" icon={badge.icon}>
                        {t(badge.key)}
                      </Badge>
                      <span className="icom-public-reminder-excerpt">
                        {reminder.excerpt.length > 0
                          ? reminder.excerpt
                          : t("icomPublicReminders.excerptFallback")}
                      </span>
                    </span>
                    <time
                      className="icom-public-reminder-time"
                      dateTime={new Date(reminder.publishedAt).toISOString()}
                    >
                      {publicReminderTime(reminder, now, t, timeZone)}
                    </time>
                  </>
                )
                // Sans route de page servie par l'application, le rappel se lit
                // sans lien : mener au profil du même identifiant montrerait
                // une personne homonyme à la place de la page.
                return (
                  <li key={reminder.postId}>
                    {href === null ? (
                      <div className="icom-public-reminder-link" data-static="true">
                        {contenu}
                      </div>
                    ) : (
                      <Link href={href} className="icom-public-reminder-link">
                        {contenu}
                      </Link>
                    )}
                  </li>
                )
              }
            }
          })}
        </ul>
      )}

      <Link
        href={routes.home()}
        className="icom-public-reminders-cta"
      >
        <span>{t("icomPublicReminders.seeAll")}</span>
        <Icon name="arrowRight" size={16} />
      </Link>

      <style href="icom-public-reminders" precedence="default">{ICOM_PUBLIC_REMINDERS_CSS}</style>
    </section>
  )
}

export function IcomPublicReminders({ now }: { now: number }) {
  const { networkId } = useNetwork()
  const updates = useAuthenticatedConvexQuery(
    api.modules.pages.followedUpdates.list,
    { networkId },
  )
  const reminders = publicRemindersForIcom(
    (updates.data ?? []).map(pageUpdateFromEngine),
  )

  return (
    <IcomPublicRemindersView
      reminders={reminders}
      now={now}
      loading={updates.isLoading}
      failed={updates.isError}
      onRetry={() => void updates.refetch()}
    />
  )
}
