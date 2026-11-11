// Dupliqué de socle/packages/ui-v2/src/components/form.a11y.test.tsx @ ad2e7fdc2 — adaptations : environnement jsdom déclaré en tête (l'environnement par défaut du paquet est `node`). ; EX-18 : classe de focus des champs et absence d'outline en ligne, obligation transmise au champ (`aria-required`). EX-18, second volet : focus au clavier des cases, choix radio et interrupteurs sur leur visuel.
// @vitest-environment jsdom
/**
 * Cliquet de LIAISON ÉTIQUETTE ↔ CHAMP sur `Field`.
 *
 * Ce que ces tests tiennent : `Field` ne rend pas le contrôle. L'enfant lui est
 * passé en FRÈRE du `<label>`, jamais enveloppé — donc sans attribut `for`,
 * l'étiquette rendue ne désigne aucun champ. Rien ne casse à l'écran : la page
 * paraît correcte, et un lecteur d'écran annonce un champ sans dire lequel.
 * C'est précisément le genre de défaut qu'aucun compilateur ne voit et qu'aucun
 * test de rendu classique ne cherche.
 *
 * Le défaut d'origine, mesuré par l'audit de conformité du 2026-08-25 :
 * `htmlFor` était optionnel et aucun identifiant de repli n'était généré —
 * 76 usages de ce composant s'en passaient. WCAG 1.3.1 et 4.1.2.
 *
 * Les assertions portent sur la MÉCANIQUE, pas sur la valeur : on ne vérifie
 * jamais l'identifiant produit (il vient de `useId`, il est instable par
 * construction), mais que l'étiquette et le champ désignent le MÊME.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { Checkbox, Field, Radio, Select, TextArea, TextInput, Toggle } from "./form"

/** L'étiquette pointe-t-elle vers un élément qui existe vraiment ? */
const lieEtChamp = (labelText: string) => {
  const label = screen.getByText(labelText).closest("label")
  expect(label, "aucun <label> rendu").not.toBeNull()
  const cible = label!.getAttribute("for")
  expect(cible, "le <label> ne porte aucun attribut for").toBeTruthy()
  return document.getElementById(cible!)
}

describe("Field — liaison étiquette ↔ champ", () => {
  test("sans htmlFor, un identifiant est généré ET propagé à l'enfant", () => {
    render(
      <Field label="Nom de famille">
        <TextInput />
      </Field>,
    )
    // C'est LE test : le défaut d'origine laissait `for` vide et cette
    // résolution renvoyait null, sans que rien d'autre ne bronche.
    expect(lieEtChamp("Nom de famille")).toBe(screen.getByRole("textbox"))
  })

  test("un htmlFor explicite reste prioritaire", () => {
    render(
      <Field label="Matricule" htmlFor="matricule-agent">
        <TextInput />
      </Field>,
    )
    expect(screen.getByText("Matricule").closest("label")).toHaveAttribute(
      "for",
      "matricule-agent",
    )
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "matricule-agent")
  })

  test("un id déjà porté par l'enfant n'est jamais écrasé", () => {
    render(
      <Field label="Téléphone">
        <TextInput id="tel-perso" />
      </Field>,
    )
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "tel-perso")
  })

  test("le champ est accessible par son étiquette", () => {
    render(
      <Field label="Adresse de courriel">
        <TextInput />
      </Field>,
    )
    // getByLabelText échoue si la liaison est rompue : c'est la garantie
    // vue du côté de l'utilisateur de lecteur d'écran.
    expect(screen.getByLabelText("Adresse de courriel")).toBeInTheDocument()
  })

  test("l'aide est reliée au champ par aria-describedby", () => {
    render(
      <Field label="NIP" hint="Treize chiffres, sans espace">
        <TextInput />
      </Field>,
    )
    const champ = screen.getByRole("textbox")
    const decritPar = champ.getAttribute("aria-describedby")
    expect(decritPar, "aucun aria-describedby posé").toBeTruthy()
    expect(document.getElementById(decritPar!)).toHaveTextContent(
      "Treize chiffres, sans espace",
    )
  })

  test("une erreur est reliée au champ ET marque aria-invalid", () => {
    render(
      <Field label="Date de naissance" error="Format attendu : JJ/MM/AAAA">
        <TextInput />
      </Field>,
    )
    const champ = screen.getByRole("textbox")
    expect(champ).toHaveAttribute("aria-invalid", "true")
    const decritPar = champ.getAttribute("aria-describedby")
    expect(document.getElementById(decritPar!)).toHaveTextContent(
      "Format attendu : JJ/MM/AAAA",
    )
  })

  test("sans erreur, aucun aria-invalid n'est posé", () => {
    render(
      <Field label="Commune">
        <TextInput />
      </Field>,
    )
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid")
  })

  test("un enfant non élément ne fait pas tomber le rendu", () => {
    // Repli : rien ne peut être propagé à un fragment ou à du texte nu.
    // Le composant doit rendre malgré tout — une régression ici casserait
    // des écrans existants.
    render(<Field label="Champ libre">texte brut</Field>)
    expect(screen.getByText("texte brut")).toBeInTheDocument()
  })
})

