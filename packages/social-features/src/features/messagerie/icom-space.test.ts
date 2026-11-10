// @vitest-environment node
import { describe, expect, it } from "vitest"

import { icomProActivityFrom, icomProHref, icomSpaceHref, icomSpaceOf } from "./icom-space"
import { icomProAvailabilityOf } from "./use-icom-pro"

describe("ADR-0036 — les deux espaces de la messagerie", () => {
  it("une conversation de boutique ou une mise en relation ouvre toujours iCom Pro", () => {
    expect(icomSpaceOf({ proConversation: true, rawSpace: null, proAvailable: false })).toBe("pro")
  })
  it("l'adresse ouvre iCom Pro seulement si l'espace existe pour la personne", () => {
    expect(icomSpaceOf({ proConversation: false, rawSpace: "pro", proAvailable: true })).toBe("pro")
    expect(icomSpaceOf({ proConversation: false, rawSpace: "pro", proAvailable: false })).toBe("personnel")
    expect(icomSpaceOf({ proConversation: false, rawSpace: "autre", proAvailable: true })).toBe("personnel")
    expect(icomSpaceOf({ proConversation: false, rawSpace: null, proAvailable: true })).toBe("personnel")
  })
  it("iCom garde les adresses nues des vues ; iCom Pro y ajoute espace=pro", () => {
    expect(icomSpaceHref("personnel", "conversations", "/messages")).toBe("/messages")
    expect(icomSpaceHref("personnel", "appels", "/messages")).toBe("/messages?brique=iappel")
    expect(icomSpaceHref("pro", "conversations", "/messages")).toBe("/messages?espace=pro")
    expect(icomSpaceHref("pro", "contacts", "/messages")).toBe("/messages?brique=icontact&espace=pro")
  })
  it("l'activité d'une adresse est bornée, jamais recopiée telle quelle", () => {
    expect(icomProActivityFrom("achats")).toBe("achats")
    expect(icomProActivityFrom("kd7abc123_-x")).toBe("kd7abc123_-x")
    expect(icomProActivityFrom("<script>")).toBeNull()
    expect(icomProActivityFrom("x".repeat(65))).toBeNull()
    expect(icomProActivityFrom(null)).toBeNull()
    expect(icomProHref("/messages")).toBe("/messages?espace=pro")
    expect(icomProHref("/messages", "relations")).toBe("/messages?espace=pro&activite=relations")
    expect(icomProHref("/messages", "../x")).toBe("/messages?espace=pro")
  })
  it("une seule activité pro suffit ; sans réponse complète, la bascule attend", () => {
    expect(icomProAvailabilityOf([false, null, true])).toBe(true)
    expect(icomProAvailabilityOf([false, false, false])).toBe(false)
    expect(icomProAvailabilityOf([false, null, false])).toBeNull()
    expect(icomProAvailabilityOf([])).toBe(false)
  })
})
