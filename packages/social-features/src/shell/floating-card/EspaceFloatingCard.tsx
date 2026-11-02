// Dupliqué de socle/packages/agent-features/src/features/espace-personnel/EspaceFloatingCard.tsx @ ad2e7fdc2 — adaptations : déplacé dans la coque (`shell/floating-card/`) ; textes « Fermer » et progression d'assistant lus dans l'espace de noms `shell` (`espaceFloatingCard.close`, `espaceFloatingCard.stepProgress`) au lieu des clés communes du socle ; charte par défaut = celle de l'application (`<html data-charte>`, résolue par `ImmersiveOverlay` de `@antsia/ui/overlay`) au lieu de « espace-personnel », règle d'arrondi de la charte de poste (`espace-structure`) retirée ; feuille sortie du JSX dans une constante de module (`ESPACE_FLOATING_CARD_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface —, règles inchangées ; primitives `@antsia/ui`.
"use client"

/**
 * EspaceFloatingCard — LA carte flottante de la coque.
 *
 * Toutes les surfaces modales légères du réseau portent la même facture que
 * le composeur « Publier une actu » (`StoryCreateSheet`) : carte compacte
 * min(430px, 100%) sur le voile, en-tête sobre (titre 16/700 + « Fermer »
 * fantôme), corps défilant, pied d'actions bordé.
 *
 * Au TÉLÉPHONE, deux poses selon la NATURE de la carte (`kind`, décidée par
 * le module pur `floating-card.ts`) : une carte qui SAISIT prend l'écran
 * entier — le clavier prend la moitié de la hauteur et seule la surface
 * immersive suit `--kb-inset` — tandis qu'une carte qui PROPOSE un choix ou
 * informe reste une carte flottante, la même qu'au bureau. Le plein écran
 * était la réponse au clavier, jamais à la largeur : appliqué à une courte
 * liste de choix, il en faisait une page.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI PAS UN `Dialog` QUI PORTALE SANS CHARTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un dialogue portalé vers `body` sort du nœud `data-charte` qui porte les
 * jetons : il y résoudrait une autre charte que celle du réseau. C'est
 * exactement le défaut que `ImmersiveOverlay` corrige en re-déclarant
 * `data-charte` sur son conteneur (la charte de l'application, lue sur
 * `<html>`, sauf charte passée), et la raison d'être de cette enveloppe.
 * `ImmersiveOverlay` apporte aussi ce que le clavier mobile exige : hauteur
 * `visualViewport`, verrou de défilement, piège de focus, Échap.
 *
 * Jetons de RÔLE uniquement (var(--…)) : le cliquet de charte compte les
 * couleurs littérales, et la carte doit suivre le bi-thème sans une ligne de
 * plus.
 */

import { Button } from "@antsia/ui"
import { ImmersiveOverlay, useIsReseauMobile } from "@antsia/ui/overlay"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { type FloatingCardKind, floatingCardPose } from "./floating-card"

/**
 * La feuille de la carte, HORS du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 * Jetons de la charte seulement, aucune couleur littérale.
 *
 * ⚠️ AUCUN accent grave dans le bloc ci-dessous : il fermerait le littéral
 * gabarit et l'erreur de compilation qui suit ne parlerait plus de CSS.
 */
const ESPACE_FLOATING_CARD_CSS = `
      /* ── LE CADRE (bureau) : la carte compacte du composeur, generalisee. */
      .efc-viewport {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .efc-frame {
        display: flex;
        flex-direction: column;
        width: min(430px, 100%);
        /* Le troisieme terme (100%) est le garde-fou du TELEPHONE, ou une
           carte de choix prend cette pose : 92dvh y ignore le padding du
           viewport et les zones sures de l'overlay, et une liste longue
           depasserait alors des deux bords d'un conteneur qui la centre.
           100% borne la carte a l'espace REELLEMENT disponible ; au bureau
           il ne mord jamais (760px arrive avant). */
        max-height: min(760px, 92dvh, 100%);
        overflow: hidden;
        border-radius: var(--esp-primitive-card-radius, 18px);
        border: 1px solid var(--esp-raised-border, var(--border));
        background: var(--esp-surface-raised, var(--background));
      }
      /* Plein ecran (telephone) : les memes tranches, directement dans la
         colonne de l'overlay — pas de cadre, la surface EST l'ecran. */
      .efc-fullscreen {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
      }
      .efc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--border);
      }
      .efc-title {
        margin: 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 16px;
        font-weight: 700;
        color: var(--foreground);
      }
      .efc-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 12px;
        /* La place que le clavier prend en bas (useVisualViewport). */
        padding-bottom: calc(12px + var(--kb-inset, 0px));
      }
      .efc-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 10px 12px;
        border-top: 1px solid var(--border);
      }
      /* ── LA PROGRESSION D'ASSISTANT : une ligne + trois segments. ──────
         Remplace le Stepper a pastilles, trop large pour une carte de
         430 px — ce qui se COMPTE se lit en chasse fixe. */
      .efc-progress {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px 0;
      }
      .efc-progress-line {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin: 0;
      }
      .efc-progress-count {
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-variant-numeric: tabular-nums;
        color: var(--muted-foreground);
      }
      .efc-progress-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--foreground);
      }
      .efc-progress-track {
        display: flex;
        gap: 4px;
      }
      .efc-progress-seg {
        height: 4px;
        flex: 1 1 0;
        border-radius: 999px;
        background: var(--border);
      }
      .efc-progress-seg-done {
        background: var(--primary);
      }
    `

