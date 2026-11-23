// Dupliqué de socle/convex/tests/clientAddressKey.test.ts (l. 1-83) @ 1379d45f9 — adaptations : la règle seule (IPv4, IPv6 en /64, IPv4 écrite en IPv6, adresse introuvable, lecture de la requête) ; score de menace et surfaces du socle non repris (absents du moteur).
/** CH-817 — la clé d'adresse des limites de débit de la porte des comptes de démonstration. */
import { describe, expect, it } from "vitest"

import { clientAddressKey, getClientAddressKey, getTrustedClientIp, isUnknownClientAddress, UNKNOWN_CLIENT_ADDRESS } from "./httpAddress"

describe("clientAddressKey — la règle", () => {
  it("IPv4 : l'adresse elle-même", () => {
    expect(clientAddressKey("203.0.113.7")).toBe("203.0.113.7")
    expect(clientAddressKey(" 203.0.113.7 ")).toBe("203.0.113.7")
  })

  it("IPv6 : le préfixe /64, quelle que soit l'écriture", () => {
    expect(clientAddressKey("2a0d:e487:011f:42c0:1:2:3:4")).toBe("2a0d:e487:11f:42c0::/64")
    expect(clientAddressKey("2A0D:E487:11F:42C0::FFFF")).toBe("2a0d:e487:11f:42c0::/64")
    expect(clientAddressKey("2001:db8::1")).toBe("2001:db8:0:0::/64")
    expect(clientAddressKey("fe80::1%en0")).toBe("fe80:0:0:0::/64")
    // Deux adresses du même /64 : une seule clé.
    expect(clientAddressKey("2001:db8:aa:bb::1")).toBe(clientAddressKey("2001:db8:aa:bb:dead:beef:0:9"))
    // Deux /64 voisins : deux clés.
    expect(clientAddressKey("2001:db8:aa:bb::1")).not.toBe(clientAddressKey("2001:db8:aa:bc::1"))
  })

  it("IPv4 écrite en IPv6 : redevient IPv4", () => {
    expect(clientAddressKey("::ffff:198.51.100.9")).toBe("198.51.100.9")
    expect(clientAddressKey("::FFFF:C633:6409")).toBe("198.51.100.9")
  })

  it("adresse vide ou introuvable : « unknown » ; illisible : gardée telle quelle", () => {
    expect(clientAddressKey("")).toBe(UNKNOWN_CLIENT_ADDRESS)
    expect(clientAddressKey("   ")).toBe(UNKNOWN_CLIENT_ADDRESS)
    expect(clientAddressKey("unknown")).toBe(UNKNOWN_CLIENT_ADDRESS)
    expect(clientAddressKey("1:2:3")).toBe("1:2:3")
    expect(clientAddressKey("pas-une-adresse")).toBe("pas-une-adresse")
    expect(isUnknownClientAddress(clientAddressKey(""))).toBe(true)
    expect(isUnknownClientAddress(clientAddressKey("203.0.113.7"))).toBe(false)
  })

  it("depuis la requête : dernière entrée de X-Forwarded-For, puis la clé", () => {
    const request = new Request("https://exemple.test/", {
      headers: { "x-forwarded-for": "198.51.100.1, 2001:db8:aa:bb::42" },
    })
    expect(getTrustedClientIp(request)).toBe("2001:db8:aa:bb::42")
    expect(getClientAddressKey(request)).toBe("2001:db8:aa:bb::/64")
    expect(getClientAddressKey(new Request("https://exemple.test/"))).toBe(UNKNOWN_CLIENT_ADDRESS)
    // Une première entrée écrite par l'appelant ne déplace pas la clé.
    const spoofed = new Request("https://exemple.test/", { headers: { "x-forwarded-for": "203.0.113.200, 198.51.100.1" } })
    expect(getClientAddressKey(spoofed)).toBe("198.51.100.1")
  })
})
