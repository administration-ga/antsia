// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/RelationPicker.tsx @ ad2e7fdc2 — adaptations : primitives de `@antsia/ui` ; textes par l'i18n (espace `reseau`, clés `relationPicker.*`) — le verbe d'envoi par défaut est traduit, `label`, `emptyText` et `submitVerb` restent des textes déjà traduits par l'appelant ; la ligne sous le nom porte le titre de profil (plus de poste) ; recherche serveur dans le réseau courant (`useRelationSearch` de la coque du moteur) ; props et export inchangés.
"use client"

/**
 * RelationPicker — choisir des personnes parmi SES relations (R-13).
 *
 * Remplace le champ « @identifiant » de l'invitation de groupe : il fallait
 * connaître l'adresse exacte, et le serveur rendait le même refus qu'on se soit
 * trompé d'une lettre ou qu'on ait visé quelqu'un hors de son réseau. Ici on
 * COCHE, et l'écran dit ce qui est déjà fait.
 *
 * Ce composant ne DÉCIDE rien : statuts, filtrage, arbitrage local/serveur et
 * libellés viennent de `relation-picker.ts` (module pur, testé). Il monte la
 * recherche serveur partagée (`useRelationSearch`) et pose les gestes.
 *
 * L'interface des candidats est celle d'`AddToCallPanel`
 * (`{ userId, name, handle?, position? }`) : ce sélecteur est conçu pour être
 * rabattu sur le sélecteur commun sans conversion — cf. l'en-tête du module
 * pur.
 *
 * Charte : aucune classe de couleur brute, aucun littéral de couleur — jetons
 * `var(--…)` uniquement. Cibles tactiles 44 px.
 */

import { Button, TextInput } from "@antsia/ui"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  isRelationPickerSelectable,
  relationPickerEmptyText,
  relationPickerListState,
  relationPickerSelectionLabel,
  relationPickerStatusIndex,
  relationPickerStatusLabel,
  relationPickerStatusOf,
  relationPickerSubmitLabel,
  relationPickerVisibleItems,
  searchHitsToRelationPickerCandidates,
  toggleRelationPickerSelection,
  type RelationPickerCandidate,
} from "./relation-picker"
import { useRelationSearch } from "./use-relation-search"

const MUTED_TEXT_STYLE = {
  margin: 0,
  color: "var(--ink-600)",
  fontSize: 13,
  lineHeight: 1.55,
} as const

/** 44 px : la cible tactile minimale, appliquée à chaque ligne cochable. */
const ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 44,
  padding: "6px 8px",
  borderRadius: "var(--esp-primitive-chip-radius, 8px)",
  cursor: "pointer",
} as const

export interface RelationPickerProps {
  /** L'intitulé de la surface — porté par le groupe de cases. Déjà traduit. */
  label: string
  /** Le vivier connu, déjà borné par le serveur, avec ses statuts. */
  candidates: readonly RelationPickerCandidate[]
  /** Le vivier a été TRONQUÉ au plafond : la recherche va au-delà. */
  truncated?: boolean
  /** Le verbe du bouton d'envoi (« Ajouter »…), déjà traduit ; « Inviter » par défaut. */
  submitVerb?: string
  /** Ce que dit l'écran quand il n'y a personne à proposer, du tout. Déjà traduit. */
  emptyText: string
  /** Envoi. Résolu, la sélection est vidée. */
  onSubmit: (selected: RelationPickerCandidate[]) => Promise<void> | void
  /** Fermer la surface — le déclencheur reprend le focus (c'est son affaire). */
  onClose?: () => void
}

