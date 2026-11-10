import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// IM-01 (issue antsia#100, lot IC-04) : la déclaration « appels ouverts » de l'application.
// Le paquet reste testé en node : l'effet d'initialisation du fournisseur passe tout de suite.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: <T,>() => ["antsia" as T, () => undefined] as const,
  useEffect: () => undefined,
}))

import type { Id } from "./engine"
import { NetworkProvider, useCallsAvailable, type EngineRoutes } from "./network"

const routes: EngineRoutes = {
  home: () => "/fil", messages: () => "/messages", stories: () => "/actus",
  profile: handle => `/profil/${handle}`, page: handle => `/page/${handle}`,
  conference: sessionId => `/conference/${sessionId}`,
}

function Probe() { return <output>{String(useCallsAvailable())}</output> }
function render(callsAvailable?: boolean) {
  return renderToStaticMarkup(
    <NetworkProvider networkId={"network-calls" as Id<"networks">} personId={"person-calls" as Id<"persons">}
      slug="antsia" charte="antsia" routes={routes} {...(callsAvailable === undefined ? {} : { callsAvailable })}><Probe /></NetworkProvider>,
  )
}

describe("callsAvailable — la déclaration « appels ouverts »", () => {
  it("absente : les appels restent proposés (rien ne change pour antsia.ga)", () => {
    expect(render()).toBe("<output>true</output>")
  })
  it("à `false` : les surfaces qui lancent un appel le lisent fermé ; à `true`, ouvert", () => {
    expect(render(false)).toBe("<output>false</output>")
    expect(render(true)).toBe("<output>true</output>")
  })
  it("hors d'un NetworkProvider : ouverts (surfaces montées avant l'adhésion)", () => {
    expect(renderToStaticMarkup(<Probe />)).toBe("<output>true</output>")
  })
})
