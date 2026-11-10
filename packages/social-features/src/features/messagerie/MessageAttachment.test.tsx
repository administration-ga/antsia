// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { EngineTestWrapper } from "../../tests/engine-wrapper"
import { MessageAttachment } from "./MessageAttachment"

const base = { filename: "devis.pdf", mimeType: "application/pdf", sizeBytes: 1_200 }

describe("MessageAttachment — pièce retenue par la garde des fichiers", () => {
  it("dit qu'une analyse n'a pas pu aboutir, sans clé brute ni lien vers la pièce", () => {
    const view = render(<EngineTestWrapper><MessageAttachment attachment={{ ...base, url: null, withheld: "fileScanUnavailable" }} /></EngineTestWrapper>)
    expect(screen.getByText("L'analyse de sécurité n'a pas pu être terminée. Le fichier reste indisponible jusqu'à sa vérification.")).toBeInTheDocument()
    expect(screen.queryByText("fileScanUnavailable")).toBeNull()
    expect(view.container.querySelector("a[href], img, audio, video")).toBeNull()
  })

  it("ne sert jamais une pièce retenue, même quand une URL l'accompagne", () => {
    const view = render(<EngineTestWrapper><MessageAttachment attachment={{ ...base, url: "https://media.example/devis.pdf", withheld: "fileScanUnavailable" }} /></EngineTestWrapper>)
    expect(view.container.querySelector("a[href], img, audio, video")).toBeNull()
    expect(view.container.querySelector("[data-withheld=fileScanUnavailable]")).not.toBeNull()
  })
})
