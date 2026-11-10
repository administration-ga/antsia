// Dupliqué de socle/packages/agent-features/src/features/iappel/audio-unlock.test.ts @ ad2e7fdc2 — adaptations : test placé à côté de sa source (`lib/livekit/`, ex-paquet `livekit` du socle), imports relatifs au lieu de `@workspace/livekit/*`.
/**
 * La chaîne du DÉVERROUILLAGE AUDIO (S1/S7) et le bip d'attente (S6) —
 * testés ici, en environnement node, via la fabrique injectable du module
 * partagé `./audio-unlock` (précédent d'import :
 * `ringing-signal.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	__resetSharedAudioForTests,
	getSharedAudioContext,
	installAudioUnlock,
	isRingtoneAudioBlocked,
	subscribeAudioBlocked,
	type AudioUnlockTarget,
} from "./audio-unlock"
import { shouldReplayWaitingBeep } from "./use-waiting-beep"

/** Un AudioContext minimal : état, resume(), statechange. */
class FakeAudioContext {
	state: "suspended" | "running" | "closed" = "suspended"
	resumeCalls = 0
	private listeners = new Set<() => void>()

	addEventListener(_type: string, listener: () => void) {
		this.listeners.add(listener)
	}
	removeEventListener(_type: string, listener: () => void) {
		this.listeners.delete(listener)
	}
	async resume() {
		this.resumeCalls += 1
		this.state = "running"
		for (const listener of this.listeners) listener()
	}
}

/** Une cible d'écouteurs façon window, pilotable à la main. */
class FakeTarget implements AudioUnlockTarget {
	private handlers = new Map<string, Set<(event: Event) => void>>()

	addEventListener(type: string, listener: unknown) {
		const set = this.handlers.get(type) ?? new Set()
		set.add(listener as (event: Event) => void)
		this.handlers.set(type, set)
	}
	removeEventListener(type: string, listener: unknown) {
		this.handlers.get(type)?.delete(listener as (event: Event) => void)
	}
	count(type: string): number {
		return this.handlers.get(type)?.size ?? 0
	}
	fire(type: string, isTrusted = true) {
		for (const listener of this.handlers.get(type) ?? []) {
			listener({ isTrusted } as Event)
		}
	}
}

let created: FakeAudioContext[] = []

beforeEach(() => {
	created = []
	__resetSharedAudioForTests(() => {
		const context = new FakeAudioContext()
		created.push(context)
		return context as unknown as AudioContext
	})
})

afterEach(() => {
	__resetSharedAudioForTests(null)
	vi.unstubAllGlobals()
})

describe("getSharedAudioContext — un seul contexte, jamais fermé", () => {
	it("crée UNE fois et rend toujours la même instance", () => {
		const first = getSharedAudioContext()
		const second = getSharedAudioContext()
		expect(first).toBe(second)
		expect(created).toHaveLength(1)
	})

	it("sans fabrique (node nu), rend null sans lever", () => {
		__resetSharedAudioForTests(null)
		expect(getSharedAudioContext()).toBeNull()
	})
})

describe("isRingtoneAudioBlocked — dire le blocage, jamais l'inventer", () => {
	it("rien à signaler tant qu'aucun contexte n'existe", () => {
		expect(isRingtoneAudioBlocked()).toBe(false)
	})

	it("suspended ⇒ bloqué ; running ⇒ débloqué, abonnés prévenus", async () => {
		let notified = 0
		const unsubscribe = subscribeAudioBlocked(() => {
			notified += 1
		})
		const context = getSharedAudioContext()
		expect(isRingtoneAudioBlocked()).toBe(true)
		await context?.resume()
		expect(isRingtoneAudioBlocked()).toBe(false)
		expect(notified).toBeGreaterThan(0)
		unsubscribe()
	})
})

describe("installAudioUnlock — le premier geste arme l'audio", () => {
	it("attend click + keydown, sans créer de contexte pendant pointerdown", () => {
		const target = new FakeTarget()
		const uninstall = installAudioUnlock(target)
		expect(target.count("click")).toBe(1)
		expect(target.count("keydown")).toBe(1)

		expect(target.count("pointerdown")).toBe(0)
		target.fire("pointerdown")
		expect(created).toHaveLength(0)
		target.fire("click")
		expect(created[0]?.resumeCalls).toBeGreaterThan(0)
		expect(created[0]?.state).toBe("running")
		uninstall()
	})

	it("ignore les événements synthétiques, sans créer de contexte", () => {
		const target = new FakeTarget()
		const uninstall = installAudioUnlock(target)
		target.fire("click", false)
		target.fire("keydown", false)
		expect(created).toHaveLength(0)
		uninstall()
	})

	it("attend l'activation reconnue par le navigateur avant création et reprise", () => {
		const activation = { isActive: false }
		vi.stubGlobal("navigator", { userActivation: activation })
		const target = new FakeTarget()
		const uninstall = installAudioUnlock(target)
		target.fire("click")
		expect(created).toHaveLength(0)
		activation.isActive = true
		target.fire("keydown")
		expect(created).toHaveLength(1)
		expect(created[0]?.resumeCalls).toBe(1)
		created[0]!.state = "suspended"
		activation.isActive = false
		target.fire("keydown")
		expect(created[0]?.resumeCalls).toBe(1)
		activation.isActive = true
		target.fire("click")
		expect(created[0]?.resumeCalls).toBe(2)
		uninstall()
	})

	it("compté par référence : le dernier désinstallateur retire les écouteurs", () => {
		const target = new FakeTarget()
		const first = installAudioUnlock(target)
		const second = installAudioUnlock(target)
		first()
		expect(target.count("click")).toBe(1)
		second()
		expect(target.count("click")).toBe(0)
	})

	it("désinstallateur idempotent — le rappeler ne décompte pas deux fois", () => {
		const target = new FakeTarget()
		const first = installAudioUnlock(target)
		first()
		first()
		const again = installAudioUnlock(target)
		expect(target.count("click")).toBe(1)
		again()
	})
})

describe("shouldReplayWaitingBeep — un bip par IDENTITÉ d'appel, jamais plus", () => {
	it("front montant : null → id joue", () => {
		expect(shouldReplayWaitingBeep(null, "a")).toBe(true)
	})
	it("re-render : même id ne rejoue pas", () => {
		expect(shouldReplayWaitingBeep("a", "a")).toBe(false)
	})
	it("changement d'appel en attente : rejoue", () => {
		expect(shouldReplayWaitingBeep("a", "b")).toBe(true)
	})
	it("extinction : id → null ne joue pas", () => {
		expect(shouldReplayWaitingBeep("a", null)).toBe(false)
	})
})
