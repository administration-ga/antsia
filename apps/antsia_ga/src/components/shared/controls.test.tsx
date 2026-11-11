import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Button, buttonClassName, Field, TextInput } from "./controls"

describe("variante commerce des boutons (ADR-0027)", () => {
  it("lit la couleur du commerce et garde l'aplat d'identité en repli", () => {
    const classes = buttonClassName("commerce")
    expect(classes).toContain("bg-[var(--role-commerce-fill,var(--primary-fill))]")
    expect(classes).toContain("text-[color:var(--role-commerce-on,var(--primary-fill-on,var(--primary-foreground)))]")
    // Même facture que le bouton principal : seule la couleur change.
    expect(classes).toContain("min-h-11")
    expect(classes).not.toContain("bg-[var(--primary-fill)]")
  })

  it("laisse le bouton principal sur l'aplat d'identité", () => {
    expect(buttonClassName()).toContain("bg-[var(--primary-fill)]")
    expect(buttonClassName()).not.toContain("--role-commerce-fill")
  })

  it("applique la variante au composant Button", () => {
    const html = renderToStaticMarkup(<Button variant="commerce">Commander</Button>)
    expect(html).toContain("--role-commerce-fill")
  })
})

describe("variantes des messages (ADR-0027)", () => {
  it("met Écrire en tonal des messages, carte et encre d'identité en repli", () => {
    const classes = buttonClassName("message")
    expect(classes).toContain("bg-[var(--role-message-soft,var(--card))]")
    expect(classes).toContain("text-[color:var(--role-message-ink,var(--primary))]")
    // Le filet prend le fond tonal : aucun contour visible quand le thème déclare la couleur.
    expect(classes).toContain("border-[color:var(--role-message-soft,var(--border))]")
    expect(classes).toContain("min-h-11")
    expect(classes).not.toContain("--role-message-fill")
  })

  it("met Envoyer à l'aplat des messages, l'aplat d'identité en repli", () => {
    const classes = buttonClassName("send")
    expect(classes).toContain("bg-[var(--role-message-fill,var(--primary-fill))]")
    expect(classes).toContain("text-[color:var(--role-message-on,var(--primary-fill-on,var(--primary-foreground)))]")
    expect(classes).not.toContain("bg-[var(--primary-fill)]")
    expect(classes).not.toContain("--role-message-soft")
  })

  it("applique les deux variantes au composant Button", () => {
    expect(renderToStaticMarkup(<Button variant="message">Écrire</Button>)).toContain("--role-message-soft")
    expect(renderToStaticMarkup(<Button variant="send">Envoyer</Button>)).toContain("--role-message-fill")
  })
})

describe("Field — aide et erreur reliées au champ (EX-18, WCAG 1.3.1 et 3.3.1)", () => {
  const control = (html: string) => {
    const input = /<input[^>]*>/.exec(html)?.[0] ?? ""
    return { describedBy: /aria-describedby="([^"]*)"/.exec(input)?.[1] ?? null, invalid: /aria-invalid="([^"]*)"/.exec(input)?.[1] ?? null }
  }

  it("relie l'aide et l'erreur au champ et le marque invalide", () => {
    const html = renderToStaticMarkup(<Field id="adresse" label="Adresse" hint="Rue et quartier" error="Adresse requise"><TextInput id="adresse" /></Field>)
    expect(control(html)).toEqual({ describedBy: "adresse-hint adresse-error", invalid: "true" })
    expect(html).toContain('id="adresse-hint"')
    expect(html).toContain('id="adresse-error"')
  })

  it("sans erreur, ne relie que l'aide et ne marque rien", () => {
    expect(control(renderToStaticMarkup(<Field id="ville" label="Ville" hint="Facultatif"><TextInput id="ville" /></Field>))).toEqual({ describedBy: "ville-hint", invalid: null })
    expect(control(renderToStaticMarkup(<Field id="nom" label="Nom"><TextInput id="nom" /></Field>))).toEqual({ describedBy: null, invalid: null })
  })

  it("garde les références posées par l'écran, sans doublon", () => {
    const html = renderToStaticMarkup(<Field id="code" label="Code" hint="Six chiffres" error="Code incomplet"><TextInput id="code" aria-describedby="code-hint aide-externe" /></Field>)
    expect(control(html)).toEqual({ describedBy: "code-hint aide-externe code-error", invalid: "true" })
  })

  it("rend tel quel un enfant qui n'est pas un élément unique", () => {
    const html = renderToStaticMarkup(<Field id="libre" label="Libre" error="Erreur"><><TextInput id="libre" /></></Field>)
    expect(control(html)).toEqual({ describedBy: null, invalid: null })
  })
})
