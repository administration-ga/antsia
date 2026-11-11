// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createAppI18n, type Locale } from "../../i18n"
import { IdentityEntry, identityErrorKey, identityErrorMessage, type IdentityAuthClient, type IdentityEntryProps } from "./IdentityEntry"

const configuration = { idn: true, emailOtp: true, smsOtp: true, localCodes: false }

function client() {
  return {
    signIn: {
      oauth2: vi.fn(async () => ({ data: { url: "https://idn.example/authorize", redirect: true }, error: null })),
      emailOtp: vi.fn(async () => ({ data: { token: "session" }, error: null })),
    },
    emailOtp: { sendVerificationOtp: vi.fn(async () => ({ data: { success: true }, error: null })) },
    phoneNumber: {
      sendOtp: vi.fn(async () => ({ data: { message: "sent" }, error: null })),
      verify: vi.fn(async () => ({ data: { status: true, token: "session" }, error: null })),
    },
  } satisfies IdentityAuthClient
}

function mount(options: Partial<IdentityEntryProps> = {}, locale: Locale = "fr") {
  const authClient = client()
  const onAuthenticated = vi.fn()
  const i18n = createAppI18n({ locale, appResources: { fr: {}, en: {} }, defaultNS: "identity" })
  const view = render(<I18nextProvider i18n={i18n}><IdentityEntry authClient={authClient} callbackURL="/bienvenue" onAuthenticated={onAuthenticated} configuration={configuration} {...options} /></I18nextProvider>)
  return { authClient, onAuthenticated, ...view }
}

async function enterEmail() {
  fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "Awa@Example.ga" } })
  fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
  await screen.findByLabelText("Code à six chiffres")
}

afterEach(() => vi.useRealTimers())

