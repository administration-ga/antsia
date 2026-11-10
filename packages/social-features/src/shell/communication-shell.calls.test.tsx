// @vitest-environment jsdom
// IM-01 (issue antsia#100, lot IC-04) : une application qui ne propose pas d'appels
// (`callsAvailable={false}`) garde la couche qui REÇOIT un appel — sonnerie, carte entrante, salle.
import { cleanup, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../tests/engine-wrapper"

vi.mock("./communication/global-call-surface-host", () => ({ GlobalCallSurfaceHost: () => <div data-testid="call-surface-host" /> }))
vi.mock("./communication/direct-session-host", () => ({ DirectSessionHost: () => null }))
vi.mock("./presence/use-presence-heartbeat", () => ({ usePresenceHeartbeat: () => undefined }))

import { CommunicationShell } from "./communication-shell"

afterEach(cleanup)

describe("CommunicationShell — la couche qui reçoit un appel ne dépend pas de `callsAvailable`", () => {
  it.each([undefined, false] as const)("callsAvailable=%s : l'hôte de la couche d'appel est monté", (callsAvailable) => {
    renderWithEngine(<CommunicationShell />, callsAvailable === undefined ? {} : { callsAvailable })
    expect(screen.getByTestId("call-surface-host")).toBeInTheDocument()
  })
})
