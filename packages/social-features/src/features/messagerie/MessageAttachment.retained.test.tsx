// @vitest-environment jsdom
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"
import { MessageAttachment } from "./MessageAttachment"

describe("pièces jointes retenues", () => {
  it.each(["fileScanUnavailable", "fileQuarantined", "fileScanPending"] as const)("retient aussi une ancienne URL quand le serveur indique %s", (withheld: MediaWithheld) => {
    const view = renderWithEngine(<MessageAttachment attachment={{ filename: "photo.png", mimeType: "image/png", sizeBytes: 12, url: "https://media.example/retained.png", withheld }} />)
    expect(view.container.querySelector("img, video, audio, a[href]")).toBeNull()
    expect(screen.getByText("photo.png")).toBeInTheDocument()
    if (withheld === "fileScanUnavailable") {
      expect(screen.getByText("L'analyse de sécurité n'a pas pu être terminée. Le fichier reste indisponible jusqu'à sa vérification.")).toBeInTheDocument()
      expect(screen.queryByText("bloqué par l'analyse de sécurité")).toBeNull()
    }
  })
})
