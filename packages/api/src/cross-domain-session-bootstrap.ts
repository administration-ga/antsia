// Dupliqué de socle/packages/api/src/cross-domain-session-bootstrap.ts @ ad2e7fdc2 — adaptations : exemption de lint justifiée en ligne (`prefer-const`) ; absence de session ou OTT rejeté = purge ; adoption prouvée et renouvellement en Bearer explicite, sans repli sur un cookie résiduel.
type FetchResult = {
	data?: unknown;
	error?: unknown;
};

type SessionAtom = {
	get?: () => Record<string, unknown>;
	value?: Record<string, unknown>;
	set?: (value: Record<string, unknown>) => void;
};

type FetchOptions = {
	throw?: boolean;
	signal?: AbortSignal;
	headers?: Record<string, string>;
};

export type RefreshableCrossDomainAuthClient = {
	getCookie?: () => string;
	getSessionData?: () => Record<string, unknown> | null;
	getSession: (options?: { fetchOptions?: FetchOptions }) => Promise<unknown>;
	convex: {
		token: (options?: { fetchOptions?: FetchOptions }) => Promise<unknown>;
	};
	/**
	 * Plugin `crossDomain` — vérification du one-time-token de handoff.
	 * Optionnel : un hôte peut fournir un client sans le plugin, et le test
	 * d'existence est alors la seule vérité (même discipline que
	 * `use-sso-navigate.ts`).
	 */
	crossDomain?: {
		oneTimeToken?: {
			verify?: (args: {
				token: string;
				fetchOptions?: FetchOptions;
			}) => Promise<unknown>;
		};
	};
	/** Notifie `useSession()` qu'un nouveau jeton de session a été posé. */
	updateSession?: () => void;
	$store?: {
		atoms?: {
			session?: SessionAtom;
		};
	};
};

/** Clés du plugin `crossDomain` dans le localStorage (par ORIGINE). */
export const CROSS_DOMAIN_COOKIE_KEY = "better-auth_cookie";
export const CROSS_DOMAIN_SESSION_DATA_KEY = "better-auth_session_data";

export type CrossDomainStorage = Pick<Storage, "getItem" | "setItem">;

export type SessionBootstrapResult =
	| { kind: "ready"; token: string }
	| { kind: "signed_out"; token: null };

export type SessionBootstrapOptions = {
	attempts?: number;
	timeoutMs?: number;
	retryDelayMs?: number;
	signal?: AbortSignal;
	/**
	 * One-time-token prélevé de l'URL par l'appelant. Consommé AVANT toute
	 * lecture du résidu de l'origine — c'est tout l'objet du correctif.
	 */
	oneTimeToken?: string | null;
	/** Défaut : le `localStorage` global. Injectable pour les tests. */
	storage?: CrossDomainStorage;
};

function dataOf(value: unknown): unknown {
	if (value && typeof value === "object" && "data" in value) {
		return (value as FetchResult).data;
	}
	return value;
}

function errorOf(value: unknown): unknown {
	if (value && typeof value === "object" && "error" in value) {
		return (value as FetchResult).error;
	}
	return null;
}

function statusOf(value: unknown): number | null {
	if (!value || typeof value !== "object" || !("status" in value)) return null;
	const status = (value as { status?: unknown }).status;
	return typeof status === "number" ? status : null;
}

function sessionOf(value: unknown): Record<string, unknown> | null {
	const data = dataOf(value);
	if (!data || typeof data !== "object" || !("session" in data)) return null;
	const session = (data as { session?: unknown }).session;
	return session && typeof session === "object"
		? (data as Record<string, unknown>)
		: null;
}

function tokenOf(value: unknown): string | null {
	const data = dataOf(value);
	if (!data || typeof data !== "object" || !("token" in data)) return null;
	const token = (data as { token?: unknown }).token;
	return typeof token === "string" && token.length > 0 ? token : null;
}

function primeSessionAtom(
	authClient: RefreshableCrossDomainAuthClient,
	sessionData: Record<string, unknown>,
): void {
	const atom = authClient.$store?.atoms?.session;
	if (!atom?.set) return;
	const current = atom.get?.() ?? atom.value ?? {};
	atom.set({
		...current,
		data: sessionData,
		error: null,
		isPending: false,
		isRefetching: false,
	});
}

async function runWithTimeout<T>(
	run: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
	outerSignal?: AbortSignal,
): Promise<T> {
	if (outerSignal?.aborted) {
		throw new DOMException("Aborted", "AbortError");
	}
	const controller = new AbortController();
	let rejectBoundary: (reason: unknown) => void = () => undefined;
	const boundary = new Promise<never>((_resolve, reject) => {
		rejectBoundary = reject;
	});
	const abort = () => {
		controller.abort();
		rejectBoundary(new DOMException("Aborted", "AbortError"));
	};
	outerSignal?.addEventListener("abort", abort, { once: true });
	const timeout = setTimeout(() => {
		controller.abort();
		rejectBoundary(new DOMException("Timed out", "TimeoutError"));
	}, timeoutMs);
	try {
		return await Promise.race([run(controller.signal), boundary]);
	} finally {
		clearTimeout(timeout);
		outerSignal?.removeEventListener("abort", abort);
	}
}

