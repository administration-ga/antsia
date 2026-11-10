import { relative } from "node:path"

/**
 * Progression hors TTY, exécutée par le processus principal de Vitest.
 * Le fanout de 5 000 abonnés exerce des scans mémoire quadratiques dans
 * convex-test : il peut occuper le worker plusieurs minutes sans vider ses
 * événements IPC. Cela ressemble à un blocage sans être un échec du test ni
 * une mesure des performances Convex en production. On rapporte uniquement
 * le fichier et le temps écoulé, jamais un cas courant ou un pourcentage.
 */
export default class ConvexTestProgressReporter {
  constructor({ intervalMs = 30_000 } = {}) {
    this.intervalMs = intervalMs
    this.activeModules = new Map()
    this.timer = undefined
  }

  onInit(context) {
    this.context = context
    this.enabled = !(context.logger.outputStream.isTTY ?? process.stdout.isTTY)
  }

  onTestModuleQueued(module) {
    if (!this.enabled) return
    const filename = relative(this.context.config.root, module.moduleId)
    this.activeModules.set(module.moduleId, { filename, startedAt: performance.now() })
    this.context.logger.log(`[convex] Début : ${filename}`)
    if (this.timer) return
    this.timer = setInterval(() => {
      for (const { filename, startedAt } of this.activeModules.values()) {
        this.context.logger.log(`[convex] En cours : ${filename} (${this.elapsed(startedAt)} s écoulées)`)
      }
    }, this.intervalMs)
    this.timer.unref()
  }

  onTestModuleEnd(module) {
    if (!this.enabled) return
    const active = this.activeModules.get(module.moduleId)
    if (active) {
      this.context.logger.log(`[convex] Fin : ${active.filename} (${module.state()}, ${this.elapsed(active.startedAt)} s)`)
      this.activeModules.delete(module.moduleId)
    }
    if (!this.activeModules.size) this.stopTimer()
  }

  onTestRunEnd(modules, unhandledErrors, reason) {
    this.stopTimer()
    this.activeModules.clear()
    if (!this.enabled) return
    this.context.logger.log(`[convex] Bilan : ${modules.length} fichier(s), ${unhandledErrors.length} erreur(s) non interceptée(s), état : ${reason}.`)
  }

  elapsed(startedAt) {
    return Math.floor((performance.now() - startedAt) / 1000)
  }

  stopTimer() {
    clearInterval(this.timer)
    this.timer = undefined
  }
}
