"use client"

/** U04 : Créer reste un geste réel quand Clips occupe la barre basse. */
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useNetworkNavigationLayout } from "@antsia/api/network"
import { usePathname } from "@antsia/api/routing"
import { Plus } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { useCreationController } from "../features/reseau-personnel/use-creation-controller"
import { reseauCreationChoices, type ReseauDestinationRoutes } from "./reseau-menu-destinations"
import { useReseauDestinationRoutes } from "./reseau-menu-destinations-ui"
import { CreationChoiceCard, useChoiceTrigger } from "./mobile/ReseauMobileCreateButton"

export function ReseauCreateAction() {
  const routes = useReseauDestinationRoutes()
  const { mobile } = useNetworkNavigationLayout()
  // Les consommateurs historiques n'ont besoin ni de cette surface ni d'une
  // dépendance d'authentification ajoutée à leur simple en-tête.
  if (routes?.clips === undefined || mobile !== true) return null
  return <CreateActionContent routes={routes} />
}

function CreateActionContent({ routes }: { routes: ReseauDestinationRoutes }) {
  const { t } = useTranslation("reseau")
  const { liveAvailable } = useNetwork()
  const pathname = usePathname()
  const creation = useCreationController()
  const person = useAuthenticatedConvexQuery(api.modules.people.persons.getMyPerson, {}).data
  const { open, setOpen, triggerRef } = useChoiceTrigger<HTMLButtonElement>()
  useEffect(() => { setOpen(false) }, [pathname, setOpen])
  const handle = person?.published === true ? person.handle ?? null : null
  const choices = reseauCreationChoices({ handle, liveAvailable }, routes)
  return <>
    <button ref={triggerRef} type="button" aria-label={t("reseauDestinations.creer")} title={t("reseauDestinations.creer")}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Plus aria-hidden="true" size={24} />
    </button>
    <CreationChoiceCard open={open} onClose={() => setOpen(false)} choices={choices} onPick={creation.openCreation} />
  </>
}