async function pause(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
	await new Promise<void>((resolve, reject) => {
		// eslint-disable-next-line prefer-const -- assigné APRÈS la déclaration de `abort`, qui le lit : il ne peut pas être `const`.
		let timeout: ReturnType<typeof setTimeout>;
		const cleanup = () => signal?.removeEventListener("abort", abort);
		const abort = () => {
			clearTimeout(timeout);
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};
		timeout = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		signal?.addEventListener("abort", abort, { once: true });
	});
}

// ═══════════════════════════════════════════════════════════════════════════
// Le one-time-token de handoff — prélèvement, adoption, purge
// ═══════════════════════════════════════════════════════════════════════════

export type OneTimeTokenTake = { token: string | null; href: string };

/**
 * PURE — prélève `?ott=` d'une URL et rend l'URL débarrassée du paramètre.
 *
 * L'appelant pose l'URL nettoyée dans la barre d'adresse AVANT le montage :
 * l'effet amont de `ConvexBetterAuthProvider` ne doit plus rien y trouver (cf.
 * `stable-convex-better-auth-provider.tsx`).
 */
export function takeOneTimeToken(href: string): OneTimeTokenTake {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return { token: null, href };
	}
	const token = url.searchParams.get("ott");
	if (!token) return { token: null, href };
	url.searchParams.delete("ott");
	return { token, href: url.toString() };
}

/**
 * Efface le matériau de session de CETTE origine.
 *
 * Reproduit exactement ce que le plugin fait sur `/sign-out`
 * (`@convex-dev/better-auth/dist/plugins/cross-domain/client.js:196-205`) :
 * les deux clés à `"{}"` et l'atome de session à `null`. On ne peut pas
 * appeler `signOut()` à la place — il révoquerait côté serveur une session qui
 * ne nous appartient pas.
 */
export function clearCrossDomainSessionResidue(
	storage: CrossDomainStorage | undefined,
	authClient?: Pick<RefreshableCrossDomainAuthClient, "$store">,
): void {
	try {
		storage?.setItem(CROSS_DOMAIN_COOKIE_KEY, "{}");
		storage?.setItem(CROSS_DOMAIN_SESSION_DATA_KEY, "{}");
	} catch {
		// Mode privé, quota : ne jamais faire échouer un nettoyage de sécurité.
	}
	authClient?.$store?.atoms?.session?.set?.({
		data: null,
		error: null,
		isPending: false,
	});
}

export type OneTimeTokenOutcome =
	| { kind: "absent" }
	| { kind: "adopted"; sessionToken: string; sessionData: Record<string, unknown> }
	| { kind: "rejected"; reason: "unsupported" | "verify_failed" };

/**
 * Adopte la session désignée par le one-time-token, AVANT que quoi que ce soit
 * ne lise le résidu de l'origine.
 *
 * ⚠️ C'est le cœur du correctif du 2026-08-05. L'amont consommait le `?ott=`
 * dans un `useEffect`, donc APRÈS avoir déjà mis en cache le JWT de la session
 * résiduelle — et `fetchAccessToken` ne repart jamais le chercher
 * (`forceRefreshToken` vaut toujours `false` au `setAuth`, cf.
 * `convex/dist/esm/browser/sync/authentication_manager.js:54-55`). L'interface
 * affichait donc la bonne personne pendant que toutes les requêtes Convex
 * s'exécutaient sous l'identité précédente, jusqu'à 30 minutes.
 *
 * Un `?ott=` est une AFFIRMATION : « la personne qui arrive est celle du
 * handoff ». Si on ne peut pas la prouver, on ne sert jamais le résidu à sa
 * place — on purge, quitte à faire re-signer.
 */
