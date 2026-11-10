// Dupliqué de socle/packages/api/src/cross-domain-session-bootstrap.test.ts @ ad2e7fdc2 — adaptations : `bun:test` → `vitest` ; purge de session absente ; OTT rejeté fermé malgré un cookie HTTP ; preuve d'adoption et Bearer conservé pendant le renouvellement.
import { describe, expect, test } from "vitest";
import {
	CROSS_DOMAIN_COOKIE_KEY,
	CROSS_DOMAIN_SESSION_DATA_KEY,
	adoptOneTimeTokenSession,
	clearCrossDomainSessionResidue,
	decodeJwtClaims,
	refreshCrossDomainSession,
	takeOneTimeToken,
	tokenMatchesSession,
	type CrossDomainStorage,
	type RefreshableCrossDomainAuthClient,
} from "./cross-domain-session-bootstrap";

/** Faux `localStorage`, borné à ce que le bootstrap utilise. */
function storage(): CrossDomainStorage & { map: Map<string, string> } {
	const map = new Map<string, string>();
	return {
		map,
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
	};
}

/** Forge un JWT compact non signé, pour les seuls besoins du décodage. */
function jwt(claims: Record<string, unknown>): string {
	const b64 = (o: unknown) =>
		btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return `${b64({ alg: "RS256" })}.${b64(claims)}.signature`;
}

function client(overrides: Partial<RefreshableCrossDomainAuthClient> = {}) {
	const atomValues: Array<Record<string, unknown>> = [];
	const authClient: RefreshableCrossDomainAuthClient = {
		getCookie: () => "better-auth.session_token=valid",
		getSessionData: () => ({ session: { id: "cached" }, user: { id: "u" } }),
		getSession: async () => ({
			data: { session: { id: "fresh" }, user: { id: "u" } },
			error: null,
		}),
		convex: {
			token: async () => ({ data: { token: "fresh-convex-jwt" }, error: null }),
		},
		$store: {
			atoms: {
				session: {
					get: () => ({ refetch: () => undefined, isPending: true }),
					set: (value) => atomValues.push(value),
				},
			},
		},
		...overrides,
	};
	return { authClient, atomValues };
}

