import { describe, expect, it } from "vitest"

import { isMemberThemeId, LEGACY_MEMBER_THEME_IDS, MEMBER_THEME_IDS, memberThemeOf } from "./appearance"

describe("préférence de thème du compte", () => {
  it.each(MEMBER_THEME_IDS)("préserve le thème courant %s", (theme) => {
    expect(memberThemeOf(theme)).toBe(theme)
    expect(isMemberThemeId(theme)).toBe(true)
  })

  it.each(LEGACY_MEMBER_THEME_IDS)("projette explicitement l'ancien thème %s vers Gaboma", (theme) => {
    expect(memberThemeOf(theme)).toBe("gaboma")
    expect(isMemberThemeId(theme)).toBe(false)
  })

  it.each([undefined, null, "", "inconnu", "Gaboma", "antsia-sable", 0, {}])("ne confond pas une absence ou une valeur inconnue (%j) avec un ancien thème", (theme) => {
    expect(memberThemeOf(theme)).toBeUndefined()
  })
})