export async function adoptOneTimeTokenSession(
	authClient: RefreshableCrossDomainAuthClient,
	token: string | null,
	options: { signal?: AbortSignal; storage?: CrossDomainStorage; timeoutMs?: number } = {},
): Promise<OneTimeTokenOutcome> {
	if (!token) return { kind: "absent" };

	const verify = authClient.crossDomain?.oneTimeToken?.verify;
	if (typeof verify !== "function") {
		clearCrossDomainSessionResidue(options.storage, authClient);
		return { kind: "rejected", reason: "unsupported" };
	}

	try {
		const adopted = await runWithTimeout(async (signal) => {
			const result = await verify({ token, fetchOptions: { throw: false, signal } });
			const sessionToken = errorOf(result) ? null : sessionTokenOf(result);
			if (!sessionToken || signal.aborted) throw new Error("OTT non vérifié");

			// Le Bearer affirme la personne du handoff, même si un cookie HTTP
			// d'une autre personne est encore partagé entre les ports localhost.
			const sessionResult = await authClient.getSession({
				fetchOptions: {
					throw: false,
					signal,
					headers: { Authorization: `Bearer ${sessionToken}` },
				},
			});
			const sessionData = errorOf(sessionResult) ? null : sessionOf(sessionResult);
			if (!sessionData || !validSessionIdentity(sessionData) || !sessionMatchesProof(sessionData, dataOf(result))) {
				throw new Error("session OTT non prouvée");
			}
			return { kind: "adopted" as const, sessionToken, sessionData };
		}, options.timeoutMs ?? 4_000, options.signal);

		// Le hook du plugin a posé le matériau vérifié. Ne réveiller useSession
		// qu'après la preuve, jamais après une réponse refusée ou un délai écoulé.
		authClient.updateSession?.();
		return adopted;
	} catch {
		clearCrossDomainSessionResidue(options.storage, authClient);
		return { kind: "rejected", reason: "verify_failed" };
	}
}