describe("refreshCrossDomainSession", () => {
	test("renouvelle le JWT et précharge l'atome de session", async () => {
		const { authClient, atomValues } = client();
		const result = await refreshCrossDomainSession(authClient);
		expect(result).toEqual({ kind: "ready", token: "fresh-convex-jwt" });
		expect(atomValues).toHaveLength(1);
		expect(atomValues[0]).toMatchObject({
			data: { session: { id: "fresh" } },
			isPending: false,
			isRefetching: false,
		});
	});

	test("ne contacte pas le serveur sans matériau d'authentification", async () => {
		let calls = 0;
		const { authClient } = client({
			getCookie: () => "",
			getSessionData: () => null,
			getSession: async () => {
				calls += 1;
				return null;
			},
		});
		expect(await refreshCrossDomainSession(authClient)).toEqual({
			kind: "signed_out",
			token: null,
		});
		expect(calls).toBe(0);
	});

	test("retente un renouvellement transitoirement défaillant", async () => {
		let tokenCalls = 0;
		const { authClient } = client({
			convex: {
				token: async () => {
					tokenCalls += 1;
					return tokenCalls === 1
						? { data: null, error: { status: 503 } }
						: { data: { token: "retry-token" }, error: null };
				},
			},
		});
		const result = await refreshCrossDomainSession(authClient, {
			retryDelayMs: 1,
		});
		expect(result).toEqual({ kind: "ready", token: "retry-token" });
		expect(tokenCalls).toBe(2);
	});

	test("applique un délai unique à la session puis au jeton", async () => {
		let sessionComplete = false;
		const { authClient } = client({
			getSession: async () => {
				sessionComplete = true;
				return {
					data: { session: { id: "fresh" }, user: { id: "u" } },
					error: null,
				};
			},
			convex: {
				token: async () => {
					expect(sessionComplete).toBe(true);
					return { data: { token: "bounded-token" }, error: null };
				},
			},
		});
		expect(
			await refreshCrossDomainSession(authClient, { timeoutMs: 50 }),
		).toEqual({ kind: "ready", token: "bounded-token" });
	});

	test("respecte le délai même si le client ignore le signal d'annulation", async () => {
		const never = new Promise<never>(() => undefined);
		const { authClient } = client({
			getSession: async () => never,
			convex: { token: async () => never },
		});
		const startedAt = Date.now();
		await expect(
			refreshCrossDomainSession(authClient, { attempts: 1, timeoutMs: 5 }),
		).rejects.toMatchObject({ name: "TimeoutError" });
		expect(Date.now() - startedAt).toBeLessThan(100);
	});

	test("retourne signed_out lorsque la session est absente", async () => {
		const { authClient } = client({
			getSession: async () => ({ data: null, error: { status: 401 } }),
		});
		expect(await refreshCrossDomainSession(authClient)).toEqual({
			kind: "signed_out",
			token: null,
		});
	});

	test.each([
		{ data: null, error: null },
		{ data: null, error: { status: 401 } },
		null,
	])("purge le résidu et l'atome quand la session distante n'existe plus (%j)", async (response) => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "ancien-cookie");
		store.map.set(CROSS_DOMAIN_SESSION_DATA_KEY, "ancienne-personne");
		store.map.set("preference-etrangere", "intacte");
		let tokenCalls = 0;
		const { authClient, atomValues } = client({
			getSession: async () => response,
			convex: { token: async () => { tokenCalls += 1; return null; } },
		});
		expect(await refreshCrossDomainSession(authClient, { storage: store })).toEqual({ kind: "signed_out", token: null });
		expect(tokenCalls).toBe(0);
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
		expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("{}");
		expect(store.map.get("preference-etrangere")).toBe("intacte");
		expect(atomValues.at(-1)).toMatchObject({ data: null, isPending: false });
	});

	test("éteint aussi l'atome périmé sans matériau d'authentification", async () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "résidu-illisible");
		store.map.set(CROSS_DOMAIN_SESSION_DATA_KEY, "ancien-cache");
		const { authClient, atomValues } = client({
			getCookie: () => "",
			getSessionData: () => null,
			getSession: async () => { throw new Error("ne doit pas contacter le serveur"); },
		});
		expect(await refreshCrossDomainSession(authClient, { storage: store })).toEqual({ kind: "signed_out", token: null });
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
		expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("{}");
		expect(atomValues.at(-1)).toMatchObject({ data: null, isPending: false });
	});

	test("un échec réseau ne purge pas une session dont l'absence n'est pas prouvée", async () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "cookie-valable");
		store.map.set(CROSS_DOMAIN_SESSION_DATA_KEY, "cache-valable");
		const { authClient, atomValues } = client({
			getSession: async () => ({ data: null, error: { status: 503 } }),
		});
		await expect(refreshCrossDomainSession(authClient, { storage: store, attempts: 1 })).rejects.toEqual({ status: 503 });
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("cookie-valable");
		expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("cache-valable");
		expect(atomValues).toHaveLength(0);
	});

	test.each([
		{ label: "sans statut", error: { message: "transport unavailable" } },
		{ label: "avec statut réseau zéro", error: { status: 0, message: "transport unavailable" } },
	])("une erreur de session $label épuise les tentatives sans purger le SDK ni l'atome", async ({ error }) => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "cookie-valable");
		store.map.set(CROSS_DOMAIN_SESSION_DATA_KEY, "cache-valable");
		let sessionCalls = 0;
		let tokenCalls = 0;
		const { authClient, atomValues } = client({
			getSession: async () => {
				sessionCalls += 1;
				return { data: null, error };
			},
			convex: { token: async () => { tokenCalls += 1; return null; } },
		});
		await expect(refreshCrossDomainSession(authClient, {
			storage: store,
			attempts: 3,
			retryDelayMs: 1,
		})).rejects.toEqual(error);
		expect(sessionCalls).toBe(3);
		expect(tokenCalls).toBe(0);
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("cookie-valable");
		expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("cache-valable");
		expect(atomValues).toHaveLength(0);
	});

	test.each([
		{ label: "sans statut", error: { message: "transport unavailable" } },
		{ label: "avec statut réseau zéro", error: { status: 0, message: "transport unavailable" } },
	])("retente une erreur de session $label avant de demander un seul JWT", async ({ error }) => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "cookie-valable");
		store.map.set(CROSS_DOMAIN_SESSION_DATA_KEY, "cache-valable");
		const sessionData = { session: { id: "fresh" }, user: { id: "u" } };
		let sessionCalls = 0;
		let tokenCalls = 0;
		const { authClient, atomValues } = client({
			getSession: async () => {
				sessionCalls += 1;
				expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("cookie-valable");
				expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("cache-valable");
				expect(atomValues).toHaveLength(0);
				return sessionCalls === 1
					? { data: null, error }
					: { data: sessionData, error: null };
			},
			convex: { token: async () => {
				tokenCalls += 1;
				return { data: { token: "retry-token" }, error: null };
			} },
		});
		expect(await refreshCrossDomainSession(authClient, {
			storage: store,
			attempts: 3,
			retryDelayMs: 1,
		})).toEqual({ kind: "ready", token: "retry-token" });
		expect(sessionCalls).toBe(2);
		expect(tokenCalls).toBe(1);
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("cookie-valable");
		expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("cache-valable");
		expect(atomValues).toHaveLength(1);
		expect(atomValues[0]).toMatchObject({ data: sessionData, isPending: false });
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Audit du 2026-08-05 — le résidu d'une autre personne ne doit jamais servir
// ═══════════════════════════════════════════════════════════════════════════

