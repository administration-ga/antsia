import { describe, expect, it } from "vitest"

import { icomProClientsOf, icomProPartnersOf, icomProSuppliersOf } from "./icom-pro-contacts-model"

const label = (displayName: string) => ({ displayName, handle: displayName.toLowerCase() })

describe("ADR-0036 — contacts d'iCom Pro dérivés des échanges", () => {
  it("un client par personne, sa conversation la plus récente d'abord", () => {
    const clients = icomProClientsOf([
      { threadId: "t1", requesterPersonId: "p1", requester: label("Inès"), lastMessageAt: 10 },
      { threadId: "t2", requesterPersonId: "p2", requester: label("Kévin"), lastMessageAt: 30 },
      { threadId: "t3", requesterPersonId: "p1", requester: label("Inès"), lastMessageAt: 20 },
    ])
    expect(clients.map((client) => [client.personKey, client.threadId])).toEqual([["p2", "t2"], ["p1", "t3"]])
  })
  it("une boutique contactée par boutique, la plus récente d'abord", () => {
    const suppliers = icomProSuppliersOf([
      { threadId: "a", shop: { shopId: "s1", name: "Épicerie", handle: "epicerie" }, lastMessageAt: 5 },
      { threadId: "b", shop: { shopId: "s1", name: "Épicerie", handle: "epicerie" }, lastMessageAt: 9 },
      { threadId: "c", shop: { shopId: "s2", name: "Studio", handle: "studio" }, lastMessageAt: 7 },
    ])
    expect(suppliers.map((supplier) => [supplier.shopKey, supplier.threadId])).toEqual([["s1", "b"], ["s2", "c"]])
  })
  it("les partenaires : l'autre partie des collaborations acceptées, sans doublon ni refus", () => {
    const partners = icomProPartnersOf(
      [{ status: "accepted", to: { handle: "awa", displayName: "Awa MBA" } }, { status: "declined", to: { handle: "x", displayName: "X" } }],
      [{ status: "accepted", from: { handle: "awa", displayName: "Awa MBA" } }, { status: "accepted", from: { handle: "jean", displayName: "Jean-Rémy NDONG" } }],
    )
    expect(partners.map((partner) => partner.handle)).toEqual(["awa", "jean"])
  })
})
