import { describe, expect, it } from "vitest"
import fr from "./fr.json"
import en from "./en.json"
import entryFr from "./entry.fr.json"
import entryEn from "./entry.en.json"
import feedFr from "./feed.fr.json"
import feedEn from "./feed.en.json"
import profileFr from "./profile.fr.json"
import profileEn from "./profile.en.json"
import navigationFr from "./navigation.fr.json"
import navigationEn from "./navigation.en.json"
import safetyFr from "./safety.fr.json"
import safetyEn from "./safety.en.json"

// Chaque paire chargée par `appearance.tsx` ; une clé ne vit que dans un seul fichier.
const PAIRS: Readonly<Record<string, readonly [Record<string, string>, Record<string, string>]>> = {
  main: [fr, en], entry: [entryFr, entryEn], feed: [feedFr, feedEn], profile: [profileFr, profileEn], navigation: [navigationFr, navigationEn], safety: [safetyFr, safetyEn],
}
const variables = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/gu)].map(match => match[1]).sort()

describe("native locale contract", () => {
  it("offers the same nonempty messages in French and English", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
    for (const messages of [fr, en]) {
      expect(Object.values(messages).every((value) => value.trim().length > 0)).toBe(true)
    }
  })

  it("garde, pour chaque fichier, les mêmes clés, aucun texte vide et les mêmes variables dans les deux langues", () => {
    for (const [name, [french, english]] of Object.entries(PAIRS)) {
      expect(Object.keys(french).sort(), name).toEqual(Object.keys(english).sort())
      for (const [key, text] of Object.entries(french)) {
        expect(text.trim().length, `${name} : ${key}`).toBeGreaterThan(0)
        expect(english[key]!.trim().length, `${name} : ${key}`).toBeGreaterThan(0)
        expect(variables(english[key]!), `${name} : ${key}`).toEqual(variables(text))
      }
    }
  })

  it("ne déclare aucune clé dans deux fichiers (la dernière chargée écraserait l'autre)", () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const [name, [french]] of Object.entries(PAIRS)) {
      for (const key of Object.keys(french)) {
        const first = seen.get(key)
        if (first) duplicates.push(`${key} (${first}, ${name})`)
        else seen.set(key, name)
      }
    }
    expect(duplicates).toEqual([])
  })
})