describe("takeOneTimeToken", () => {
	test("prélève le jeton et rend l'URL nettoyée", () => {
		expect(takeOneTimeToken("https://espace.administration.ga/espace?ott=abc123")).toEqual({
			token: "abc123",
			href: "https://espace.administration.ga/espace",
		});
	});

	test("préserve les autres paramètres", () => {
		const { token, href } = takeOneTimeToken("https://a.ga/x?tab=iprofil&ott=t&p=2");
		expect(token).toBe("t");
		expect(href).toContain("tab=iprofil");
		expect(href).toContain("p=2");
		expect(href).not.toContain("ott");
	});

	test("rend l'URL intacte quand il n'y a pas de jeton, ou qu'elle est invalide", () => {
		expect(takeOneTimeToken("https://a.ga/x")).toEqual({
			token: null,
			href: "https://a.ga/x",
		});
		expect(takeOneTimeToken("pas-une-url")).toEqual({
			token: null,
			href: "pas-une-url",
		});
	});
});

describe("decodeJwtClaims / tokenMatchesSession", () => {
	test("décode un payload base64url sans padding", () => {
		expect(decodeJwtClaims(jwt({ sessionId: "s1", sub: "u1" }))).toMatchObject({
			sessionId: "s1",
		});
	});

	test("rend null sur un jeton malformé plutôt que de lever", () => {
		expect(decodeJwtClaims("pas.un.jwt")).toBeNull();
		expect(decodeJwtClaims("deux.parties")).toBeNull();
	});

	test("accepte quand les deux sessionId concordent", () => {
		expect(tokenMatchesSession(jwt({ sessionId: "s1" }), { session: { id: "s1" } })).toBe(true);
	});

	test("REFUSE quand ils diffèrent — c'est la signature du résidu", () => {
		expect(tokenMatchesSession(jwt({ sessionId: "session-de-Y" }), { session: { id: "session-de-X" } })).toBe(false);
	});

	test("accepte quand le claim est absent — fail-closed BORNÉ, à dessein", () => {
		// Refuser ici déconnecterait tout le parc le jour où le plugin amont
		// changerait son `definePayload`. Le résidu est déjà fermé en amont.
		expect(tokenMatchesSession(jwt({ sub: "u1" }), { session: { id: "s1" } })).toBe(true);
		expect(tokenMatchesSession("pas.un.jwt", { session: { id: "s1" } })).toBe(true);
	});
});

describe("clearCrossDomainSessionResidue", () => {
	test("vide les deux clés et éteint l'atome de session", () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, '{"better-auth.session_token":{"value":"Y"}}');
		store.map.set(CROSS_DOMAIN_SESSION_DATA_KEY, '{"session":{"id":"Y"}}');
		const { authClient, atomValues } = client();

		clearCrossDomainSessionResidue(store, authClient);

		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
		expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("{}");
		expect(atomValues.at(-1)).toMatchObject({ data: null, isPending: false });
	});

	test("ne lève jamais, même sans storage", () => {
		expect(() => clearCrossDomainSessionResidue(undefined)).not.toThrow();
	});
});

