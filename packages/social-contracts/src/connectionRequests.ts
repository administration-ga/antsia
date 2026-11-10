/** Délai public d'une demande de relation, résultat courant ou ancien refus Convex. */
export function connectionRequestRetryAfter(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null
  const data = "data" in value ? value.data : value
  if (typeof data !== "object" || data === null) return null
  const limited = ("status" in data && data.status === "rateLimited") || ("code" in data && data.code === "rateLimited")
  if (!limited || !("retryAfterMs" in data) || typeof data.retryAfterMs !== "number" || !Number.isFinite(data.retryAfterMs)) return null
  return Math.max(1, Math.ceil(data.retryAfterMs))
}
