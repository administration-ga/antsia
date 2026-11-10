"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { notificationTarget } from "@antsia/social-features/notifications"
import { icomViewHref } from "@antsia/social-features/features/messagerie/icom-views"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { MemberPage } from "@/components/member-chrome"
import { useMemberSession } from "@/components/network-shell"
import { Button, Card, CenteredStatus } from "@/components/shared/controls"
import { engineRoutes, routes } from "@/lib/routes"

/** Le serveur relit destinataire, session, sujet et sonnerie ; aucune notification n'est marquée lue ici. */
export function NotificationOpenScreen({ reference }: { reference?: string }) {
  const { root, person } = useMemberSession()
  return <NotificationOpenContent key={JSON.stringify([root._id, person._id, reference])} reference={reference} />
}

function NotificationOpenContent({ reference }: { reference?: string }) {
  const { t } = useTranslation("antsia")
  const { t: tNotification } = useTranslation("notifications")
  const { root } = useMemberSession()
  const router = useRouter()
  const redirected = useRef<string | null>(null)
  const [openingToken, setOpeningToken] = useState(() => crypto.randomUUID())
  const query = useAuthenticatedConvexQuery(api.modules.notifications.open.resolveOpenTarget, reference ? { networkId: root._id, reference, openingToken } : "skip")
  const target = !query.isError && !query.isFetching ? query.data : null
  const destination = target?.channel === "call"
    ? icomViewHref("appels", routes.messages())
    : target?.channel === "notification"
      // P14B : la destination TYPÉE relue par le serveur (demande, candidature, décisions) l'emporte sur le sujet commun.
      ? notificationTarget({ kind: target.kind, subject: target.subject, actor: { handle: target.actorHandle }, target: target.target ?? null }, engineRoutes, tNotification)?.href ?? routes.notificationCenter()
      : null

  useEffect(() => {
    if (!destination || redirected.current === destination) return
    redirected.current = destination
    router.replace(destination)
  }, [destination, router])

  return <MemberPage>
    {reference && !query.isError && (query.isPending || query.isFetching || destination) ? <CenteredStatus label={t("notificationOpen.loading")} /> : <Card className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("notificationOpen.title")}</h1>
      <p>{t(query.isError ? "notificationOpen.error" : "notificationOpen.unavailable")}</p>
      {query.isError ? <Button variant="outline" onClick={() => setOpeningToken(crypto.randomUUID())}>{t("session.retry")}</Button> : null}
      <Link href={routes.notificationCenter()} className="inline-flex min-h-11 items-center self-start rounded-[var(--ui2-button-radius)] px-3 text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("notificationOpen.fallback")}</Link>
    </Card>}
  </MemberPage>
}
