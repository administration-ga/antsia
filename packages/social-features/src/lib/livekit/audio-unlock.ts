// Dupliqué de socle/packages/livekit/src/audio-unlock.ts @ ad2e7fdc2 — adaptations : déverrouillage sur click/keydown de confiance avec activation navigateur, pas sur pointerdown tactile ; le paquet `livekit` du socle devient le dossier `lib/livekit` du paquet des surfaces.
"use client";

/**
 * audio-unlock — UN AudioContext partagé pour toute la fenêtre, déverrouillé
 * au premier geste utilisateur.
 *
 * Le défaut corrigé (S1 du lot fiabilisation) : chaque sonnerie créait SON
 * `AudioContext` au moment de sonner. Sans geste utilisateur récent dans
 * l'onglet, il naît `suspended` et `resume()` est refusé — la sonnerie était
 * MUETTE toute la journée pour un onglet ouvert le matin et jamais cliqué,
 * sans le moindre indice à l'écran.
 *
 * Trois pièces :
 *  - `getSharedAudioContext()` — le contexte UNIQUE, créé paresseusement,
 *    JAMAIS fermé (le fermer au changement de profil coupait le son et
 *    consommait le quota navigateur, ~6 contextes par page — défaut S7) ;
 *  - `installAudioUnlock()` — écouteurs capture `click`/`keydown` qui
 *    tentent `resume()` : le premier clic de la journée déverrouille l'audio
 *    pour toutes les sonneries à venir. Les écouteurs RESTENT posés : iOS
 *    peut re-suspendre un contexte après une interruption ;
 *  - `useRingtoneAudioBlocked()` — « l'audio est-il bloqué ? », pour que la
 *    bannière d'appel entrant puisse DIRE « cliquez pour activer le son » au
 *    lieu de sonner en silence.
 *
 * Testable en environnement node : la fabrique de contexte est injectable
 * (`__resetSharedAudioForTests`) et la cible des écouteurs est un paramètre.
 */

import { useSyncExternalStore } from "react";

/** Ce que la cible des écouteurs de déverrouillage doit savoir faire. */
export type AudioUnlockTarget = Pick<
	Window,
	"addEventListener" | "removeEventListener"
>;

let sharedContext: AudioContext | null = null;
let factoryForTests: (() => AudioContext) | null = null;
const stateListeners = new Set<() => void>();

function notifyStateListeners(): void {
	for (const listener of stateListeners) listener();
}

function defaultFactory(): (() => AudioContext) | null {
	if (typeof window === "undefined") return null;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!Ctor) return null;
	return () => new Ctor();
}

/**
 * Le contexte audio PARTAGÉ — créé une seule fois, jamais fermé.
 * `null` hors navigateur (SSR, environnement de test sans fabrique).
 */
export function getSharedAudioContext(): AudioContext | null {
	if (sharedContext !== null) return sharedContext;
	const create = factoryForTests ?? defaultFactory();
	if (!create) return null;
	sharedContext = create();
	// `statechange` propage suspended → running (et inversement, iOS) vers
	// tous les abonnés de `useRingtoneAudioBlocked`.
	sharedContext.addEventListener?.("statechange", notifyStateListeners);
	notifyStateListeners();
	return sharedContext;
}

/** Tente la reprise — no-op si l'audio tourne déjà ou n'existe pas. */
export function resumeSharedAudioContext(): void {
	const context = getSharedAudioContext();
	if (context && context.state === "suspended") {
		void context.resume().catch(() => {
			// Refus d'autoplay : le prochain geste retentera.
		});
	}
}

const UNLOCK_EVENTS = ["click", "keydown"] as const;

let unlockInstallCount = 0;
let unlockTarget: AudioUnlockTarget | null = null;

function onUnlockGesture(event: Event): void {
	// Le pointerdown tactile précède l'activation utilisateur de Chrome.
	// Un événement synthétique ou une touche sans activation ne doit créer
	// ni reprendre de contexte : catch() ne masque pas l'avertissement natif.
	if (!event.isTrusted) return;
	if (typeof navigator !== "undefined" && navigator.userActivation?.isActive === false) return;
	resumeSharedAudioContext();
}

/**
 * Pose les écouteurs de déverrouillage (une seule fois, comptés par
 * référence). Rend un désinstallateur idempotent — à appeler au démontage de
 * l'hôte qui les a posés.
 */
export function installAudioUnlock(target?: AudioUnlockTarget): () => void {
	const resolved =
		target ?? (typeof window === "undefined" ? null : (window as Window));
	if (!resolved) return () => {};
	if (unlockInstallCount === 0) {
		unlockTarget = resolved;
		for (const eventName of UNLOCK_EVENTS) {
			resolved.addEventListener(eventName, onUnlockGesture, true);
		}
	}
	unlockInstallCount += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		unlockInstallCount -= 1;
		if (unlockInstallCount === 0 && unlockTarget) {
			for (const eventName of UNLOCK_EVENTS) {
				unlockTarget.removeEventListener(eventName, onUnlockGesture, true);
			}
			unlockTarget = null;
		}
	};
}

/**
 * L'audio des sonneries est-il bloqué ? Vrai seulement quand un contexte
 * EXISTE et n'est pas `running` : avant la première sonnerie, il n'y a rien à
 * signaler (et rien à savoir).
 */
export function isRingtoneAudioBlocked(): boolean {
	return sharedContext !== null && sharedContext.state !== "running";
}

export function subscribeAudioBlocked(callback: () => void): () => void {
	stateListeners.add(callback);
	return () => {
		stateListeners.delete(callback);
	};
}

/** Version hook — pour l'indicateur « cliquez pour activer le son ». */
export function useRingtoneAudioBlocked(): boolean {
	return useSyncExternalStore(
		subscribeAudioBlocked,
		isRingtoneAudioBlocked,
		() => false,
	);
}

/**
 * RÉSERVÉ AUX TESTS — repart d'un module vierge, avec une fabrique injectée
 * (ou aucune : `getSharedAudioContext()` rendra alors `null`).
 */
export function __resetSharedAudioForTests(
	factory: (() => AudioContext) | null = null,
): void {
	sharedContext = null;
	factoryForTests = factory;
	unlockInstallCount = 0;
	unlockTarget = null;
	notifyStateListeners();
}
