"use client"

import { useEffect, useRef, useState } from "react"

export type BusinessAnnouncementFacts = Readonly<Record<string, string>>

/**
 * Announce only changed facts observed while the same record remains mounted.
 * Callers own authority and mount boundaries; no persistence or session management.
 */
export function useBusinessAnnouncement(
  subjectKey: string,
  facts: BusinessAnnouncementFacts | null,
  describe: (changed: readonly string[]) => string,
  enabled = true,
): string {
  const previous = useRef<{ subjectKey: string; facts: BusinessAnnouncementFacts } | null>(null)
  const [announcement, setAnnouncement] = useState<{ subjectKey: string; text: string } | null>(null)
  useEffect(() => {
    const before = previous.current
    const next = enabled && facts ? { subjectKey, facts: { ...facts } } : null
    previous.current = next
    if (!next || !before || before.subjectKey !== subjectKey) {
      setAnnouncement(null)
      return
    }
    const changed = Object.keys(next.facts).filter(key => before.facts[key] !== next.facts[key])
    if (changed.length === 0) return
    const text = describe(changed)
    setAnnouncement(current => current?.subjectKey === subjectKey && current.text === text ? current : { subjectKey, text })
  }, [subjectKey, facts, describe, enabled])
  return enabled && facts && announcement?.subjectKey === subjectKey ? announcement.text : ""
}
