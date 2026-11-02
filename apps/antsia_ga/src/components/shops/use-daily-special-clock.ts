"use client"

import { dailySpecialExpiresAt, todaysSpecialRef, type DailySpecial } from "@antsia/social-domain/dailySpecial"

import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"

/**
 * Même réveil local que les échéances du panier : échéance, focus et retour de veille, sans requête ni écriture.
 * Les désignations sont datées par le serveur au jour de leur création. Le dernier jour présent couvre toute
 * la fenêtre de l'annuaire ; les désignations antérieures sont déjà exclues par todaysSpecialRef.
 */
export function useDailySpecialClock(specials: readonly (DailySpecial | null | undefined)[]): number {
  const expiresAt = specials.reduce<number | null>((latest, special) => {
    const expiry = dailySpecialExpiresAt(special?.day)
    return expiry === null ? latest : latest === null ? expiry : Math.max(latest, expiry)
  }, null)
  return useCheckoutClock(expiresAt)
}

/** Le plat de ce jour civil disparaît à minuit à Libreville, même sans nouvelle donnée du serveur. */
export function useTodaysSpecialRef(special: DailySpecial | null | undefined): string | null {
  return todaysSpecialRef(special, useDailySpecialClock([special]))
}
