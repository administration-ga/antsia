"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import Link from "next/link"
import { useTranslation } from "react-i18next"

import { routes } from "@/lib/routes"

/** L'avertissement sur les engagements reste visible même si leur lecture est impossible. */
export function ErasureCommerceNotice() {
  const { t } = useTranslation("antsia")
  const bookings = useAuthenticatedConvexQuery(api.modules.shops.serviceLifecycle.myUpcomingBookings, {})
  const known = !bookings.isError && !bookings.isPending && bookings.data !== undefined
  const data = known ? bookings.data : null
  return <div role="note" className="mb-4 grid gap-2 rounded-[var(--ui2-card-radius)] border border-border p-4 text-sm">
    <p>{t("personal.eraseCommerce")}</p>
    {!data ? <p role="status">{t("personal.eraseBookingsUnknown")}</p>
      : data.count > 0 ? <p>{t(data.truncated ? "personal.eraseBookingsMany" : "personal.eraseBookings", { count: data.count })}</p>
        : <p>{t(data.truncated ? "personal.eraseBookingsEmptyWindow" : "personal.eraseBookingsNone")}</p>}
    <Link className="inline-flex min-h-11 items-center underline" href={routes.serviceRequests()}>{t("personal.eraseBookingsLink")}</Link>
    <Link className="inline-flex min-h-11 items-center underline" href={routes.purchases()}>{t("personal.erasePurchasesLink")}</Link>
  </div>
}