/**
 * React 19 hisse ce `<style href precedence>` dans `<head>` et le dédoublonne
 * — même mécanique que les feuilles des stories et de la messagerie.
 */
function EspaceFloatingCardStyles() {
	return (
		<style href="esp-floating-card" precedence="default">
			{ESPACE_FLOATING_CARD_CSS}
		</style>
	)
}

export interface EspaceFloatingCardProps {
	open: boolean
	onClose: () => void
	/** Titre affiché ET nom accessible de la surface. */
	title: string
	/** Tranche fixe entre l'en-tête et le corps (progression d'assistant…). */
	subheader?: ReactNode
	children: ReactNode
	/** Pied d'actions — absent, la carte n'a que l'en-tête et le corps. */
	footer?: ReactNode
	/**
	 * Charte posée sur le portail (qui sort du nœud `data-charte` de l'hôte).
	 * Absente, celle de l'APPLICATION — lue sur `<html data-charte>` par
	 * `ImmersiveOverlay` : une carte porte la charte du réseau où elle s'ouvre.
	 */
	charte?: string
	/**
	 * `false` = carte BLOQUANTE : pas de bouton « Fermer », Échap inopérant —
	 * les issues sont les actions du contenu. Défaut `true`.
	 */
	closable?: boolean
	/**
	 * La NATURE de la carte, qui décide de sa pose au téléphone (cf.
	 * `floating-card.ts`). `"compose"` (défaut) = elle saisit, donc plein
	 * écran au téléphone pour le clavier ; `"choice"` = elle propose ou
	 * informe, donc carte flottante PARTOUT — la prendre en plein écran la
	 * transformerait en page.
	 */
	kind?: FloatingCardKind
}

export function EspaceFloatingCard({
	open,
	onClose,
	title,
	subheader,
	children,
	footer,
	charte,
	closable = true,
	kind = "compose",
}: EspaceFloatingCardProps) {
	const { t } = useTranslation("shell")
	const mobile = useIsReseauMobile()
	const pose = floatingCardPose(mobile, kind)

	const slices = (
		<>
			<div className="efc-header">
				<p className="efc-title">{title}</p>
				{/* Une sortie VISIBLE en plus d'Échap : au téléphone il n'y a pas
				    de touche Échap, et le geste « retour » du système quitte la
				    page. Une carte BLOQUANTE (closable=false) n'offre NI l'une ni
				    l'autre : ses issues sont les actions du contenu. */}
				{closable ? (
					<Button variant="ghost" size="sm" icon="x" onClick={onClose}>
						{t("espaceFloatingCard.close")}
					</Button>
				) : null}
			</div>
			{subheader ?? null}
			<div className="efc-body">{children}</div>
			{footer ? <div className="efc-footer">{footer}</div> : null}
		</>
	)

	return (
		<ImmersiveOverlay
			open={open}
			onClose={closable ? onClose : () => {}}
			label={title}
			charte={charte}
			scrim={pose === "card"}
		>
			<EspaceFloatingCardStyles />
			{pose === "card" ? (
				<div className="efc-viewport">
					<div className="efc-frame">{slices}</div>
				</div>
			) : (
				<div className="efc-fullscreen">{slices}</div>
			)}
		</ImmersiveOverlay>
	)
}

/**
 * La progression d'un assistant à étapes, version compacte : « 2/3 · Étape »
 * en une ligne, trois segments dessous, et l'annonce complète en `sr-only`
 * `aria-live` — la couleur d'un segment ne dit rien à un lecteur d'écran.
 */
export function EspaceWizardProgress({
	steps,
	current,
}: {
	steps: readonly string[]
	current: number
}) {
	const { t } = useTranslation("shell")
	const label = steps[current] ?? ""
	return (
		<div className="efc-progress">
			<p className="efc-progress-line">
				<span className="efc-progress-count" aria-hidden="true">
					{current + 1}/{steps.length}
				</span>
				<span className="efc-progress-label" aria-hidden="true">
					{label}
				</span>
			</p>
			<div className="efc-progress-track" aria-hidden="true">
				{steps.map((step, index) => (
					<span
						key={step}
						className={
							index <= current
								? "efc-progress-seg efc-progress-seg-done"
								: "efc-progress-seg"
						}
					/>
				))}
			</div>
			<p aria-live="polite" className="sr-only">
				{t("espaceFloatingCard.stepProgress", {
					current: current + 1,
					total: steps.length,
					label,
				})}
			</p>
		</div>
	)
}
