import { healthHttpStatus } from "@antsia/api/health"

import { probeSiteHealth, siteHealthEnv } from "@/lib/health"

// Jamais de rendu statique : une santé figée à la compilation décrit la
// machine de build, pas le service qui répond.
export const dynamic = "force-dynamic"

/** Santé réelle (EX-03) : 200 si le moteur répond, 503 sinon ; réponse bornée à 2 s d'attente du moteur. */
export async function GET() {
  const report = await probeSiteHealth(siteHealthEnv())
  return Response.json(report, { status: healthHttpStatus(report), headers: { "Cache-Control": "no-store" } })
}
