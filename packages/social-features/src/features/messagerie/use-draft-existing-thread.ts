"use client"

/**
 * Un BROUILLON vers une personne avec qui un fil EXISTE déjà : ouvrir ce fil — son
 * historique — au lieu d'une « Nouvelle conversation » vide. Le premier envoi aurait
 * continué le fil côté serveur sans montrer ce qui précède (constat de DIASPORA.GA,
 * 16/10/2026 : « Écrire » depuis une fiche, un volet ou une liste ouvre toujours un
 * brouillon par identifiant).
 *
 * Le moteur dit le fil de la paire (`messaging.inbox.findThreadWithHandle`) — rien pour
 * un identifiant inconnu, un blocage, soi-même ou un fil sorti de la boîte : le
 * brouillon reste alors un brouillon, comme avant.
 */
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { useRouter } from "@antsia/api/routing"
import { useEffect } from "react"

import { dockStore } from "./dock-store"
import { chatKey } from "./messagerie-dock"
import { conversationHref } from "./messagerie-routes"
import type { MessagerieVariant } from "./messagerie-views"

export function useOpenExistingThreadForDraft(handle: string | null, variant: MessagerieVariant): void {
  const { networkId } = useNetwork()
  const router = useRouter()
  const routes = useRoutes()
  const found = useAuthenticatedConvexQuery(
    api.modules.messaging.inbox.findThreadWithHandle,
    handle === null ? "skip" : { networkId, handle },
  )
  const threadId = found.data?.threadId ?? null

  useEffect(() => {
    if (handle === null || threadId === null) return
    // Le texte et les pièces déjà posés SUIVENT le brouillon (`promoteDraft`).
    dockStore.promoteDraft(handle, String(threadId))
    // Sur la page, REMPLACER l'adresse : celle du brouillon, laissée dans
    // l'historique, y ramènerait au retour — et rouvrirait aussitôt le fil.
    if (variant === "page") {
      const liste = routes.messages()
      router.replace(conversationHref(chatKey(String(threadId)), liste) ?? liste)
    }
  }, [handle, threadId, variant, router, routes])
}