describe("IdentityEntry — portes et disponibilité", () => {
  it("IDN vient avant les comptes légers et reçoit la route injectée", async () => {
    const { authClient, onAuthenticated } = mount()
    expect(screen.getAllByRole("button")[0]).toHaveTextContent("Continuer avec mon identité IDN")
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec mon identité IDN" }))
    await waitFor(() => expect(authClient.signIn.oauth2).toHaveBeenCalledOnce())
    expect(authClient.signIn.oauth2).toHaveBeenCalledWith(expect.objectContaining({ providerId: "idn", callbackURL: "/bienvenue" }))
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it("IDN reçoit la porte d'erreur injectée, et aucune quand l'application n'en donne pas", async () => {
    const withDoor = mount({ errorCallbackURL: "/entrer" })
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec mon identité IDN" }))
    await waitFor(() => expect(withDoor.authClient.signIn.oauth2).toHaveBeenCalledOnce())
    expect(withDoor.authClient.signIn.oauth2).toHaveBeenCalledWith(expect.objectContaining({ providerId: "idn", callbackURL: "/bienvenue", errorCallbackURL: "/entrer" }))
    withDoor.unmount()
    const bare = mount()
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec mon identité IDN" }))
    await waitFor(() => expect(bare.authClient.signIn.oauth2).toHaveBeenCalledOnce())
    expect(bare.authClient.signIn.oauth2).toHaveBeenCalledWith(expect.not.objectContaining({ errorCallbackURL: expect.anything() }))
  })

  it("IDN non configuré explique son indisponibilité et ne lance rien", () => {
    const { authClient } = mount({ configuration: { ...configuration, idn: false } })
    const button = screen.getByRole("button", { name: "Continuer avec mon identité IDN" })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/IDN n’est pas encore disponible/)
    fireEvent.click(button)
    expect(authClient.signIn.oauth2).not.toHaveBeenCalled()
  })

  it("la configuration en attente désactive les opérations", () => {
    mount({ configuration: undefined })
    expect(screen.getByRole("status")).toHaveTextContent("Vérification des moyens")
    expect(screen.getByRole("button", { name: "Recevoir un code" })).toBeDisabled()
  })

  it("une configuration indisponible n'invente pas de fournisseur", () => {
    mount({ configuration: null })
    expect(screen.getByRole("alert")).toHaveTextContent("moyens de connexion sont indisponibles")
    expect(screen.getByRole("button", { name: "Recevoir un code" })).toBeDisabled()
  })

  it("affiche l'anglais avec le même parcours", () => {
    mount({}, "en")
    expect(screen.getByRole("button", { name: "Continue with my IDN identity" })).toBeEnabled()
    expect(screen.getByLabelText("Email address")).toBeVisible()
  })

  it("la présentation compacte conserve les portes, les libellés accessibles et la vérification OTP", async () => {
    const { authClient, onAuthenticated, container } = mount({ presentation: "compact", headingLevel: 2, title: "Connexion", lead: "" })
    expect(screen.getByRole("heading", { name: "Connexion", level: 2 })).toBeVisible()
    expect(container.querySelector('[data-slot="card"]')).toBeNull()
    expect(screen.getAllByRole("button")[0]).toHaveTextContent("Continuer avec mon identité IDN")
    expect(screen.getByLabelText("Adresse e-mail")).toBeVisible()
    // EX-18 (WCAG 3.3.2) : même compacte, l'entrée garde une étiquette visible au-dessus du champ.
    expect(screen.getByText("Adresse e-mail", { selector: "label" })).toBeVisible()
    expect(screen.getByLabelText("Adresse e-mail")).not.toHaveAttribute("aria-label")
    await enterEmail()
    fireEvent.change(screen.getByLabelText("Code à six chiffres"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Me connecter" }))
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce())
    expect(authClient.signIn.emailOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "awa@example.ga", otp: "123456" }))
  })

  it("la présentation compacte explique aussi une porte IDN désactivée", () => {
    mount({ presentation: "compact", configuration: { ...configuration, idn: false } })
    expect(screen.getByRole("button", { name: "Continuer avec mon identité IDN" })).toBeDisabled()
    expect(screen.getByText(/IDN n’est pas encore disponible/)).toBeVisible()
  })

  it("le refus OAuth est rendu sur la porte, sans authentifier", async () => {
    const authClient = client()
    authClient.signIn.oauth2.mockResolvedValueOnce({ data: null, error: { status: 503 } } as unknown as Awaited<ReturnType<typeof authClient.signIn.oauth2>>)
    const { onAuthenticated } = mount({ authClient })
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec mon identité IDN" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("connexion n’a pas abouti")
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it("OAuth sans redirection prouvée ne laisse pas un bouton silencieux", async () => {
    const authClient = client()
    authClient.signIn.oauth2.mockResolvedValueOnce({ data: {}, error: null } as unknown as Awaited<ReturnType<typeof authClient.signIn.oauth2>>)
    mount({ authClient })
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec mon identité IDN" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("connexion n’a pas abouti")
  })
})

describe("IdentityEntry — codes et retours utilisateur", () => {
  it("normalise l'e-mail et n'envoie jamais un format invalide", async () => {
    const { authClient } = mount()
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "invalid" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    await waitFor(() => expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("aria-invalid", "true"))
    expect(authClient.emailOtp.sendVerificationOtp).not.toHaveBeenCalled()
    await enterEmail()
    expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "awa@example.ga", type: "sign-in" }))
  })

  it("la demande de code porte la langue affichée : le moteur compose le code dans cette langue", async () => {
    const french = mount()
    await enterEmail()
    expect(french.authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith(expect.objectContaining({ fetchOptions: expect.objectContaining({ headers: { "Accept-Language": "fr" } }) }))
    french.unmount()
    const english = mount({}, "en")
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "awa@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Receive a code" }))
    await screen.findByLabelText("Six-digit code")
    expect(english.authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "awa@example.ga", fetchOptions: expect.objectContaining({ headers: { "Accept-Language": "en" } }) }))
    english.unmount()
    const sms = mount({ configuration: { ...configuration, emailOtp: false } }, "en")
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+24177123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Receive a code" }))
    await screen.findByLabelText("Six-digit code")
    expect(sms.authClient.phoneNumber.sendOtp).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "+24177123456", fetchOptions: expect.objectContaining({ headers: { "Accept-Language": "en" } }) }))
  })

  it("une panne d'envoi est visible et conserve le champ pour réessayer", async () => {
    const authClient = client()
    authClient.emailOtp.sendVerificationOtp.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    mount({ authClient })
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "awa@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Vérifiez votre connexion")
    expect(screen.getByLabelText("Adresse e-mail")).toHaveValue("awa@example.ga")
    expect(screen.getByRole("button", { name: "Recevoir un code" })).toBeEnabled()
  })

  it("un envoi sans succès serveur reste sur les coordonnées", async () => {
    const authClient = client()
    authClient.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: { success: false }, error: null })
    mount({ authClient })
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "awa@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("connexion n’a pas abouti")
    expect(screen.queryByLabelText("Code à six chiffres")).not.toBeInTheDocument()
  })

  it("un envoi en cours ne se duplique pas et annonce son attente", async () => {
    let resolve: (value: { data: { success: boolean }; error: null }) => void = () => undefined
    const authClient = client()
    authClient.emailOtp.sendVerificationOtp.mockImplementationOnce(() => new Promise((done) => { resolve = done }) as ReturnType<typeof authClient.emailOtp.sendVerificationOtp>)
    mount({ authClient })
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "awa@example.ga" } })
    const submit = screen.getByRole("button", { name: "Recevoir un code" })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledOnce())
    expect(screen.getByRole("button", { name: "Envoi du code…" })).toHaveAttribute("aria-busy", "true")
    await act(async () => resolve({ data: { success: true }, error: null }))
    expect(screen.getByLabelText("Code à six chiffres")).toBeVisible()
  })

  it("ne vérifie qu'un code complet puis rend la main à l'application", async () => {
    const { authClient, onAuthenticated } = mount()
    await enterEmail()
    fireEvent.change(screen.getByLabelText("Code à six chiffres"), { target: { value: "12" } })
    fireEvent.click(screen.getByRole("button", { name: "Me connecter" }))
    await waitFor(() => expect(screen.getByLabelText("Code à six chiffres")).toHaveAttribute("aria-invalid", "true"))
    expect(authClient.signIn.emailOtp).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Code à six chiffres"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Me connecter" }))
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce())
    expect(authClient.signIn.emailOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "awa@example.ga", otp: "123456" }))
  })

  it("un code refusé n'ouvre aucune session et permet la correction", async () => {
    const authClient = client()
    authClient.signIn.emailOtp.mockResolvedValueOnce({ data: null, error: { code: "INVALID_OTP" } } as unknown as Awaited<ReturnType<typeof authClient.signIn.emailOtp>>)
    const { onAuthenticated } = mount({ authClient })
    await enterEmail()
    fireEvent.change(screen.getByLabelText("Code à six chiffres"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Me connecter" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce code ne correspond pas")
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Code à six chiffres")).toBeEnabled()
  })

  it("ne présente pas une réponse sans token comme une session ouverte", async () => {
    const authClient = client()
    authClient.signIn.emailOtp.mockResolvedValueOnce({ data: {}, error: null } as unknown as Awaited<ReturnType<typeof authClient.signIn.emailOtp>>)
    const { onAuthenticated } = mount({ authClient })
    await enterEmail()
    fireEvent.change(screen.getByLabelText("Code à six chiffres"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Me connecter" }))
    expect(await screen.findByRole("alert")).toBeVisible()
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it("SMS utilise E.164 puis crée explicitement la session", async () => {
    const { authClient, onAuthenticated } = mount({ configuration: { ...configuration, emailOtp: false } })
    fireEvent.change(screen.getByLabelText("Numéro de téléphone"), { target: { value: "077123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    await waitFor(() => expect(screen.getByLabelText("Numéro de téléphone")).toHaveAttribute("aria-invalid", "true"))
    expect(authClient.phoneNumber.sendOtp).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Numéro de téléphone"), { target: { value: "+24177123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    await screen.findByLabelText("Code à six chiffres")
    fireEvent.change(screen.getByLabelText("Code à six chiffres"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Me connecter" }))
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce())
    expect(authClient.phoneNumber.verify).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "+24177123456", code: "123456", disableSession: false }))
  })

  it("changer de coordonnées oublie le code de l'ancien destinataire", async () => {
    const { authClient } = mount()
    await enterEmail()
    fireEvent.change(screen.getByLabelText("Code à six chiffres"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Changer mes coordonnées" }))
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "new@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    expect(await screen.findByLabelText("Code à six chiffres")).toHaveValue("")
    expect(authClient.signIn.emailOtp).not.toHaveBeenCalled()
  })

  it("le renvoi attend 60 secondes puis fait un seul nouvel envoi", async () => {
    vi.useFakeTimers()
    const { authClient } = mount()
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "awa@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole("button", { name: "Renvoyer dans 60 s" })).toBeDisabled()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    const resend = screen.getByRole("button", { name: "Renvoyer un code" })
    expect(resend).toBeEnabled()
    fireEvent.click(resend)
    fireEvent.click(resend)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("status")).toHaveTextContent("nouveau code a été envoyé")
  })

  it("l'indice local n'est jamais demandé hors développement déclaré", async () => {
    const renderLocalCode = vi.fn(() => <p>Local only</p>)
    mount({ renderLocalCode })
    await enterEmail()
    expect(renderLocalCode).not.toHaveBeenCalled()
  })

  it("le développement déclaré reçoit l'identifiant normalisé", async () => {
    const renderLocalCode = vi.fn(() => <p>Local only</p>)
    mount({ configuration: { ...configuration, localCodes: true }, renderLocalCode })
    await enterEmail()
    expect(renderLocalCode).toHaveBeenCalledWith("awa@example.ga")
  })
})

describe("identityErrorKey — codes publics seulement", () => {
  it.each([[{ code: "OTP_EXPIRED" }, "errors.expiredCode"], [{ code: "OTP_NOT_FOUND" }, "errors.expiredCode"], [{ status: 429 }, "errors.rateLimited"], [{ code: "TOO_MANY_ATTEMPTS" }, "errors.rateLimited"], [{ code: "otpDeliveryUnavailable" }, "errors.deliveryUnavailable"], [{ code: "INVALID_PHONE_NUMBER" }, "errors.invalidPhone"], [new TypeError("private transport details"), "errors.network"], [{ message: "private provider details" }, "errors.generic"]])("traduit le refus %j sans exposer son texte", (error, key) => { expect(identityErrorKey(error)).toBe(key) })
})

describe("EA-08 — durée du code publiée et délai d'un refus de débit", () => {
  /** Le refus `rateLimited` du moteur tel que le client Better Auth le rend : son corps, plus le statut. */
  const rateLimited = (retryAfterMs?: number) => ({ code: "rateLimited", message: "rateLimited", ...(retryAfterMs === undefined ? {} : { retryAfterMs }), status: 429, statusText: "Too Many Requests" })

  it("l'indice du code dit la durée publiée par le moteur, en minutes, au pluriel juste", async () => {
    const tenMinutes = mount({ configuration: { ...configuration, otpTtlSeconds: 600 } })
    await enterEmail()
    expect(screen.getByLabelText("Code à six chiffres")).toHaveAccessibleDescription("Le code est valable 10 minutes et ne peut être utilisé qu’une fois.")
    tenMinutes.unmount()
    const oneMinute = mount({ configuration: { ...configuration, otpTtlSeconds: 60 } })
    await enterEmail()
    expect(screen.getByLabelText("Code à six chiffres")).toHaveAccessibleDescription("Le code est valable 1 minute et ne peut être utilisé qu’une fois.")
    oneMinute.unmount()
    mount({ configuration: { ...configuration, otpTtlSeconds: 120 } }, "en")
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "awa@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Receive a code" }))
    expect(await screen.findByLabelText("Six-digit code")).toHaveAccessibleDescription("The code is valid for 2 minutes and can only be used once.")
  })

  it("un moteur qui ne publie pas la durée garde les cinq minutes d'aujourd'hui", async () => {
    mount()
    await enterEmail()
    expect(screen.getByLabelText("Code à six chiffres")).toHaveAccessibleDescription("Le code est valable 5 minutes et ne peut être utilisé qu’une fois.")
  })

  it("un envoi refusé par le seau dit quand réessayer, sans quitter les coordonnées", async () => {
    const authClient = client()
    authClient.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: null, error: rateLimited(100_000) } as unknown as Awaited<ReturnType<typeof authClient.emailOtp.sendVerificationOtp>>)
    mount({ authClient })
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "awa@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de tentatives. Réessayez dans 2 minutes.")
    expect(screen.queryByLabelText("Code à six chiffres")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Adresse e-mail")).toHaveValue("awa@example.ga")
  })

  it("une connexion refusée par le seau dit le délai en secondes sous la minute, en anglais aussi", async () => {
    const french = client()
    french.signIn.emailOtp.mockResolvedValueOnce({ data: null, error: rateLimited(8_200) } as unknown as Awaited<ReturnType<typeof french.signIn.emailOtp>>)
    const { onAuthenticated, unmount } = mount({ authClient: french })
    await enterEmail()
    fireEvent.change(screen.getByLabelText("Code à six chiffres"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Me connecter" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de tentatives. Réessayez dans 9 secondes.")
    expect(onAuthenticated).not.toHaveBeenCalled()
    unmount()
    const english = client()
    english.signIn.emailOtp.mockResolvedValueOnce({ data: null, error: rateLimited(60_000) } as unknown as Awaited<ReturnType<typeof english.signIn.emailOtp>>)
    mount({ authClient: english }, "en")
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "awa@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Receive a code" }))
    fireEvent.change(await screen.findByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 1 minute.")
  })

  it("un refus de débit sans délai lisible garde la phrase d'avant", async () => {
    const authClient = client()
    authClient.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: null, error: rateLimited() } as unknown as Awaited<ReturnType<typeof authClient.emailOtp.sendVerificationOtp>>)
    mount({ authClient })
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "awa@example.ga" } })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir un code" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de tentatives. Patientez avant de réessayer.")
  })

  it.each([
    [rateLimited(100_000), { key: "errors.rateLimitedMinutes", count: 2 }],
    [rateLimited(1_000), { key: "errors.rateLimitedSeconds", count: 1 }],
    [rateLimited(), { key: "errors.rateLimited" }],
    [{ code: "TOO_MANY_ATTEMPTS", retryAfterMs: 60_000 }, { key: "errors.rateLimited" }],
    [{ code: "INVALID_OTP", retryAfterMs: 60_000 }, { key: "errors.invalidCode" }],
    [new TypeError("rateLimited"), { key: "errors.network" }],
  ])("identityErrorMessage(%j) ne lit le délai que d'un refus de débit", (error, message) => {
    expect(identityErrorMessage(error)).toEqual(message)
  })
})
