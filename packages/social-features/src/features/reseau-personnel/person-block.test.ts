/** PF-01 — la copie de la confirmation d'un blocage, écrite une fois. */
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import { personBlockCopy } from "./person-block"
import { visibilityAction } from "./profile-visibility-copy"

const fixedT = (locale: "fr" | "en") =>
  createAppI18n({ locale, appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT(locale)
const t = fixedT("fr")

describe("personBlockCopy", () => {
  it("bloquer : la conséquence et la réversibilité sont celles du geste `bloquer`, puis où le lever", () => {
    const copy = personBlockCopy("block", "Awa NDONG", t)
    const action = visibilityAction("bloquer", t)
    expect(copy.title).toBe("Bloquer Awa NDONG ?")
    expect(copy.description).toBe(action.consequence)
    expect(copy.details).toEqual([action.reversibilite, t("reseau:personBlock.listHint")])
    expect(copy.confirm).toBe("Bloquer")
    expect(copy.done).toBe("Vous avez bloqué Awa NDONG.")
    expect(copy.failedKey).toBe("reseau:personBlock.blockFailed")
  })

  it("dit la décision D1 avant le geste : abonnements retirés, rien n'est rétabli au déblocage, aucune annonce", () => {
    const copy = personBlockCopy("block", "Awa", t)
    expect(copy.description).toContain("abonnement")
    expect(copy.description).toContain("silencieux")
    expect(copy.details.join(" ")).toContain("abonnements retirés")
  })

  it("sans nom (ou nom vide), dit « cette personne » — jamais un titre troué", () => {
    for (const name of [null, undefined, "", "   "]) {
      expect(personBlockCopy("block", name, t).title).toBe("Bloquer cette personne ?")
      expect(personBlockCopy("block", name, t).done).toBe("Blocage enregistré.")
      expect(personBlockCopy("unblock", name, t).title).toBe("Débloquer cette personne ?")
    }
  })

  it("débloquer : ni relation ni abonnement rétablis", () => {
    const copy = personBlockCopy("unblock", "@awa", t)
    expect(copy.title).toBe("Débloquer @awa ?")
    expect(copy.description).toBe(t("reseau:peoplePanel.blocks.confirmBody"))
    expect(copy.description).toContain("abonnement")
    expect(copy.details).toEqual([])
    expect(copy.confirm).toBe("Débloquer")
    expect(copy.done).toBe("Blocage retiré.")
    expect(copy.failedKey).toBe("reseau:personBlock.unblockFailed")
  })

  it("existe en anglais avec les mêmes gestes", () => {
    const en = fixedT("en")
    expect(personBlockCopy("block", "Awa", en).title).toBe("Block Awa?")
    expect(personBlockCopy("unblock", null, en).title).toBe("Unblock this person?")
    expect(personBlockCopy("block", "Awa", en).description).toBe(visibilityAction("bloquer", en).consequence)
  })
})
