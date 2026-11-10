export type NativeIdnAttempt = {
  state: string
  verifier: string
  challenge: string
  redirectUri: string
  expiresAt: number
}

const ATTEMPT_TTL_MS = 10 * 60 * 1000
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const GENERIC_SCHEMES = new Set(["http", "https", "exp", "exps", "file", "javascript", "data"])

function validScheme(value: string): boolean {
  return typeof value === "string" && /^[a-z][a-z0-9+.-]{2,63}$/.test(value) && !GENERIC_SCHEMES.has(value)
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value)
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export async function createNativeIdnAttempt(input: {
  scheme: string
  randomToken: () => Promise<string>
  sha256: (verifier: string) => Promise<string>
  now?: number
}): Promise<NativeIdnAttempt> {
  const now = input.now ?? Date.now()
  if (!validScheme(input.scheme) || !validTime(now) || !validTime(now + ATTEMPT_TTL_MS)) {
    throw new Error("Invalid native IDN configuration")
  }
  const state = await input.randomToken()
  if (!validToken(state)) throw new Error("Invalid native IDN state")
  const verifier = await input.randomToken()
  if (!validToken(verifier) || verifier === state) throw new Error("Invalid native IDN verifier")
  const challenge = await input.sha256(verifier)
  if (!validToken(challenge)) throw new Error("Invalid native IDN challenge")
  return { state, verifier, challenge, redirectUri: `${input.scheme}://auth/idn`, expiresAt: now + ATTEMPT_TTL_MS }
}

/** Le retour ne transporte qu'un code à échanger ; aucune session n'est adoptée ici. */
export function nativeIdnReturn(raw: string, attempt: NativeIdnAttempt | null | undefined, now = Date.now()): { code: string } | null {
  if (!attempt || !validTime(now) || !validTime(attempt.expiresAt) || attempt.expiresAt <= now
    || !validToken(attempt.state) || !validToken(attempt.verifier) || attempt.state === attempt.verifier
    || !validToken(attempt.challenge) || typeof raw !== "string" || raw.length > 1024 || raw.includes("#")) return null
  try {
    const expected = new URL(attempt.redirectUri)
    const scheme = expected.protocol.slice(0, -1)
    if (!validScheme(scheme) || attempt.redirectUri !== `${scheme}://auth/idn`) return null
    const url = new URL(raw)
    // Vérifier aussi la forme brute : URL normalise notamment les segments « .. ».
    if (raw.split("?", 1)[0] !== attempt.redirectUri || url.protocol !== expected.protocol
      || url.hostname !== "auth" || url.pathname !== "/idn" || url.username || url.password || url.port || url.hash) return null
    const keys = [...url.searchParams.keys()]
    if (keys.length !== 2 || keys.filter(key => key === "code").length !== 1 || keys.filter(key => key === "state").length !== 1) return null
    const code = url.searchParams.get("code")
    if (!validToken(code) || url.searchParams.get("state") !== attempt.state) return null
    return { code }
  } catch { return null }
}
