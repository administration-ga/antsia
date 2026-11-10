"use client"

import type { DailySpecial } from "@antsia/social-domain/dailySpecial"
import type { ReactNode } from "react"

import { useTodaysSpecialRef } from "./use-daily-special-clock"

/** Le contenu est admis et rendu côté serveur ; cette frontière retire seulement le plat à son échéance. */
export function PublicDailySpecial({ special, children }: { special: DailySpecial; children: ReactNode }) {
  return useTodaysSpecialRef(special) ? children : null
}
