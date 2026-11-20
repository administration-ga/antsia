// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { StrictMode, useEffect, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

import { PostHogProvider, useUsageFunnel, type PostHogProviderProps } from "./PostHogProvider"
import { USAGE_SCREENS, type UsagePayload, type UsageScreen, type UsageLocale } from "./posthog"

const configuration = { endpoint: "https://eu.i.posthog.com/i/v0/e/", projectToken: "phc_0123456789abcdef0123456789abcdef" }
const FIRST_UUID = "01234567-89ab-4cde-8fab-0123456789ab"
const SECOND_UUID = "11234567-89ab-4cde-8fab-0123456789ab"
const fetchMock = vi.fn<typeof fetch>()
let randomUuid: MockInstance<Crypto["randomUUID"]>

function provider(overrides: Partial<Omit<PostHogProviderProps, "children">> = {}, children: ReactNode = <p>Écran disponible</p>) {
  return (
    <PostHogProvider configuration={configuration} consented screen="feed" networkSlug="antsia" locale="fr" {...overrides}>
      {children}
    </PostHogProvider>
  )
}

async function flushCapture() {
  await act(async () => { await Promise.resolve() })
}

function requestAt(index = 0) {
  const request = fetchMock.mock.calls[index]
  if (request?.[1] === undefined) throw new Error("missing request")
  return { target: request[0], options: request[1] }
}

function payloadAt(index = 0): UsagePayload {
  const body = requestAt(index).options.body
  if (typeof body !== "string") throw new Error("missing payload")
  return JSON.parse(body) as UsagePayload
}

