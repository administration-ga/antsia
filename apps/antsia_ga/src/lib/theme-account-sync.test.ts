// ADR-0026 : le thème du compte fait foi en session ; le choix du membre s'applique tout de suite, s'enregistre une fois, et ne clignote pas.
import { describe, expect, it, vi } from "vitest"
import { memberThemeOf } from "@antsia/social-contracts/appearance"

import { createThemeAccountSync } from "./theme-account-sync"

type Theme = "antsia" | "foret" | "lagon" | "encre"

/** Enregistrements contrôlés à la main : chacun se résout ou se rejette quand le test le décide. */
function harness() {
  const applied: Theme[] = []
  const saves: { theme: Theme; resolve: () => void; reject: (error: unknown) => void }[] = []
  const failures: unknown[] = []
  const sync = createThemeAccountSync<Theme>({
    apply: (theme) => applied.push(theme),
    save: (theme) => new Promise<void>((resolve, reject) => saves.push({ theme, resolve: () => resolve(), reject })),
    onSaveFailed: (error) => failures.push(error),
  })
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  return { sync, applied, saves, failures, flush, shown: () => applied.at(-1) }
}

describe("thème du compte et de l'appareil", () => {
  it("un ancien thème du compte remplace explicitement Sable mémorisé sur l'appareil par Gaboma", () => {
    let shown = "sable"
    const save = vi.fn()
    const sync = createThemeAccountSync<string>({ apply: (theme) => { shown = theme }, save, onSaveFailed: vi.fn() })
    sync.accountChanged(memberThemeOf("indigo"))
    expect(shown).toBe("gaboma")
    expect(save).not.toHaveBeenCalled()
  })

  it("la valeur du compte s'applique dès qu'elle est connue et à chaque choix fait ailleurs", () => {
    const { sync, applied } = harness()
    sync.accountChanged(undefined)
    expect(applied).toEqual([])
    sync.accountChanged("foret")
    sync.accountChanged("lagon")
    expect(applied).toEqual(["foret", "lagon"])
  })

  it("un compte sans thème laisse celui de l'appareil", () => {
    const { sync, applied, saves } = harness()
    sync.accountChanged(undefined)
    expect(applied).toEqual([])
    expect(saves).toEqual([])
  })

  it("un choix s'applique avant d'être enregistré, puis l'écho du compte le confirme sans le rejouer", async () => {
    const { sync, applied, saves, flush, shown } = harness()
    sync.accountChanged("antsia")
    sync.choose("foret")
    expect(shown()).toBe("foret")
    await flush()
    expect(saves.map((save) => save.theme)).toEqual(["foret"])
    saves[0]?.resolve()
    await flush()
    sync.accountChanged("foret")
    expect(applied).toEqual(["antsia", "foret", "foret"])
    expect(shown()).toBe("foret")
  })

  it("parcourir les thèmes pendant un enregistrement n'écrit ensuite que le dernier choix", async () => {
    const { sync, saves, flush, shown } = harness()
    sync.accountChanged("antsia")
    sync.choose("foret")
    await flush()
    sync.choose("lagon")
    sync.choose("encre")
    expect(shown()).toBe("encre")
    saves[0]?.resolve()
    await flush()
    expect(saves.map((save) => save.theme)).toEqual(["foret", "encre"])
  })

  it("l'écho d'un choix dépassé ne défait pas le dernier choix", async () => {
    const { sync, saves, flush, shown } = harness()
    sync.accountChanged("antsia")
    sync.choose("foret")
    await flush()
    sync.choose("lagon")
    sync.accountChanged("foret")
    expect(shown()).toBe("lagon")
    saves[0]?.resolve()
    await flush()
    sync.accountChanged("foret")
    expect(shown()).toBe("lagon")
    saves[1]?.resolve()
    await flush()
    sync.accountChanged("lagon")
    expect(shown()).toBe("lagon")
  })

  it("une fois le choix enregistré, un choix plus récent fait sur un autre appareil fait de nouveau foi", async () => {
    const { sync, saves, flush, shown } = harness()
    sync.accountChanged("antsia")
    sync.choose("foret")
    await flush()
    saves[0]?.resolve()
    await flush()
    // L'écho de « foret » et le choix d'un autre appareil arrivent ensemble.
    sync.accountChanged("lagon")
    expect(shown()).toBe("lagon")
    sync.accountChanged("encre")
    expect(shown()).toBe("encre")
  })

  it("choisir le thème déjà enregistré ne laisse aucun choix en attente", async () => {
    const { sync, saves, flush, shown } = harness()
    sync.accountChanged("foret")
    sync.choose("foret")
    await flush()
    saves[0]?.resolve()
    await flush()
    sync.accountChanged("lagon")
    expect(shown()).toBe("lagon")
  })

  it("un enregistrement refusé rend le thème du compte et le signale", async () => {
    const { sync, saves, failures, flush, shown } = harness()
    sync.accountChanged("antsia")
    sync.choose("foret")
    await flush()
    const refusal = { data: { code: "rateLimited" } }
    saves[0]?.reject(refusal)
    await flush()
    expect(shown()).toBe("antsia")
    expect(failures).toEqual([refusal])
    sync.accountChanged("lagon")
    expect(shown()).toBe("lagon")
  })

  it("sans thème sur le compte, un refus laisse le choix sur l'appareil, signalé", async () => {
    const { sync, saves, failures, flush, shown } = harness()
    sync.accountChanged(undefined)
    sync.choose("foret")
    await flush()
    saves[0]?.reject(new Error("hors ligne"))
    await flush()
    expect(shown()).toBe("foret")
    expect(failures).toHaveLength(1)
  })

  it("le refus d'un choix dépassé est ignoré : le dernier choix part quand même", async () => {
    const { sync, saves, failures, flush, shown } = harness()
    sync.accountChanged("antsia")
    sync.choose("foret")
    await flush()
    sync.choose("lagon")
    saves[0]?.reject(new Error("dépassé"))
    await flush()
    expect(failures).toEqual([])
    expect(saves.map((save) => save.theme)).toEqual(["foret", "lagon"])
    expect(shown()).toBe("lagon")
  })

  it("une erreur levée avant toute promesse suit le chemin d'un refus", async () => {
    const applied: Theme[] = []
    const onSaveFailed = vi.fn()
    const sync = createThemeAccountSync<Theme>({ apply: (theme) => applied.push(theme), save: () => { throw new Error("client absent") }, onSaveFailed })
    sync.accountChanged("antsia")
    sync.choose("encre")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSaveFailed).toHaveBeenCalledTimes(1)
    expect(applied.at(-1)).toBe("antsia")
  })

  it("fermer la session avant l'envoi empêche toute écriture différée ou nouveau choix", async () => {
    const { sync, saves, applied, flush } = harness()
    sync.accountChanged("antsia")
    sync.choose("foret")
    sync.dispose()
    sync.choose("lagon")
    sync.accountChanged("encre")
    await flush()
    expect(saves).toEqual([])
    expect(applied).toEqual(["antsia", "foret"])
  })

  it.each([false, true])("une réponse après démontage (refus : %s) ne relance pas le choix en attente ni le rendu", async (failed) => {
    const { sync, saves, failures, applied, flush } = harness()
    sync.accountChanged("antsia")
    sync.choose("foret")
    await flush()
    sync.choose("lagon")
    sync.dispose()
    if (failed) saves[0]?.reject(new Error("ancienne session"))
    else saves[0]?.resolve()
    await flush()
    expect(saves.map((save) => save.theme)).toEqual(["foret"])
    expect(applied).toEqual(["antsia", "foret", "lagon"])
    expect(failures).toEqual([])
  })
})
