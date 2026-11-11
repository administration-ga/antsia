// Dupliqué de socle/packages/ui-v2/src/components/form.tsx @ ad2e7fdc2 — adaptations : ombre du curseur de l'interrupteur (noir à 20 %) → jeton `--shadow-knob` (aucune couleur hors des jetons) ; texte d'erreur et astérisque à l'encre de danger `--role-danger-ink` quand le thème la déclare (ADR-0027), `--danger-500` en repli ; aplats d'identité et leur texte selon les chartes (`--esp-identity-fill`, `--primary-fill-on`, pastille tonale des états actifs ; ADR-0027), facture d'origine en repli. champs et choix radio raccordés au rayon opt-in ANTSIA (`--esp-input-radius`), 6 px ailleurs. EX-18 : indicateur de focus au clavier des champs (`TextInput`, `TextArea`, `Select`) par la classe `ui-field` et l'anneau de la charte, plus aucune `outline` supprimée en ligne ; obligation d'un champ transmise au contrôle (`aria-required`), astérisque décoratif. EX-18, second volet : focus au clavier des cases, choix radio et interrupteurs (`Checkbox`, `Radio`, `Toggle`) — l'entrée native, invisible, précède son visuel (`ui-choice-input` + `ui-choice-mark`) et la couche de base y pose l'anneau de la charte.
"use client"

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"
import { Icon, type IconName } from "./icon"

/* ---------- Field wrapper ---------- */

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children?: ReactNode
  htmlFor?: string
}

/** Les contrôles qui admettent `aria-required` : les champs natifs et ceux du paquet. */
const admetObligation = (type: unknown): boolean =>
  type === "input" || type === "textarea" || type === "select" || type === TextInput || type === TextArea || type === Select

/**
 * Enveloppe de champ.
 *
 * ⚠️ `Field` ne rend PAS le contrôle : l'enfant lui est passé en frère du
 * `<label>`, jamais enveloppé. Sans `for`, l'étiquette rendue n'est donc liée à
 * aucun champ — un lecteur d'écran annonce un champ sans dire lequel
 * (WCAG 1.3.1 et 4.1.2). L'audit du 25/08/2026 a mesuré 76 usages de ce seul
 * composant où `htmlFor` n'était pas fourni.
 *
 * Plutôt que de rendre la propriété obligatoire — une rupture typée ne corrige
 * rien tant que chaque appelant n'a pas été repris —, on génère un identifiant
 * et on le propage à l'enfant. Un `htmlFor` explicite reste prioritaire, et un
 * `id` déjà porté par l'enfant n'est jamais écrasé.
 *
 * La même passe relie `hint` et `error` par `aria-describedby` et pose
 * `aria-invalid` : WCAG 3.3.1 et 3.3.2 pour le même coût.
 *
 * Repli : si l'enfant n'est pas un élément unique (fragment, liste, texte),
 * rien ne peut être propagé et le comportement d'origine s'applique.
 */
export const Field = ({ label, hint, error, required, children, htmlFor }: FieldProps) => {
  const genere = useId()
  const controleId = htmlFor ?? genere
  const hintId = hint && !error ? `${controleId}-hint` : undefined
  const errorId = error ? `${controleId}-error` : undefined
  const decritPar = [hintId, errorId].filter(Boolean).join(" ") || undefined

  const enfant = isValidElement<{
    id?: string
    "aria-describedby"?: string
    "aria-invalid"?: boolean
    "aria-required"?: boolean
  }>(children)
    ? cloneElement(children, {
        id: children.props.id ?? controleId,
        "aria-describedby": children.props["aria-describedby"] ?? decritPar,
        "aria-invalid": children.props["aria-invalid"] ?? (error ? true : undefined),
        // L'obligation se dit au champ lui-même (WCAG 1.3.1) : l'astérisque n'en est que le signe visuel.
        // `aria-required` n'est pas un attribut global : seulement sur un champ qui l'admet.
        "aria-required": children.props["aria-required"] ?? (required && admetObligation(children.type) ? true : undefined),
      })
    : children

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label
          htmlFor={controleId}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink-800)",
            letterSpacing: "0.01em",
          }}
        >
          {label}
          {required && <span aria-hidden="true" style={{ color: "var(--role-danger-ink, var(--danger-500))", marginLeft: 4 }}>*</span>}
        </label>
      )}
      {enfant}
      {hint && !error && (
        <span id={hintId} style={{ fontSize: 12, color: "var(--ink-500)" }}>
          {hint}
        </span>
      )}
      {error && (
        <span
          id={errorId}
          style={{
            fontSize: 12,
            color: "var(--role-danger-ink, var(--danger-500))",
            display: "flex",
            gap: 4,
            alignItems: "center",
          }}
        >
          <Icon name="alertCircle" size={12} />
          {error}
        </span>
      )}
    </div>
  )
}