function sessionTokenOf(value: unknown): string | null {
	const data = dataOf(value);
	if (!data || typeof data !== "object" || !("session" in data)) return null;
	const session = (data as { session?: unknown }).session;
	if (!session || typeof session !== "object" || !("token" in session)) return null;
	const token = (session as { token?: unknown }).token;
	return typeof token === "string" && token.length > 0 ? token : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Cohérence JWT ↔ session — la seconde barrière
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PURE — lit le payload d'un JWT compact. AUCUNE vérification de signature :
 * c'est un contrôle de COHÉRENCE côté client, l'autorité reste au serveur
 * Convex qui, lui, vérifie le jeton.
 */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
		const parsed: unknown = JSON.parse(atob(padded));
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/**
 * PURE — le JWT décrit-il bien la session courante ?
 *
 * Fail-closed BORNÉ, et la borne est délibérée : on ne refuse que si les deux
 * `sessionId` sont présents ET différents. Un claim absent est accepté (avec un
 * avertissement) parce que refuser déconnecterait tout le parc le jour où le
 * plugin amont changerait son `definePayload` — un risque de panne totale bien
 * plus probable que le résidu, déjà fermé par l'adoption de l'OTT en amont.
 */
export function tokenMatchesSession(token: string, sessionData: unknown): boolean {
	const claims = decodeJwtClaims(token);
	const claimSessionId = claims?.["sessionId"];
	const currentSessionId = sessionIdOf(sessionData);

	if (typeof claimSessionId !== "string" || typeof currentSessionId !== "string") {
		return true;
	}
	return claimSessionId === currentSessionId;
}

function sessionIdOf(value: unknown): string | null {
	if (!value || typeof value !== "object" || !("session" in value)) return null;
	const session = (value as { session?: unknown }).session;
	if (!session || typeof session !== "object" || !("id" in session)) return null;
	const id = (session as { id?: unknown }).id;
	return typeof id === "string" ? id : null;
}

function sessionSubjectOf(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	const data = value as { user?: unknown; session?: unknown };
	const userId = data.user && typeof data.user === "object" && "id" in data.user
		? (data.user as { id?: unknown }).id : null;
	const sessionUserId = data.session && typeof data.session === "object" && "userId" in data.session
		? (data.session as { userId?: unknown }).userId : null;
	if (typeof userId === "string" && typeof sessionUserId === "string" && userId !== sessionUserId) return null;
	const subject = userId ?? sessionUserId;
	return typeof subject === "string" && subject.length > 0 ? subject : null;
}

function validSessionIdentity(value: unknown): boolean {
	return Boolean(sessionIdOf(value) && sessionSubjectOf(value));
}

/** Toute identité disponible dans la preuve doit rester identique. */
function sessionMatchesProof(sessionData: unknown, proof: unknown): boolean {
	const proofId = sessionIdOf(proof);
	const proofSubject = sessionSubjectOf(proof);
	return (!proofId || proofId === sessionIdOf(sessionData)) &&
		(!proofSubject || proofSubject === sessionSubjectOf(sessionData));
}

/**
 * Renouvelle explicitement une session cross-domain avant de monter Convex.
 *
 * Les storage states et les onglets inactifs peuvent conserver un JWT Convex
 * expiré alors que le session_token Better Auth reste valable. Monter les deux
 * providers simultanément crée alors une course intermittente entre
 * `useSession()` et `setAuth()`. Cette amorce vérifie d'abord la session, force
 * l'émission d'un JWT frais, puis précharge l'atome Better Auth.
 */
export async function refreshCrossDomainSession(
	authClient: RefreshableCrossDomainAuthClient,
	options: SessionBootstrapOptions = {},
): Promise<SessionBootstrapResult> {
	const attempts = options.attempts ?? 3;
	const timeoutMs = options.timeoutMs ?? 4_000;
	const retryDelayMs = options.retryDelayMs ?? 250;
	if (!Number.isInteger(attempts) || attempts < 1) {
		throw new Error("attempts doit être un entier >= 1");
	}

	const storage =
		options.storage ??
		(typeof localStorage !== "undefined" ? localStorage : undefined);

	// ── 0. L'OTT PRIME SUR LE RÉSIDU ─────────────────────────────────────────
	// Il faut que la session soit DÉJÀ la bonne au moment où le JWT est
	// demandé : le jeton obtenu ci-dessous part en `initialToken` et devient le
	// `cachedToken` que Convex resservira sans jamais le revalider.
	const ott = await adoptOneTimeTokenSession(authClient, options.oneTimeToken ?? null, {
		signal: options.signal,
		storage,
		timeoutMs,
	});
	if (ott.kind === "rejected") {
		// La purge ne peut pas retirer un cookie HTTP d'un autre port. Un OTT
		// refusé clôt l'amorçage : aucune lecture du résidu ni requête JWT.
		clearCrossDomainSessionResidue(storage, authClient);
		return { kind: "signed_out", token: null };
	}
	const authorization = ott.kind === "adopted"
		? { Authorization: `Bearer ${ott.sessionToken}` } : undefined;

	const hasAuthMaterial =
		ott.kind === "adopted" ||
		Boolean(authClient.getCookie?.() || authClient.getSessionData?.());
	if (!hasAuthMaterial) {
		clearCrossDomainSessionResidue(storage, authClient);
		return { kind: "signed_out", token: null };
	}

	let lastError: unknown = new Error("renouvellement de session impossible");
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const { sessionResult, tokenResult } = await runWithTimeout(
				async (signal) => {
					const sessionResult = await authClient.getSession({
						fetchOptions: { throw: false, signal, headers: authorization },
					});
					const sessionData = errorOf(sessionResult) ? null : sessionOf(sessionResult);
					// Le JWT Convex n'est demandé QUE si une session existe.
					// `hasAuthMaterial` se contente d'un résidu (`better-auth_cookie` /
					// `better-auth_session_data` en localStorage) qui survit à une
					// déconnexion : on arrivait donc ici sans session et
					// `/api/auth/convex/token` répondait 401. Cette requête est perdue
					// d'avance — son résultat est ignoré juste en dessous, où l'absence
					// de session renvoie `signed_out` — et ne faisait que polluer la
					// console et coûter un aller-retour à chaque chargement déconnecté.
					const tokenResult = sessionData && (ott.kind !== "adopted" || sessionMatchesProof(sessionData, ott.sessionData))
						? await authClient.convex.token({
								fetchOptions: { throw: false, signal, headers: authorization },
							})
						: null;
					return { sessionResult, tokenResult };
				},
				timeoutMs,
				options.signal,
			);
			const sessionData = errorOf(sessionResult) ? null : sessionOf(sessionResult);
			if (!sessionData) {
				const error = errorOf(sessionResult);
				const status = statusOf(error);
				// Seule une absence confirmée (ou un refus 401) autorise la purge.
				// Une erreur sans statut ne prouve pas que la session a disparu.
				if (dataOf(sessionResult) == null && (error == null || status === 401)) {
					clearCrossDomainSessionResidue(storage, authClient);
					return { kind: "signed_out", token: null };
				}
				throw error ?? new Error("session Better Auth absente");
			}

			if (ott.kind === "adopted" && !sessionMatchesProof(sessionData, ott.sessionData)) {
				clearCrossDomainSessionResidue(storage, authClient);
				return { kind: "signed_out", token: null };
			}

			const token = errorOf(tokenResult) ? null : tokenOf(tokenResult);
			if (!token) {
				throw errorOf(tokenResult) ?? new Error("JWT Convex absent");
			}

			// Seconde barrière : le JWT décrit-il bien la session qu'on vient de
			// lire ? Une divergence n'a qu'une cause connue — un résidu vivant
			// appartenant à quelqu'un d'autre. On ne retente PAS : sur cette
			// origine, plus rien n'est prouvable, et resservir le jeton reviendrait
			// à faire travailler la personne qui arrive sous l'identité d'une autre.
			if (!tokenMatchesSession(token, sessionData)) {
				clearCrossDomainSessionResidue(storage, authClient);
				return { kind: "signed_out", token: null };
			}

			primeSessionAtom(authClient, sessionData);
			return { kind: "ready", token };
		} catch (error) {
			lastError = error;
			if (options.signal?.aborted) throw error;
			if (attempt < attempts) await pause(retryDelayMs * attempt, options.signal);
		}
	}

	throw lastError;
}
