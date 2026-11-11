import { ShieldAlert } from "lucide-react"
import Link from "next/link"

import { buttonClassName } from "@/components/shared/button-class"

/**
 * UM-03 — « Signaler » sur une fiche PUBLIQUE (offre, conditions d'une boutique, offre d'emploi) : sans compte,
 * on ne signale pas ; le lien invite à se connecter, le signalement se fait ensuite sur la fiche membre. Rendu
 * pour un lecteur anonyme seulement : la page publique ne sait pas si un lecteur connecté gère la boutique.
 */
export function PublicReportInvite({ href, label }: { href: string; label: string }) {
  return <Link href={href} prefetch={false} rel="nofollow" data-public-report className={buttonClassName("ghost", "justify-self-start self-start")}><ShieldAlert aria-hidden className="size-4 shrink-0" />{label}</Link>
}
