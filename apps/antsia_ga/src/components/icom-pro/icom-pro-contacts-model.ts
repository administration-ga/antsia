/**
 * ADR-0036 : les contacts d'iCom Pro, DÉRIVÉS des échanges réels — rien n'est importé.
 *
 * - Clients : les personnes qui ont écrit à une boutique que je tiens (une ligne par personne, la
 *   conversation la plus récente) ;
 * - Boutiques contactées : les boutiques à qui j'ai écrit (une ligne par boutique) ;
 * - Partenaires : mes collaborations professionnelles acceptées, dans les deux sens.
 *
 * Module PUR : les fenêtres du serveur entrent, des listes sans doublon sortent.
 */

type Label = { displayName: string | null; handle: string | null }

export type IcomProClient = { personKey: string; label: Label; threadId: string; lastMessageAt: number }
export type IcomProSupplier = { shopKey: string; name: string; handle: string; threadId: string; lastMessageAt: number }
export type IcomProPartner = { handle: string; displayName: string }

/** Le plus récent d'abord ; à date égale, l'ordre d'arrivée du serveur. */
function latestFirst<T extends { lastMessageAt: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}

export function icomProClientsOf(threads: readonly { threadId: string; requesterPersonId: string; requester: Label; lastMessageAt: number }[]): IcomProClient[] {
  const seen = new Map<string, IcomProClient>()
  for (const thread of latestFirst(threads)) {
    if (!seen.has(thread.requesterPersonId)) seen.set(thread.requesterPersonId, { personKey: thread.requesterPersonId, label: thread.requester, threadId: thread.threadId, lastMessageAt: thread.lastMessageAt })
  }
  return [...seen.values()]
}

export function icomProSuppliersOf(threads: readonly { threadId: string; shop: { shopId: string; name: string; handle: string }; lastMessageAt: number }[]): IcomProSupplier[] {
  const seen = new Map<string, IcomProSupplier>()
  for (const thread of latestFirst(threads)) {
    if (!seen.has(thread.shop.shopId)) seen.set(thread.shop.shopId, { shopKey: thread.shop.shopId, name: thread.shop.name, handle: thread.shop.handle, threadId: thread.threadId, lastMessageAt: thread.lastMessageAt })
  }
  return [...seen.values()]
}

/** L'autre partie de chaque collaboration acceptée : le destinataire de ce que j'ai proposé, l'auteur de ce que j'ai reçu. */
export function icomProPartnersOf(
  sent: readonly { status: string; to: IcomProPartner }[],
  received: readonly { status: string; from: IcomProPartner }[],
): IcomProPartner[] {
  const seen = new Map<string, IcomProPartner>()
  for (const partner of [...sent.filter((row) => row.status === "accepted").map((row) => row.to), ...received.filter((row) => row.status === "accepted").map((row) => row.from)]) {
    if (!seen.has(partner.handle)) seen.set(partner.handle, partner)
  }
  return [...seen.values()]
}
