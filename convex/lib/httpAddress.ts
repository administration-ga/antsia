// Dupliqué de socle/convex/lib/httpSecurity.ts (l. 1-104) @ 1379d45f9 — adaptations : adresse et clé d'adresse seulement (`getTrustedClientIp`, `clientAddressKey`, `isUnknownClientAddress`, `getClientAddressKey`, analyse IPv6) ; délai annoncé à une adresse introuvable et comparaison à temps constant non repris (la porte de démonstration partage la clé `unknown`, CH-817 ; ses empreintes se comparent dans `lib/demoGate`) ; commentaires recentrés sur le moteur.
/**
 * L'adresse d'un appel HTTP, pour les limites de débit des routes publiques du moteur
 * (porte des comptes de démonstration, CH-817).
 *
 * `getTrustedClientIp` lit la DERNIÈRE entrée de `X-Forwarded-For` (celle qu'ajoute le relais de
 * confiance), jamais la première (que l'appelant écrit à sa guise).
 *
 * Deux usages distincts :
 *   - l'adresse EXACTE (`getTrustedClientIp`), pour un journal ;
 *   - la CLÉ d'adresse (`clientAddressKey`), pour une limite de débit : une adresse IPv6 y compte
 *     pour son préfixe /64, une adresse IPv4 écrite en IPv6 (`::ffff:a.b.c.d`) redevient IPv4.
 * Une adresse introuvable rend `UNKNOWN_CLIENT_ADDRESS` : à chaque route de dire si elle la refuse
 * ou la range dans un seau commun.
 */

/** Valeur rendue quand aucune adresse n'est lisible dans la requête. */
export const UNKNOWN_CLIENT_ADDRESS = "unknown"

/** L'adresse de l'appelant : la dernière entrée de `X-Forwarded-For`, `unknown` sans elle. */
export function getTrustedClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? ""
  const ips = forwarded
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
  // La dernière adresse est celle qu'ajoute le relais de confiance (l'appelant ne la choisit pas).
  return ips[ips.length - 1] ?? UNKNOWN_CLIENT_ADDRESS
}

/**
 * Clé d'une adresse pour les limites. IPv4 : l'adresse elle-même. IPv6 : son préfixe /64 — une
 * connexion IPv6 reçoit en général tout un /64 et peut y changer d'adresse à volonté ; limiter
 * l'adresse exacte ne limiterait rien. Une adresse IPv4 écrite en IPv6 (`::ffff:1.2.3.4`) redevient
 * IPv4. Une valeur vide ou introuvable rend `UNKNOWN_CLIENT_ADDRESS` ; une valeur illisible est
 * gardée telle quelle.
 */
export function clientAddressKey(ip: string): string {
  const value = ip.trim().toLowerCase()
  if (value === "" || value === UNKNOWN_CLIENT_ADDRESS) return UNKNOWN_CLIENT_ADDRESS
  if (!value.includes(":")) return value
  const groups = expandIpv6(value)
  if (!groups) return value
  if (groups.slice(0, 5).every((g) => g === "0") && groups[5] === "ffff") {
    const high = parseInt(groups[6]!, 16)
    const low = parseInt(groups[7]!, 16)
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
  }
  return `${groups.slice(0, 4).join(":")}::/64`
}

/** Vrai pour une clé qui ne désigne aucune adresse lisible. */
export function isUnknownClientAddress(key: string): boolean {
  return key === "" || key === UNKNOWN_CLIENT_ADDRESS
}

/** Clé d'adresse de la requête (limites de débit). */
export function getClientAddressKey(request: Request): string {
  return clientAddressKey(getTrustedClientIp(request))
}

/** Huit groupes hexadécimaux sans zéros de tête, ou null si l'adresse est mal formée. */
function expandIpv6(value: string): string[] | null {
  const address = value.split("%")[0] ?? ""
  const halves = address.split("::")
  if (halves.length > 2) return null
  const toGroups = (part: string): string[] | null => {
    if (!part) return []
    const out: string[] = []
    const pieces = part.split(":")
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]!
      if (i === pieces.length - 1 && piece.includes(".")) {
        const octets = piece.split(".")
        if (octets.length !== 4 || !octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return null
        const [a, b, c, d] = octets.map(Number) as [number, number, number, number]
        out.push(((a << 8) | b).toString(16), ((c << 8) | d).toString(16))
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
        out.push(piece.replace(/^0+(?=.)/, ""))
      }
    }
    return out
  }
  const left = toGroups(halves[0] ?? "")
  const right = halves.length === 2 ? toGroups(halves[1] ?? "") : []
  if (!left || !right) return null
  if (halves.length === 2) {
    const fill = 8 - left.length - right.length
    if (fill < 1) return null
    return [...left, ...Array<string>(fill).fill("0"), ...right]
  }
  return left.length === 8 ? left : null
}
