import { createAuthProxyHandlers } from "@antsia/api/auth-proxy"

/**
 * Proxy de même origine vers les seules actions d'authentification du moteur, SANS aucun cookie du
 * navigateur, dans un sens comme dans l'autre (revue CH-815, constat F3 ; même motif
 * qu'admin.diaspora.ga). La session de la console ne vit que dans `Better-Auth-Cookie` /
 * `Set-Better-Auth-Cookie` (greffon `crossDomain`, `credentials: "omit"`), qui passent : le `Cookie`
 * entrant ne part pas, aucun `Set-Cookie` ne revient, et un rappel OAuth ne relaie ni cookie ni jeton
 * porteur. Un cookie entrant ne viendrait que d'un dépôt par un voisin du même site.
 */
export const { DELETE, GET, PATCH, POST, PUT } = createAuthProxyHandlers({ browserCookies: "drop" })