export function RelationPicker({ label, candidates, truncated = false, submitVerb, emptyText, onSubmit, onClose }: RelationPickerProps) {
  const { t } = useTranslation("reseau")
  const [term, setTerm] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  /* L'ouverture pose le focus DANS la surface : sans cela, le clavier reste
     sur le déclencheur et la liste qui vient d'apparaître est hors d'atteinte. */
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const search = useRelationSearch(term)
  const statusOf = useMemo(() => relationPickerStatusIndex(candidates), [candidates])
  const searchCandidates = useMemo(() => searchHitsToRelationPickerCandidates(search.items, statusOf), [search.items, statusOf])
  const state = relationPickerListState({
    terme: term,
    candidates,
    truncated,
    search: {
      eligible: search.eligible,
      settled: search.settled,
      isError: search.isError,
      items: searchCandidates,
    },
  })
  const visible = relationPickerVisibleItems(state)

  /* Une personne cochée puis masquée par la frappe reste sélectionnée : les
     deux sources sont donc indexées ensemble, sinon l'envoi la perdrait. */
  const known = useMemo(() => {
    const index = new Map<string, RelationPickerCandidate>()
    for (const row of candidates) index.set(row.userId, row)
    for (const row of searchCandidates) index.set(row.userId, row)
    return index
  }, [candidates, searchCandidates])

  const chosen = selected.map((userId) => known.get(userId)).filter((row): row is RelationPickerCandidate => row !== undefined)

  const submit = async () => {
    if (chosen.length === 0 || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(chosen)
      setSelected([])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        // Échap ne ferme QUE cette surface — d'où l'arrêt de propagation.
        if (event.key !== "Escape" || onClose === undefined) return
        event.stopPropagation()
        onClose()
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        border: "1px solid var(--ink-200)",
        borderRadius: "var(--esp-primitive-card-radius, 10px)",
      }}
    >
      <TextInput
        ref={inputRef}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t("relationPicker.placeholder")}
        aria-label={t("relationPicker.searchLabel")}
      />

      {state.kind === "erreur" ? (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <p style={MUTED_TEXT_STYLE}>{t("relationPicker.searchFailed")}</p>
          <Button size="sm" variant="ghost" onClick={() => search.refetch()}>
            {t("relationPicker.retry")}
          </Button>
        </div>
      ) : null}

      {state.kind === "attente" ? (
        <p role="status" style={MUTED_TEXT_STYLE}>
          {t("relationPicker.searching")}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p style={MUTED_TEXT_STYLE}>{relationPickerEmptyText({ terme: term, state, emptyText }, t)}</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {visible.map((candidate) => {
            const statusLabel = relationPickerStatusLabel(relationPickerStatusOf(candidate), t)
            const selectable = isRelationPickerSelectable(candidate)
            return (
              <li key={candidate.userId}>
                <label style={ROW_STYLE}>
                  <input
                    type="checkbox"
                    disabled={!selectable || submitting}
                    checked={selected.includes(candidate.userId)}
                    onChange={() => setSelected((current) => toggleRelationPickerSelection(current, candidate))}
                    style={{ width: 18, height: 18, flex: "0 0 auto" }}
                  />
                  <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <span
                      style={{
                        display: "block",
                        color: "var(--ink-900)",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {candidate.name}
                    </span>
                    <span
                      style={{
                        display: "block",
                        color: "var(--ink-600)",
                        fontSize: 12.5,
                      }}
                    >
                      {[candidate.handle ? `@${candidate.handle}` : null, candidate.position].filter((part) => part).join(" · ")}
                    </span>
                  </span>
                  {statusLabel ? (
                    <span
                      style={{
                        flex: "0 0 auto",
                        color: "var(--ink-600)",
                        fontSize: 12.5,
                      }}
                    >
                      {statusLabel}
                    </span>
                  ) : null}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <p aria-live="polite" style={{ ...MUTED_TEXT_STYLE, flex: "1 1 auto" }}>
          {relationPickerSelectionLabel(chosen.length, t)}
        </p>
        {onClose ? (
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("relationPicker.close")}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" disabled={chosen.length === 0 || submitting} onClick={() => void submit()}>
          {relationPickerSubmitLabel(chosen.length, submitVerb, t)}
        </Button>
      </div>
    </div>
  )
}
