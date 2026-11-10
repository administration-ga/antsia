"use client"

/**
 * La pilule interrupteur « iCom | iCom Pro » (ADR-0036).
 *
 * Deux segments, l'espace courant rempli. Un segment sans adresse est l'espace où l'on se trouve
 * déjà (carte iCom de la colonne droite) : il se lit, il ne navigue pas. Les styles vivent dans la
 * feuille de la messagerie (`.icom-space-switch`), aux jetons des chartes.
 */
import { Link } from "@antsia/api/routing"
import { useTranslation } from "react-i18next"
import type { IcomSpace } from "./icom-space"
import { useIcomProAvailability } from "./use-icom-pro"

export function IcomSpaceSwitch({ active, personalHref, proHref, compact = false }: {
	active: IcomSpace
	/** L'adresse d'iCom ; `null` quand on y est déjà sans quitter la surface. */
	personalHref: string | null
	/** L'adresse d'iCom Pro ; `null` quand on y est déjà sans quitter la surface. */
	proHref: string | null
	/** La carte de la colonne droite : segments plus serrés. */
	compact?: boolean
}) {
	const { t } = useTranslation("messagerie")
	const segments = [
		{ space: "personnel" as const, href: personalHref, label: t("icomSpace.personal") },
		{ space: "pro" as const, href: proHref, label: t("icomSpace.pro") },
	]
	return (
		<nav className="icom-space-switch" data-compact={compact ? "true" : undefined} aria-label={t("icomSpace.label")}>
			{segments.map((segment) => {
				const current = segment.space === active
				return segment.href === null || current
					? <span key={segment.space} aria-current={current ? "page" : undefined} data-space={segment.space}>{segment.label}</span>
					: <Link key={segment.space} href={segment.href} data-space={segment.space}>{segment.label}</Link>
			})}
		</nav>
	)
}

/**
 * L'en-tête de la page iCom sous la capacité iCom Pro : la pilule dès qu'une activité pro existe
 * (ou qu'on est déjà dans iCom Pro, pour pouvoir en sortir) ; le titre reste pour les lecteurs
 * d'écran. Seul ce composant lit la présence d'une activité : rien n'est lu sans iCom Pro.
 */
export function IcomSpaceHeading({ space, title, personalHref, proHref }: { space: IcomSpace; title: string; personalHref: string; proHref: string }) {
	const available = useIcomProAvailability()
	const visible = available === true || space === "pro"
	return (
		<>
			<h1 className={visible ? "sr-only" : undefined}>{title}</h1>
			{visible ? <IcomSpaceSwitch active={space} personalHref={personalHref} proHref={proHref} /> : null}
		</>
	)
}

/** Le titre de la carte iCom : la pilule (iCom courant, iCom Pro en lien) dès qu'une activité pro existe. */
export function IcomDockSpaceTitle({ title, proHref }: { title: string; proHref: string }) {
	const available = useIcomProAvailability()
	return available === true
		? <IcomSpaceSwitch active="personnel" personalHref={null} proHref={proHref} compact />
		: <span className="icom-surface-title">{title}</span>
}