const INPUT_BASE: CSSProperties = {
  fontFamily: "inherit",
  fontSize: "var(--esp-field-font-size, 14px)",
  lineHeight: "var(--esp-field-line-height, normal)",
  color: "var(--ink-900)",
  padding: "8px 12px",
  // Jeton et non valeur en dur : un style EN LIGNE l'emporte sur toute feuille
  // de style, le plancher tactile du socle mobile ne pouvait donc pas
  // s'appliquer à ces champs. Cf. la note détaillée dans `button.tsx`.
  minHeight: "var(--ui2-field-min-h, 38px)",
  background: "var(--ink-0)",
  border: "1px solid var(--ink-300)",
  borderRadius: "var(--esp-input-radius, 6px)",
  // Aucune `outline` ici : un style EN LIGNE l'emporterait sur l'indicateur de focus
  // de la classe `FIELD_CONTROL_CLASS` (WCAG 2.4.7, échec F78).
  width: "100%",
  transition: "border-color .12s, box-shadow .12s",
}

/**
 * Classe des trois champs du paquet : son indicateur de focus au clavier vit dans
 * la couche de base (`styles/theme.css`, `.ui-field:focus-visible`), à l'anneau de
 * la charte (`--ring`). Une classe passée par l'écran s'y ajoute, jamais ne la remplace.
 */
const FIELD_CONTROL_CLASS = "ui-field"

const fieldControlClass = (className: string | undefined) => (className ? `${FIELD_CONTROL_CLASS} ${className}` : FIELD_CONTROL_CLASS)

/* ---------- TextInput ---------- */

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { icon, style, className, ...rest },
  ref,
) {
  return (
    <div style={{ position: "relative" }}>
      {icon && (
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--ink-500)",
          }}
        >
          <Icon name={icon} size={16} />
        </span>
      )}
      <input
        ref={ref}
        {...rest}
        className={fieldControlClass(className)}
        style={{ ...INPUT_BASE, paddingLeft: icon ? 36 : 12, ...style }}
      />
    </div>
  )
})

/* ---------- TextArea ---------- */

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ style, className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        {...rest}
        className={fieldControlClass(className)}
        style={{ ...INPUT_BASE, minHeight: "var(--esp-textarea-min-height, 100px)", resize: "vertical", ...style }}
      />
    )
  },
)

/* ---------- Select ---------- */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children?: ReactNode
}

export const Select = ({ children, style, className, ...rest }: SelectProps) => (
  <div style={{ position: "relative" }}>
    <select
      {...rest}
      className={fieldControlClass(className)}
      style={{ ...INPUT_BASE, appearance: "none", paddingRight: 36, ...style }}
    >
      {children}
    </select>
    <span
      style={{
        position: "absolute",
        right: 12,
        top: "50%",
        transform: "translateY(-50%)",
        color: "var(--ink-500)",
        pointerEvents: "none",
      }}
    >
      <Icon name="chevronDown" size={16} />
    </span>
  </div>
)

/* ---------- Cases, choix radio, interrupteurs : focus au clavier ---------- */

/**
 * L'entrée native de `Checkbox`, `Radio` et `Toggle` est invisible : c'est son visuel
 * de remplacement qui se voit. L'entrée PRÉCÈDE donc ce visuel, frère immédiat, pour
 * que la couche de base (`styles/theme.css`, `.ui-choice-input:focus-visible +
 * .ui-choice-mark`) pose sur lui l'anneau de la charte (`--ring`, ≥ 3:1 sur les fonds
 * de chaque thème et de la console : tests des thèmes) quand le clavier y arrive
 * (WCAG 2.4.7, échec F78). Le visuel ne porte aucune `outline` en ligne : elle
 * l'emporterait sur la règle. Une entrée positionnée en absolu ne compte pas dans la
 * mise en page : la placer avant le visuel ne déplace rien.
 */