/**
 * EX-18 (WCAG 2.4.7, échec F78) : un style EN LIGNE l'emporte sur toute feuille non
 * `!important`. Avec `outline: none` en ligne, aucune règle de focus ne pouvait
 * s'appliquer aux champs du paquet. Les champs portent désormais la classe
 * `ui-field`, dont l'indicateur vit dans la couche de base (`styles/theme.css`,
 * contraste contrôlé par les tests des thèmes), et aucune `outline` en ligne.
 */
describe("champs — indicateur de focus au clavier", () => {
  test("les trois champs portent la classe de focus, sans outline en ligne", () => {
    render(
      <>
        <TextInput aria-label="Adresse" />
        <TextArea aria-label="Message" />
        <Select aria-label="Audience">
          <option>Mon réseau</option>
        </Select>
      </>,
    )
    for (const champ of [screen.getByLabelText("Adresse"), screen.getByLabelText("Message"), screen.getByLabelText("Audience")]) {
      expect(champ).toHaveClass("ui-field")
      expect(champ.style.outline).toBe("")
      expect(champ.style.outlineStyle).toBe("")
    }
  })

  test("la classe d'un écran s'ajoute à celle du champ, sans la remplacer", () => {
    render(<TextInput aria-label="Code" className="font-mono text-lg" />)
    expect(screen.getByLabelText("Code")).toHaveClass("ui-field", "font-mono", "text-lg")
  })
})

describe("Field — champ obligatoire (EX-18, WCAG 1.3.1)", () => {
  test("l'obligation se dit au champ ; l'astérisque reste un signe visuel", () => {
    render(
      <Field label="Motif" required>
        <TextArea />
      </Field>,
    )
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-required", "true")
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true")
    // Le nom accessible est l'étiquette seule, sans « astérisque » lu.
    expect(screen.getByRole("textbox", { name: "Motif" })).toBeInTheDocument()
  })

  test("sans obligation, aucun aria-required n'est posé", () => {
    render(
      <Field label="Commentaire">
        <TextInput />
      </Field>,
    )
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-required")
  })
})

/**
 * EX-18, second volet (WCAG 2.4.7, échec F78) : `Checkbox`, `Radio` et `Toggle` cachent leur
 * entrée native (`opacity: 0`) derrière un visuel de remplacement. Le focus arrive sur
 * l'entrée ; c'est son visuel qui doit le montrer. La règle de la couche de base
 * (`styles/theme.css`, `.ui-choice-input:focus-visible + .ui-choice-mark`, épinglée avec son
 * anneau par `themes/antsia-themes.test.ts`) vise le visuel FRÈRE SUIVANT de l'entrée : ces
 * tests tiennent la structure qu'elle suppose, et l'absence d'`outline` en ligne qui l'annulerait.
 */
describe("cases, choix radio et interrupteurs — indicateur de focus au clavier", () => {
  test("chaque entrée, focalisable, précède immédiatement son visuel, qui ne porte aucune outline en ligne", () => {
    render(
      <>
        <Checkbox label="Accepter les conditions" onChange={() => {}} />
        <Radio name="audience" value="network" label="Mon réseau" onChange={() => {}} />
        <Toggle label="Recevoir les alertes" onChange={() => {}} />
      </>,
    )
    const entrees = [
      screen.getByRole("checkbox", { name: "Accepter les conditions" }),
      screen.getByRole("radio", { name: "Mon réseau" }),
      screen.getByRole("checkbox", { name: "Recevoir les alertes" }),
    ]
    for (const entree of entrees) {
      expect(entree).toHaveClass("ui-choice-input")
      const visuel = entree.nextElementSibling as HTMLElement | null
      expect(visuel, "aucun visuel juste après l'entrée").not.toBeNull()
      expect(visuel).toHaveClass("ui-choice-mark")
      expect(visuel!.style.outline).toBe("")
      expect(visuel!.style.outlineStyle).toBe("")
      // Invisible, l'entrée reste atteignable au clavier.
      entree.focus()
      expect(document.activeElement).toBe(entree)
    }
    // Le sélecteur de la règle (sans sa pseudo-classe) trouve exactement les trois visuels.
    expect(document.querySelectorAll(".ui-choice-input + .ui-choice-mark")).toHaveLength(3)
  })

  test("cocher passe toujours par l'entrée native : l'étiquette et son visuel la commandent", () => {
    const changes: boolean[] = []
    render(<Checkbox label="Rejoindre le groupe" onChange={(next) => changes.push(next)} />)
    screen.getByText("Rejoindre le groupe").click()
    expect(changes).toEqual([true])
  })
})
