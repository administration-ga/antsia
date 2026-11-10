import { api } from "@convex/_generated/api"
import { fetchQuery } from "convex/nextjs"
import { NextResponse } from "next/server"
import { z } from "zod"

import { routes } from "./routes"
import { admittedDemoProxy } from "./demo-proxy"
import { BRIDGE_TIMEOUT_MS, BRIDGE_TTL_SECONDS, type BridgeReceipt, bridgeCookieNames, isBridgeGeneration, sdkSessionCookie } from "./session-bridge"
import { boundedAuthFetch, configuredBridgeOrigin, readBoundedText, tokenCorrelatesWithSession, verifiedSessionDto, withinBridgeDeadline } from "./server-session"

const generationSchema = z.string().refine(isBridgeGeneration)
const grantSchema = z.object({ generation: generationSchema, cookie: z.string().min(1).max(16_384), jwt: z.string().min(1).max(8192) }).strict()
const purgeSchema = z.object({ generation: generationSchema, anonymous: z.boolean() }).strict()

export type BridgeServerDependencies = { origin?: string | null; authFetch?: typeof boundedAuthFetch; sessionActive?: (token: string) => Promise<boolean>; now?: () => number }

function reply(status: number): NextResponse {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
}

function requestGeneration(request: Request, name: string): string | null {
  const candidates = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`))
  const value = candidates.length === 1 ? candidates[0]!.slice(name.length + 1) : null
  return isBridgeGeneration(value) ? value : null
}

async function requestJson(request: Request, signal: AbortSignal): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const text = await Promise.race([
      readBoundedText(request.body, 32_768, signal),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new Error("bodyUnavailable")) }, BRIDGE_TIMEOUT_MS) }),
    ])
    return JSON.parse(text) as unknown
  } finally { if (timer !== undefined) clearTimeout(timer) }
}

function receiptResponse(receipt: BridgeReceipt | null, origin: string, maxAge = BRIDGE_TTL_SECONDS): NextResponse {
  const response = reply(204)
  const secure = new URL(origin).protocol === "https:"
  response.cookies.set(bridgeCookieNames(secure).receipt, receipt ? JSON.stringify(receipt) : "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: receipt ? maxAge : 0 })
  // La génération visible n'est JAMAIS modifiée par une réponse asynchrone.
  return response
}

/** Admission ou purge locales seulement. Aucune création/révocation de session Better Auth. */
export async function handleSessionBridge(request: Request, dependencies: BridgeServerDependencies = {}): Promise<NextResponse> {
  try { return await withinBridgeDeadline((signal) => verifySessionBridge(request, dependencies, signal)) }
  catch { return reply(503) }
}

async function verifySessionBridge(request: Request, dependencies: BridgeServerDependencies, signal: AbortSignal): Promise<NextResponse> {
  const origin = dependencies.origin === undefined ? configuredBridgeOrigin() : dependencies.origin
  if (!origin || request.headers.get("origin") !== origin || (new URL(request.url).origin !== origin && !admittedDemoProxy(request)) || request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply(403)
  if (request.method !== "POST" && request.method !== "DELETE") return reply(405)
  const names = bridgeCookieNames(new URL(origin).protocol === "https:")
  const generation = requestGeneration(request, names.generation)
  if (!generation) return reply(403)
  let body: unknown
  try { body = await requestJson(request, signal) } catch { return reply(400) }
  if (request.method === "DELETE") {
    const parsed = purgeSchema.safeParse(body)
    if (!parsed.success || parsed.data.generation !== generation) return reply(403)
    return receiptResponse(parsed.data.anonymous ? { kind: "anonymous", generation } : null, origin)
  }
  const parsed = grantSchema.safeParse(body)
  if (!parsed.success || parsed.data.generation !== generation) return reply(403)
  const sessionCookie = sdkSessionCookie(parsed.data.cookie)
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!sessionCookie || !url) return reply(403)
  try {
    // SEUL le SID signé du SDK est transmis ; pas le Cookie HTTP ni les en-têtes entrants.
    const response = await (dependencies.authFetch ?? boundedAuthFetch)(routes.authSession(), `${sessionCookie.name}=${encodeURIComponent(sessionCookie.value)}`, undefined, signal)
    if (!response.ok) return reply(response.status === 401 || response.status === 403 ? 403 : 503)
    const now = dependencies.now ?? Date.now
    const session = verifiedSessionDto(await response.json(), now())
    if (!session) return reply(403)
    signal.throwIfAborted()
    const active = await (dependencies.sessionActive ?? ((token) => fetchQuery(api.modules.platform.authentication.mySession, {}, { url, token })))(parsed.data.jwt)
    if (!active || !tokenCorrelatesWithSession(parsed.data.jwt, session)) return reply(403)
    const maxAge = Math.min(BRIDGE_TTL_SECONDS, Math.floor((session.expiresAt - now()) / 1000))
    if (maxAge <= 0) return reply(403)
    return receiptResponse({ kind: "session", generation, cookieName: sessionCookie.name, cookieValue: sessionCookie.value }, origin, maxAge)
  } catch { return reply(503) }
}