describe("adoptOneTimeTokenSession", () => {
	test("`absent` sans jeton — et ne touche à rien", () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "intact");
		const { authClient } = client();
		return adoptOneTimeTokenSession(authClient, null, { storage: store }).then((r) => {
			expect(r).toEqual({ kind: "absent" });
			expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("intact");
		});
	});

	test("adopte la session prouvée et rejoue getSession en Bearer", async () => {
		let bearer: string | undefined;
		let notified = false;
		const { authClient } = client({
			crossDomain: {
				oneTimeToken: {
					verify: async () => ({ data: { session: { id: "X", userId: "x", token: "jeton-de-X" }, user: { id: "x" } }, error: null }),
				},
			},
			updateSession: () => {
				notified = true;
			},
			getSession: async (options) => {
				bearer = options?.fetchOptions?.headers?.Authorization;
				return { data: { session: { id: "X" }, user: { id: "x" } } };
			},
		});

		expect(await adoptOneTimeTokenSession(authClient, "ott")).toEqual({
			kind: "adopted",
			sessionToken: "jeton-de-X",
			sessionData: { session: { id: "X" }, user: { id: "x" } },
		});
		expect(bearer).toBe("Bearer jeton-de-X");
		expect(notified).toBe(true);
	});

	test("PURGE quand la vérification échoue — on ne sert pas le résidu à sa place", async () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, '{"session_token":{"value":"Y"}}');
		const { authClient } = client({
			crossDomain: {
				oneTimeToken: { verify: async () => ({ data: null, error: { status: 400 } }) },
			},
		});

		expect(await adoptOneTimeTokenSession(authClient, "ott-expire", { storage: store })).toEqual({
			kind: "rejected",
			reason: "verify_failed",
		});
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
	});

	test("PURGE aussi quand le plugin est absent — on ne sait pas qui arrive", async () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "residu");
		const { authClient } = client();

		expect(await adoptOneTimeTokenSession(authClient, "ott", { storage: store })).toEqual({
			kind: "rejected",
			reason: "unsupported",
		});
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
	});

	test.each([
		{ data: null, error: null },
		{ data: null, error: { status: 401 } },
		{ data: { session: {}, user: { id: "X" } }, error: null },
		{ data: { session: { id: "X" } }, error: null },
		{ data: { session: { id: "X" }, user: { id: "X" } }, error: { status: 503 } },
	])("refuse et purge si getSession en Bearer ne prouve pas l'adoption (%j)", async (response) => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "cookie-de-Y");
		store.map.set(CROSS_DOMAIN_SESSION_DATA_KEY, "personne-Y");
		let notified = false;
		const { authClient, atomValues } = client({
			crossDomain: { oneTimeToken: { verify: async () => ({ data: { session: { token: "X" } } }) } },
			getSession: async () => response,
			updateSession: () => { notified = true; },
		});
		expect(await adoptOneTimeTokenSession(authClient, "ott", { storage: store })).toEqual({ kind: "rejected", reason: "verify_failed" });
		expect(notified).toBe(false);
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
		expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("{}");
		expect(atomValues.at(-1)).toMatchObject({ data: null });
	});

	test("une erreur réseau pendant la preuve d'adoption rejette et purge", async () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "cookie-de-Y");
		const { authClient } = client({
			crossDomain: { oneTimeToken: { verify: async () => ({ data: { session: { token: "X" } } }) } },
			getSession: async () => { throw new Error("réseau indisponible"); },
		});
		expect(await adoptOneTimeTokenSession(authClient, "ott", { storage: store })).toEqual({ kind: "rejected", reason: "verify_failed" });
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
	});

	test("une preuve d'adoption bloquée expire et purge même si le client ignore le signal", async () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "cookie-de-Y");
		let notified = false;
		const { authClient } = client({
			crossDomain: { oneTimeToken: { verify: async () => ({ data: { session: { token: "X" } } }) } },
			getSession: async () => new Promise<never>(() => undefined),
			updateSession: () => { notified = true; },
		});
		expect(await adoptOneTimeTokenSession(authClient, "ott", { storage: store, timeoutMs: 5 })).toEqual({ kind: "rejected", reason: "verify_failed" });
		expect(notified).toBe(false);
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
	});

	test("une vérification déjà abandonnée ne lit aucune session et purge", async () => {
		const controller = new AbortController();
		controller.abort();
		const store = storage();
		let reads = 0;
		const { authClient } = client({
			crossDomain: { oneTimeToken: { verify: async () => { reads += 1; return { data: { session: { token: "X" } } }; } } },
			getSession: async () => { reads += 1; return null; },
		});
		expect(await adoptOneTimeTokenSession(authClient, "ott", { storage: store, signal: controller.signal })).toEqual({ kind: "rejected", reason: "verify_failed" });
		expect(reads).toBe(0);
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
	});

	test.each([
		{ session: { id: "session-Y", userId: "X" }, user: { id: "X" } },
		{ session: { id: "session-X", userId: "Y" }, user: { id: "Y" } },
		{ session: { id: "session-X", userId: "X" }, user: { id: "Y" } },
	])("refuse une session dont l'identité diffère de la preuve OTT (%j)", async (sessionData) => {
		const store = storage();
		const { authClient } = client({
			crossDomain: { oneTimeToken: { verify: async () => ({ data: { session: { id: "session-X", token: "X", userId: "X" }, user: { id: "X" } } }) } },
			getSession: async () => ({ data: sessionData, error: null }),
		});
		expect(await adoptOneTimeTokenSession(authClient, "ott", { storage: store })).toEqual({ kind: "rejected", reason: "verify_failed" });
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
	});

	test("ne considère pas une vérification assortie d'une erreur comme une preuve", async () => {
		let reads = 0;
		const { authClient } = client({
			crossDomain: { oneTimeToken: { verify: async () => ({ data: { session: { token: "X" } }, error: { status: 400 } }) } },
			getSession: async () => { reads += 1; return null; },
		});
		expect(await adoptOneTimeTokenSession(authClient, "ott")).toEqual({ kind: "rejected", reason: "verify_failed" });
		expect(reads).toBe(0);
	});
});

