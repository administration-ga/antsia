/**
 * Le thème entre l'appareil et le COMPTE, en session (ADR-0026).
 *
 * - Le compte fait foi : sa valeur, dès qu'elle est connue puis à chaque
 *   changement (choix fait sur un autre appareil), s'applique à l'appareil, qui la
 *   garde en cache pour le script d'amorçage du prochain chargement.
 * - Un choix du membre s'applique tout de suite, puis s'enregistre. Un seul
 *   enregistrement à la fois : les choix faits pendant qu'il part se résument au
 *   dernier, envoyé ensuite — parcourir les thèmes n'écrit pas chaque clic.
 * - Tant que le dernier choix n'est pas confirmé, une valeur intermédiaire du
 *   compte (l'écho d'un choix déjà dépassé) ne le défait pas. Une fois son
 *   enregistrement accepté, le changement suivant du compte fait de nouveau foi :
 *   il ne peut être que cet écho ou un choix plus récent fait ailleurs.
 * - Un enregistrement refusé (débit, validation) rend le thème du compte s'il en a
 *   un — sinon le choix reste celui de l'appareil — et le signale.
 */
export interface ThemeAccountSyncOptions<Theme extends string> {
  apply: (theme: Theme) => void
  save: (theme: Theme) => Promise<unknown>
  onSaveFailed: (error: unknown) => void
}

export interface ThemeAccountSync<Theme extends string> {
  /** Le compte rend sa valeur : absente tant qu'aucun thème n'y est enregistré. */
  accountChanged: (theme: Theme | undefined) => void
  /** Le membre choisit un thème. */
  choose: (theme: Theme) => void
  /** La session ou le composant se termine : ferme les réponses et choix en attente. */
  dispose: () => void
}

export function createThemeAccountSync<Theme extends string>({ apply, save, onSaveFailed }: ThemeAccountSyncOptions<Theme>): ThemeAccountSync<Theme> {
  let account: Theme | undefined
  /** Le dernier choix du membre que le compte n'a pas encore confirmé. */
  let pending: Theme | null = null
  /** Un enregistrement est en cours. */
  let sending = false
  /** L'enregistrement de `pending` est accepté : le prochain changement du compte fait foi. */
  let accepted = false
  let active = true

  const send = (theme: Theme) => {
    sending = true
    accepted = false
    // Une erreur levée avant toute promesse suit le même chemin qu'un refus du serveur.
    Promise.resolve().then(() => active ? save(theme) : undefined).then(
      () => settle(theme, false, undefined),
      (error: unknown) => settle(theme, true, error),
    )
  }

  const settle = (theme: Theme, failed: boolean, error: unknown) => {
    if (!active) return
    sending = false
    // Un choix plus récent attendait : c'est lui qui part, ce résultat est dépassé.
    if (pending !== null && pending !== theme) return send(pending)
    if (!failed) {
      if (pending === null || account === theme) pending = null
      else accepted = true
      return
    }
    pending = null
    accepted = false
    if (account !== undefined) apply(account)
    onSaveFailed(error)
  }

  return {
    accountChanged(theme) {
      if (!active) return
      account = theme
      if (theme === undefined) return
      if (pending !== null) {
        if (theme !== pending && !accepted) return
        pending = null
        accepted = false
      }
      apply(theme)
    },
    choose(theme) {
      if (!active) return
      apply(theme)
      pending = theme
      accepted = false
      if (!sending) send(theme)
    },
    dispose() {
      active = false
      pending = null
    },
  }
}
