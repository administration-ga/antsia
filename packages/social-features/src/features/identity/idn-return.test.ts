import { describe, expect, it } from "vitest"

import fr from "../../i18n/locales/fr/identity.json"
import en from "../../i18n/locales/en/identity.json"
import { IDN_RETURN_REFUSALS, idnReturnMessageKey, idnReturnRefusal, withoutIdnReturnParams } from "./idn-return"

describe("retour d'un échec d'IDN à la porte — refus fermé (issue 122, EA-02)", () => {
  it("les refus et abandons d'OAuth 2.0 et d'OpenID Connect se disent « refusé »", () => {
    for (const code of ["access_denied", "login_required", "consent_required", "interaction_required", "account_selection_required"]) {
      expect(idnReturnRefusal(code), code).toBe("refused")
    }
  })

  it("l'indisponibilité, le compte à relier et tout le reste ont leur phrase ; rien sans paramètre", () => {
    expect(idnReturnRefusal("temporarily_unavailable")).toBe("unavailable")
    expect(idnReturnRefusal("idnUnavailable")).toBe("unavailable")
    expect(idnReturnRefusal("account_not_linked")).toBe("accountExists")
    for (const raw of ["server_error", "invalid_request", "ACCESS_DENIED", "access_denied ", "<script>alert(1)</script>", "a".repeat(5_000), ["access_denied"], 42]) {
      expect(idnReturnRefusal(raw)).toBe("failed")
    }
    for (const raw of [undefined, null, ""]) expect(idnReturnRefusal(raw)).toBeNull()
  })

  it("chaque refus a sa phrase en français et en anglais : la valeur reçue n'est jamais affichée", () => {
    for (const refusal of IDN_RETURN_REFUSALS) {
      const key = idnReturnMessageKey(refusal).split(".")[1] as keyof typeof fr.idnReturn
      expect(fr.idnReturn[key]).toBeTruthy()
      expect(en.idnReturn[key]).toBeTruthy()
    }
  })

  it("l'adresse affichée perd les seuls paramètres du retour", () => {
    expect(withoutIdnReturnParams("https://antsia.example/entrer?error=access_denied&error_description=Detail&inscription=1#haut")).toBe("/entrer?inscription=1#haut")
    expect(withoutIdnReturnParams("https://antsia.example/demo/entrer?error=x&error_uri=https%3A%2F%2Fidn.example")).toBe("/demo/entrer")
    expect(withoutIdnReturnParams("https://antsia.example/entrer?inscription=1")).toBeNull()
  })
})
