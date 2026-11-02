// Dupliqué de socle/packages/agent-features/src/features/stories/StoryViewersSheet.tsx @ ad2e7fdc2 — adaptations : branché sur `stories.stories.viewers` du moteur (réseau courant de `useNetwork()`, pagination NATIVE de Convex au lieu de la chaîne de curseurs `seenAt` — plus d'ex æquo perdu à une frontière de page) ; spectateur au contrat `counterpartLabel` (`personId`, nom nullable dit par le libellé neutre) ; tiroir `@antsia/ui/sheet` avec le nom traduit de sa croix ; libellés traduits (clés `stories:storyViewersSheet.*`). ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil).
"use client"

/**
 * StoryViewersSheet — « Vu par », la liste que SEUL l'auteur peut lire.
 *
 * Le serveur le tient déjà : `stories.viewers` rend un refus INDISTINCT à qui
 * n'est pas l'auteur, exactement comme pour un identifiant inventé. Cet écran
 * ne monte donc la feuille que sur ses propres stories — non pas pour garder
 * quoi que ce soit, mais pour ne pas afficher un bouton qui ne peut mener
 * qu'à une erreur.
 *
 * ⚠️ `Sheet` de `@antsia/ui/sheet`, `side="bottom"`, même gabarit que le Menu
 * du réseau : les deux s'ouvrent depuis le bas au pouce, et leur donner deux
 * formes ferait croire à deux mécanismes.
 *
 * ⚠️ La lecture est PAGINÉE et le bouton « Voir plus » est le seul chemin —
 * jamais de défilement infini, pour la même raison que le fil : une liste qui
 * repousse son pied rend ce pied inatteignable.
 */

import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Button, SkeletonCard } from "@antsia/ui"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@antsia/ui/sheet"
import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Avatar } from "../reseau-personnel/Avatar"
import { formatRelativeDate } from "../reseau-personnel/shared"
import { storyAuthorName, storyQueryInstant } from "./stories-tray"

/** Spectateurs lus par page — le serveur en sert cinquante au plus. */
const VIEWERS_PAGE_SIZE = 25

export interface StoryViewersSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	storyId: Id<"stories">
	now: number
	/** Instant de lecture de la série ; absent, figé à l'ouverture de la liste. */
	queryNow?: number
}

export function StoryViewersSheet({
	open,
	onOpenChange,
	storyId,
	now,
	queryNow,
}: StoryViewersSheetProps) {
	const { t } = useTranslation("stories")

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				closeLabel={t("storyViewersSheet.close")}
				className="max-h-[82dvh] overflow-y-auto rounded-t-2xl border-border/60 bg-secondary px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] [&_[data-slot=sheet-close]]:!size-11"
			>
				<SheetHeader className="px-0 pt-2 pb-1">
					<SheetTitle>{t("storyViewersSheet.title")}</SheetTitle>
				</SheetHeader>
				{/* Aucun abonnement tant que la feuille est fermée. */}
				{open ? <ViewersList storyId={storyId} now={now} queryNow={queryNow} /> : null}
			</SheetContent>
		</Sheet>
	)
}

function ViewersList({ storyId, now, queryNow }: { storyId: Id<"stories">; now: number; queryNow?: number }) {
	const { t } = useTranslation("stories")
	const timeZone = useViewerTimeZone()
	const { networkId } = useNetwork()
	const [readNow] = useState(() => queryNow ?? storyQueryInstant(now))
	const viewers = useAuthenticatedPaginatedQuery(
		api.modules.stories.stories.viewers,
		{ networkId, storyId, now: readNow },
		{ initialNumItems: VIEWERS_PAGE_SIZE },
	)

	if (viewers.status === "LoadingFirstPage") return <SkeletonCard />

	// ⚠️ Une liste vide ne veut dire « personne » qu'une fois la PREMIÈRE page
	// arrivée : avant, c'est un chargement, pas une absence.
	if (viewers.results.length === 0) {
		return (
			<p style={{ margin: "8px 2px", color: "var(--muted-foreground)" }}>
				{t("storyViewersSheet.empty")}
			</p>
		)
	}

	return (
		<div className="space-y-1">
			{viewers.results.map(({ viewer, seenAt }) => (
				<div
					key={viewer.personId}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "8px 2px",
					}}
				>
					<Avatar
						displayName={viewer.displayName ?? ""}
						hasIdentity={viewer.displayName !== null}
						avatarUrl={viewer.avatarUrl}
						size={34}
					/>
					<span style={{ flex: 1, minWidth: 0 }}>
						<span
							style={{
								display: "block",
								fontSize: 13.5,
								fontWeight: 600,
								color: "var(--foreground)",
							}}
						>
							{storyAuthorName(viewer.displayName, t)}
						</span>
						{viewer.handle !== null ? (
							<span
								style={{ fontSize: 12, color: "var(--muted-foreground)" }}
							>
								@{viewer.handle}
							</span>
						) : null}
					</span>
					{/* Ce qui se COMPTE — ici un horodatage — se lit en chasse fixe. */}
					<span
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: 11.5,
							color: "var(--muted-foreground)",
						}}
					>
						{formatRelativeDate(seenAt, now, t, timeZone)}
					</span>
				</div>
			))}

			{viewers.status === "LoadingMore" ? <SkeletonCard /> : null}
			{viewers.status === "CanLoadMore" ? (
				<Button
					variant="secondary"
					size="sm"
					icon="arrowDown"
					onClick={() => viewers.loadMore(VIEWERS_PAGE_SIZE)}
				>
					{t("storyViewersSheet.more")}
				</Button>
			) : null}
		</div>
	)
}