const CHOICE_INPUT_CLASS = "ui-choice-input"
const CHOICE_MARK_CLASS = "ui-choice-mark"
const HIDDEN_CHOICE_INPUT: CSSProperties = { position: "absolute", opacity: 0, pointerEvents: "none" }

/* ---------- Checkbox ---------- */

export interface CheckboxProps {
  checked?: boolean
  onChange?: (next: boolean) => void
  label?: ReactNode
  id?: string
  style?: CSSProperties
}

export const Checkbox = ({ checked, onChange, label, id, style }: CheckboxProps) => (
  <label
    htmlFor={id}
    style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", ...style }}
  >
    <input
      type="checkbox"
      id={id}
      className={CHOICE_INPUT_CLASS}
      checked={Boolean(checked)}
      onChange={(e) => onChange?.(e.target.checked)}
      readOnly={!onChange}
      style={HIDDEN_CHOICE_INPUT}
    />
    <span
      className={CHOICE_MARK_CLASS}
      style={{
        width: 18,
        height: 18,
        marginTop: 2,
        borderRadius: 3,
        border: `1.5px solid ${checked ? "var(--primary-fill)" : "var(--ink-400)"}`,
        background: checked ? "var(--primary-fill)" : "var(--ink-0)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "border-color .1s, background .1s",
      }}
    >
      {checked && <Icon name="check" size={12} stroke={3} style={{ color: "var(--primary-fill-on, var(--on-fill))" }} />}
    </span>
    {label && (
      <span style={{ fontSize: 14, color: "var(--ink-800)", lineHeight: 1.4 }}>{label}</span>
    )}
  </label>
)

/* ---------- Radio ---------- */

export interface RadioProps {
  checked?: boolean
  onChange?: (next: boolean) => void
  label?: ReactNode
  id?: string
  hint?: ReactNode
  name?: string
  value?: string
}

export const Radio = ({ checked, onChange, label, id, hint, name, value }: RadioProps) => (
  <label
    htmlFor={id}
    style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      cursor: "pointer",
      padding: "10px 12px",
      borderRadius: "var(--esp-input-radius, 6px)",
      border: `1px solid ${checked ? "var(--primary-500)" : "var(--ink-200)"}`,
      background: checked ? "var(--primary-50)" : "var(--ink-0)",
      transition: "border-color .12s, background .12s",
    }}
  >
    <input
      type="radio"
      id={id}
      name={name}
      value={value}
      className={CHOICE_INPUT_CLASS}
      checked={Boolean(checked)}
      onChange={(e) => onChange?.(e.target.checked)}
      readOnly={!onChange}
      style={HIDDEN_CHOICE_INPUT}
    />
    <span
      className={CHOICE_MARK_CLASS}
      style={{
        width: 18,
        height: 18,
        marginTop: 2,
        borderRadius: "50%",
        flexShrink: 0,
        border: `1.5px solid ${checked ? "var(--primary-500)" : "var(--ink-400)"}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ink-0)",
      }}
    >
      {checked && (
        <span
          style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--primary-500)" }}
        />
      )}
    </span>
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>{label}</span>
      {hint && <span style={{ fontSize: 13, color: "var(--ink-600)" }}>{hint}</span>}
    </span>
  </label>
)

/* ---------- Toggle ---------- */

export interface ToggleProps {
  checked?: boolean
  onChange?: (next: boolean) => void
  label?: ReactNode
}

export const Toggle = ({ checked, onChange, label }: ToggleProps) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
    <input
      type="checkbox"
      className={CHOICE_INPUT_CLASS}
      checked={Boolean(checked)}
      onChange={(e) => onChange?.(e.target.checked)}
      readOnly={!onChange}
      style={HIDDEN_CHOICE_INPUT}
    />
    <span
      className={CHOICE_MARK_CLASS}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        background: checked ? "var(--primary-fill)" : "var(--ink-300)",
        position: "relative",
        transition: "background .15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: checked ? "var(--primary-fill-on, var(--on-fill))" : "var(--on-fill)",
          transition: "left .15s",
          boxShadow: "var(--shadow-knob)",
        }}
      />
    </span>
    {label && <span style={{ fontSize: 14, color: "var(--ink-800)" }}>{label}</span>}
  </label>
)