function FunnelFixture({ consented, configured = true }: { consented: boolean; configured?: boolean }) {
  const capture = useUsageFunnel({ configuration: configured ? configuration : null, consented, networkSlug: "antsia", locale: "fr" })
  useEffect(() => { capture("entry_started") }, [capture, consented, configured])
  return <>
    <button onClick={() => capture("profile_completed")}>Profil</button>
    <button onClick={() => capture("membership_joined")}>Adhésion</button>
    <button onClick={() => capture("entry_completed")}>Entrée</button>
  </>
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-17T09:00:00Z"))
  fetchMock.mockReset().mockImplementation(() => new Promise<Response>(() => {}))
  vi.stubGlobal("fetch", fetchMock)
  randomUuid = vi.spyOn(window.crypto, "randomUUID").mockReturnValue(FIRST_UUID)
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Funnel d'accueil — accord déjà acquis", () => {
  it("ne mesure rien avant accord et conserve un UUID mémoire entre les étapes autorisées", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem")
    const view = render(<FunnelFixture consented={false} />)
    await flushCapture()
    act(() => screen.getByRole("button", { name: "Profil" }).click())
    await flushCapture()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(randomUuid).not.toHaveBeenCalled()
    view.rerender(<FunnelFixture consented />)
    await flushCapture()
    for (const name of ["Profil", "Adhésion", "Entrée"]) {
      act(() => screen.getByRole("button", { name }).click())
      await flushCapture()
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const payloads = fetchMock.mock.calls.map((_, index) => JSON.parse(String(requestAt(index).options.body)) as { event: string; properties: { distinct_id: string; step: string } })
    expect(payloads.map(payload => payload.event)).toEqual(Array(4).fill("onboarding_step"))
    expect(payloads.map(payload => payload.properties.step)).toEqual(["entry_started", "profile_completed", "membership_joined", "entry_completed"])
    expect(new Set(payloads.map(payload => payload.properties.distinct_id))).toEqual(new Set([FIRST_UUID]))
    expect(storage).not.toHaveBeenCalled()
    act(() => screen.getByRole("button", { name: "Profil" }).click())
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("annule le retrait, ignore une étape tardive et renouvelle l'UUID après nouvel accord", async () => {
    randomUuid.mockReturnValueOnce(FIRST_UUID).mockReturnValueOnce(SECOND_UUID)
    const view = render(<FunnelFixture consented />)
    await flushCapture()
    const signal = requestAt().options.signal
    view.rerender(<FunnelFixture consented={false} />)
    act(() => screen.getByRole("button", { name: "Profil" }).click())
    await flushCapture()
    expect(signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    view.rerender(<FunnelFixture consented />)
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(requestAt(1).options.body)).properties.distinct_id).toBe(SECOND_UUID)
  })

  it("reste fermé sans configuration et ne double pas la première étape sous StrictMode", async () => {
    const view = render(<FunnelFixture consented configured={false} />)
    await flushCapture()
    expect(fetchMock).not.toHaveBeenCalled()
    view.unmount()
    render(<StrictMode><FunnelFixture consented /></StrictMode>)
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("PostHogProvider — transport facultatif", () => {
  it("reste neutre sans configuration ou consentement et n'alloue aucune identité", async () => {
    const view = render(provider({ configuration: null }))
    await flushCapture()
    expect(screen.getByText("Écran disponible")).toBeVisible()
    view.rerender(provider({ consented: false }))
    await flushCapture()
    expect(screen.getByText("Écran disponible")).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(randomUuid).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("refuse les configurations, écrans, réseaux et langues invalides à la frontière runtime", async () => {
    const view = render(provider({ configuration: { ...configuration, endpoint: "http://analytics.example.test/i/v0/e/" } }))
    await flushCapture()
    view.rerender(provider({ configuration: { ...configuration, projectToken: "PLACEHOLDER" } }))
    await flushCapture()
    view.rerender(provider({ screen: null }))
    await flushCapture()
    view.rerender(provider({ screen: "/messages/private" as UsageScreen }))
    await flushCapture()
    view.rerender(provider({ networkSlug: "jh7a0123456789abcdefghijklmn" }))
    await flushCapture()
    view.rerender(provider({ locale: "fr-FR" as UsageLocale }))
    await flushCapture()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(randomUuid).not.toHaveBeenCalled()
  })

  it("projette l'écran déclaré et envoie un POST sans cookies, referrer, redirection ni livraison différée", async () => {
    render(provider())
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestAt().target).toBe(configuration.endpoint)
    const options = requestAt().options
    expect(options.method).toBe("POST")
    expect(options.headers).toEqual({ "Content-Type": "application/json" })
    expect(options.credentials).toBe("omit")
    expect(options.referrerPolicy).toBe("no-referrer")
    expect(options.redirect).toBe("error")
    expect(options.keepalive).toBeUndefined()
    expect(payloadAt()).toEqual({
      token: configuration.projectToken,
      event: "screen_viewed",
      properties: {
        distinct_id: FIRST_UUID,
        screen: "feed",
        network: "antsia",
        locale: "fr",
        $process_person_profile: false,
        $geoip_disable: true,
      },
    })
  })

  it("n'utilise aucune persistance ou cookie et ne lit pas le document pour constituer les propriétés", async () => {
    const getStorage = vi.spyOn(Storage.prototype, "getItem")
    const setStorage = vi.spyOn(Storage.prototype, "setItem")
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem")
    const getCookie = vi.spyOn(document, "cookie", "get")
    const setCookie = vi.spyOn(document, "cookie", "set")
    render(provider({}, <p>Contenu confidentiel awa.ndong idn-person-private</p>))
    await flushCapture()
    expect(getStorage).not.toHaveBeenCalled()
    expect(setStorage).not.toHaveBeenCalled()
    expect(removeStorage).not.toHaveBeenCalled()
    expect(getCookie).not.toHaveBeenCalled()
    expect(setCookie).not.toHaveBeenCalled()
    expect(JSON.stringify(payloadAt())).not.toMatch(/confidentiel|awa\.ndong|private/)
    expect(Object.keys(payloadAt().properties)).toEqual(["distinct_id", "screen", "network", "locale", "$process_person_profile", "$geoip_disable"])
  })

  it("déduplique le même écran réactif même si la configuration est recréée", async () => {
    const view = render(provider())
    await flushCapture()
    const signal = requestAt().options.signal
    view.rerender(provider({ configuration: { ...configuration } }))
    await flushCapture()
    view.rerender(provider({ configuration: { ...configuration } }))
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(signal?.aborted).toBe(false)
    expect(randomUuid).toHaveBeenCalledTimes(1)
  })

  it("annule immédiatement la requête à la révocation du consentement", async () => {
    randomUuid.mockReturnValueOnce(FIRST_UUID).mockReturnValueOnce(SECOND_UUID)
    const view = render(provider())
    await flushCapture()
    const signal = requestAt().options.signal
    view.rerender(provider({ consented: false }))
    await flushCapture()
    expect(signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    view.rerender(provider())
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(randomUuid).toHaveBeenCalledTimes(2)
    expect(payloadAt(0).properties.distinct_id).toBe(FIRST_UUID)
    expect(payloadAt(1).properties.distinct_id).toBe(SECOND_UUID)
  })

  it("une révocation ou un démontage avant la microtask n’envoie rien et n’alloue aucune identité", async () => {
    const first = render(provider())
    first.rerender(provider({ consented: false }))
    await flushCapture()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(randomUuid).not.toHaveBeenCalled()
    first.unmount()
    render(provider()).unmount()
    await flushCapture()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(randomUuid).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("annule lors des changements d'écran, de réseau et de configuration", async () => {
    const view = render(provider())
    await flushCapture()
    view.rerender(provider({ screen: "profile" }))
    await flushCapture()
    expect(requestAt(0).options.signal?.aborted).toBe(true)
    expect(payloadAt(1).properties.screen).toBe("profile")
    view.rerender(provider({ screen: "profile", networkSlug: "diaspora-ga" }))
    await flushCapture()
    expect(requestAt(1).options.signal?.aborted).toBe(true)
    expect(payloadAt(2).properties.network).toBe("diaspora-ga")
    view.rerender(provider({ configuration: { ...configuration, endpoint: "https://other.example.test/i/v0/e/", euRelayOrigin: "https://other.example.test" } }))
    await flushCapture()
    expect(requestAt(2).options.signal?.aborted).toBe(true)
    expect(requestAt(3).target).toBe("https://other.example.test/i/v0/e/")
  })

  it("ferme le transport sur un réseau refusé et permet un retour à une configuration valide", async () => {
    const view = render(provider())
    await flushCapture()
    view.rerender(provider({ networkSlug: "private-network" }))
    await flushCapture()
    expect(requestAt(0).options.signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    view.rerender(provider({ configuration: null }))
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    view.rerender(provider())
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("borne les tentatives à dix par minute, sans libérer le budget par changement de réseau ou de configuration", async () => {
    const view = render(provider())
    await flushCapture()
    for (const screen of USAGE_SCREENS.slice(1)) {
      view.rerender(provider({ screen }))
      await flushCapture()
    }
    expect(fetchMock).toHaveBeenCalledTimes(10)
    view.rerender(provider({ networkSlug: "diaspora-ga" }))
    await flushCapture()
    view.rerender(provider({ configuration: { ...configuration, endpoint: "https://other.example.test/i/v0/e/", euRelayOrigin: "https://other.example.test" } }))
    await flushCapture()
    view.rerender(provider({ consented: false }))
    await flushCapture()
    view.rerender(provider())
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(10)
    act(() => vi.advanceTimersByTime(60_000))
    view.rerender(provider({ screen: "profile" }))
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(11)
  })

  it("ne libère aucune place si l'horloge revient en arrière", async () => {
    const view = render(provider())
    await flushCapture()
    for (const screen of USAGE_SCREENS.slice(1)) {
      view.rerender(provider({ screen }))
      await flushCapture()
    }
    vi.setSystemTime(new Date("2026-10-17T08:00:00Z"))
    view.rerender(provider({ screen: "feed", networkSlug: "diaspora-ga" }))
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })

  it("annule après cinq secondes sans réessayer et retire le timer au démontage", async () => {
    const view = render(provider())
    await flushCapture()
    const signal = requestAt().options.signal
    act(() => vi.advanceTimersByTime(4_999))
    expect(signal?.aborted).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("absorbe un refus asynchrone et une erreur synchrone de transport sans casser les enfants", async () => {
    fetchMock.mockRejectedValueOnce(new Error("transport unavailable"))
    const view = render(provider())
    await flushCapture()
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText("Écran disponible")).toBeVisible()
    expect(vi.getTimerCount()).toBe(0)
    fetchMock.mockImplementationOnce(() => { throw new Error("transport unavailable") })
    view.rerender(provider({ screen: "profile" }))
    await flushCapture()
    expect(screen.getByText("Écran disponible")).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("échoue fermé si un UUID aléatoire sûr n'est pas disponible", async () => {
    randomUuid.mockImplementationOnce(() => { throw new Error("unavailable") })
    render(provider())
    await flushCapture()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText("Écran disponible")).toBeVisible()
  })

  it("garde les enfants montés lors des changements de consentement ou de configuration", async () => {
    const mounted = vi.fn()
    const unmounted = vi.fn()
    function PersistentChild() {
      useEffect(() => { mounted(); return unmounted }, [])
      return <p>Salle persistante</p>
    }
    const view = render(provider({}, <PersistentChild />))
    await flushCapture()
    view.rerender(provider({ consented: false }, <PersistentChild />))
    await flushCapture()
    view.rerender(provider({ configuration: null }, <PersistentChild />))
    await flushCapture()
    view.rerender(provider({ screen: "conference" }, <PersistentChild />))
    await flushCapture()
    expect(mounted).toHaveBeenCalledTimes(1)
    expect(unmounted).not.toHaveBeenCalled()
    view.unmount()
    expect(unmounted).toHaveBeenCalledTimes(1)
    expect(requestAt().options.signal?.aborted).toBe(true)
  })

  it("n'associe pas deux montages à la même identité persistée", async () => {
    randomUuid.mockReturnValueOnce(FIRST_UUID).mockReturnValueOnce(SECOND_UUID)
    const first = render(provider())
    await flushCapture()
    first.unmount()
    render(provider())
    await flushCapture()
    expect(payloadAt(0).properties.distinct_id).toBe(FIRST_UUID)
    expect(payloadAt(1).properties.distinct_id).toBe(SECOND_UUID)
  })

  it("StrictMode envoie une seule capture dont le signal reste vivant", async () => {
    render(<StrictMode>{provider()}</StrictMode>)
    expect(fetchMock).not.toHaveBeenCalled()
    await flushCapture()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(randomUuid).toHaveBeenCalledTimes(1)
    expect(requestAt().options.signal?.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(1)
  })
})