describe("refreshCrossDomainSession — non-régression de l'incident de production", () => {
	/**
	 * Le scénario exact du 2026-08-05, reproduit de bout en bout.
	 *
	 * Y s'est connectée sur cette origine, puis s'est déconnectée AILLEURS —
	 * sa session vit donc toujours ici (7 jours). X arrive avec son propre
	 * one-time-token. Avant correction, le bootstrap lisait le résidu de Y,
	 * en tirait le JWT de Y, et Convex servait X sous l'identité de Y pendant
	 * 30 minutes.
	 */
	function residuDeY(overrides: Partial<RefreshableCrossDomainAuthClient> = {}) {
		return client({
			// Résidu VIVANT de Y sur cette origine.
			getCookie: () => 'better-auth.session_token=jeton-de-Y',
			getSessionData: () => ({ session: { id: "session-de-Y" } }),
			crossDomain: {
				oneTimeToken: {
					verify: async () => ({ data: { session: { token: "jeton-de-X" } } }),
				},
			},
			getSession: async (options) => {
				// Le cookie HTTP reste Y après le handoff : seul le Bearer
				// explicite permet de lire X à chaque requête.
				const current = options?.fetchOptions?.headers?.Authorization === "Bearer jeton-de-X" ? "X" : "Y";
				return {
					data: { session: { id: `session-de-${current}` }, user: { id: current } },
				};
			},
			convex: {
				token: async (options) => {
					const current = options?.fetchOptions?.headers?.Authorization === "Bearer jeton-de-X" ? "X" : "Y";
					return { data: { token: jwt({ sessionId: `session-de-${current}` }) } };
				},
			},
			...overrides,
		});
	}

	test("avec un OTT valide, le JWT rendu est celui de X — jamais celui de Y", async () => {
		const { authClient } = residuDeY();
		const result = await refreshCrossDomainSession(authClient, {
			oneTimeToken: "ott-de-X",
			storage: storage(),
		});

		expect(result.kind).toBe("ready");
		expect(decodeJwtClaims(result.token!)).toMatchObject({
			sessionId: "session-de-X",
		});
	});

	test("conserve le Bearer OTT sur toutes les lectures et les nouvelles tentatives JWT", async () => {
		const authorizations: Array<string | undefined> = [];
		let tokenCalls = 0;
		const { authClient } = residuDeY({
			getSession: async (options) => {
				authorizations.push(options?.fetchOptions?.headers?.Authorization);
				return { data: { session: { id: "session-X" }, user: { id: "X" } } };
			},
			convex: { token: async (options) => {
				authorizations.push(options?.fetchOptions?.headers?.Authorization);
				tokenCalls += 1;
				return tokenCalls === 1 ? { data: null, error: { status: 503 } } : { data: { token: jwt({ sessionId: "session-X" }) } };
			} },
		});
		expect((await refreshCrossDomainSession(authClient, { oneTimeToken: "ott-X", retryDelayMs: 1 })).kind).toBe("ready");
		expect(authorizations).toHaveLength(5);
		expect(authorizations.every((value) => value === "Bearer jeton-de-X")).toBe(true);
	});

	test("refuse un changement de personne entre adoption et renouvellement sans demander de JWT", async () => {
		const store = storage();
		let reads = 0;
		let tokenCalls = 0;
		const { authClient } = residuDeY({
			getSession: async () => {
				reads += 1;
				const subject = reads === 1 ? "X" : "Y";
				return { data: { session: { id: `session-${subject}` }, user: { id: subject } } };
			},
			convex: { token: async () => { tokenCalls += 1; return null; } },
		});
		expect(await refreshCrossDomainSession(authClient, { oneTimeToken: "ott-X", storage: store })).toEqual({ kind: "signed_out", token: null });
		expect(tokenCalls).toBe(0);
		expect(reads).toBe(2);
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
	});

	test("sans OTT, le résidu vivant de Y ne devient PAS la session de qui arrive", async () => {
		// Ici rien ne prouve l'identité : le bootstrap sert la session de Y,
		// mais elle est cohérente avec son propre JWT — c'est le cas légitime
		// « Y revient sur sa propre machine ». La barrière qui compte est
		// l'incohérence, testée juste en dessous.
		const { authClient } = residuDeY();
		const result = await refreshCrossDomainSession(authClient, { storage: storage() });
		expect(decodeJwtClaims(result.token!)).toMatchObject({
			sessionId: "session-de-Y",
		});
	});

	test("un JWT qui ne décrit pas la session courante déconnecte et purge", async () => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "residu-de-Y");
		const { authClient } = client({
			getSession: async () => ({ data: { session: { id: "session-de-X" } } }),
			convex: {
				// Le jeton en cache décrit encore Y : c'est exactement l'état que
				// `cachedToken` produisait après consommation tardive du `?ott=`.
				token: async () => ({ data: { token: jwt({ sessionId: "session-de-Y" }) } }),
			},
		});

		expect(
			await refreshCrossDomainSession(authClient, { storage: store, attempts: 1 }),
		).toEqual({ kind: "signed_out", token: null });
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
	});

	test("un OTT invalide déconnecte au lieu de servir le résidu", async () => {
		// Le vrai `getCookie` du plugin LIT le localStorage : on le modélise, sans
		// quoi le test ne verrait pas l'effet de la purge.
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, '{"session_token":{"value":"Y"}}');
		const { authClient } = residuDeY({
			getCookie: () => {
				const raw = store.getItem(CROSS_DOMAIN_COOKIE_KEY) ?? "{}";
				return raw === "{}" ? "" : raw;
			},
			getSessionData: () => {
				const raw = store.getItem(CROSS_DOMAIN_SESSION_DATA_KEY) ?? "{}";
				return raw === "{}" ? null : { session: { id: "session-de-Y" } };
			},
			crossDomain: {
				oneTimeToken: { verify: async () => ({ data: null, error: { status: 400 } }) },
			},
		});

		// L'adoption a purgé ⇒ plus aucun matériau ⇒ personne n'est servi.
		// C'est le changement de comportement assumé : un OTT périmé (3 min) fait
		// re-signer, là où l'ancien code servait silencieusement le résidu.
		expect(
			await refreshCrossDomainSession(authClient, {
				oneTimeToken: "ott-expire",
				storage: store,
			}),
		).toEqual({ kind: "signed_out", token: null });
	});

	test.each([false, true])("un OTT rejeté ne lit jamais le cookie HTTP persistant ni le cache (%s)", async (unsupported) => {
		const store = storage();
		store.map.set(CROSS_DOMAIN_COOKIE_KEY, "cookie-de-Y");
		store.map.set(CROSS_DOMAIN_SESSION_DATA_KEY, "cache-de-Y");
		const reads: string[] = [];
		const { authClient, atomValues } = residuDeY({
			getCookie: () => { reads.push("cookie"); return "cookie-HTTP-persistant-Y"; },
			getSessionData: () => { reads.push("cache"); return { session: { id: "Y" } }; },
			getSession: async () => { reads.push("session"); return { data: { session: { id: "Y" }, user: { id: "Y" } } }; },
			convex: { token: async () => { reads.push("JWT"); return { data: { token: jwt({ sessionId: "Y" }) } }; } },
			crossDomain: unsupported ? undefined : { oneTimeToken: { verify: async () => ({ data: null, error: { status: 400 } }) } },
		});
		expect(await refreshCrossDomainSession(authClient, { oneTimeToken: "ott-invalide", storage: store })).toEqual({ kind: "signed_out", token: null });
		expect(reads).toEqual([]);
		expect(store.map.get(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}");
		expect(store.map.get(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("{}");
		expect(atomValues.at(-1)).toMatchObject({ data: null });
	});
});
