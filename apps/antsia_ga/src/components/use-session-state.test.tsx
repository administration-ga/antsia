import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSessionState } from "./use-session-state"

const fixture = vi.hoisted(() => ({ auth: { isAuthenticated: true, isPending: false, isUnauthenticated: false }, queries: [] as unknown[], signingOut: false }))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => fixture.auth }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => fixture.signingOut }))
vi.mock("convex/react", () => ({ useQuery: () => fixture.queries.shift() }))
function Probe() { return <span>{useSessionState().status}</span> }
const root = { _id: "root", slug: "antsia" }
beforeEach(() => { fixture.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }; fixture.queries = []; fixture.signingOut = false })
function status(person: unknown, memberships: unknown[]) {
  fixture.queries = [root, person, memberships]
  return renderToStaticMarkup(<Probe />)
}
describe("porte personnelle PA5", () => {
  it("la révocation locale ne redirige pas vers l'accueil quand les projections disparaissent", () => {
    fixture.signingOut = true
    expect(status(null, [])).toBe("<span>loading</span>")
    fixture.signingOut = false
    expect(status(null, [])).toBe("<span>welcome</span>")
  })
  it("la sortie conserve sa navigation jusqu'à la purge du reçu HTTP, même SDK anonyme", () => {
    fixture.signingOut = true
    fixture.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    expect(status(null, [])).toBe("<span>loading</span>")
    fixture.signingOut = false
    expect(status(null, [])).toBe("<span>signedOut</span>")
  })
  it("une personne suspendue trouve ses recours, sans repasser par l'inscription", () => {
    expect(status({ published: true }, [{ networkId: "root", status: "suspendue" }])).toBe("<span>restricted</span>")
  })
  it("une personne suspendue sans profil publié trouve aussi ses droits personnels", () => {
    expect(status({ published: false }, [{ networkId: "root", status: "suspendue" }])).toBe("<span>restricted</span>")
  })
  it("une adhésion active conserve le fil ; une personne sans adhésion conserve l'entrée", () => {
    expect(status({ published: true }, [{ networkId: "root", status: "declaree" }])).toBe("<span>member</span>")
    expect(status({ published: true }, [])).toBe("<span>welcome</span>")
  })
})
