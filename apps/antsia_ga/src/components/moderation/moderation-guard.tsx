"use client"

import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { createModerationLock } from "./moderation-model"

type Guard = { set: (id: string, dirty: boolean) => void; remove: (id: string) => void; canLeave: () => boolean; acquire: () => boolean; release: () => void; pending: boolean }
const Context = createContext<Guard | null>(null)

export function ModerationGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation("memberNetwork")
  const phrases = useRef(t)
  useEffect(() => { phrases.current = t }, [t])
  const drafts = useRef(new Set<string>())
  const lock = useMemo(() => createModerationLock(), [])
  const [pending, setPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const admittedHref = useRef<string | null>(null)
  useEffect(() => { admittedHref.current = window.location.href })
  const registry = useMemo(() => ({
    set: (id: string, changed: boolean) => { if (changed) drafts.current.add(id); else drafts.current.delete(id); setDirty(drafts.current.size > 0) },
    remove: (id: string) => { drafts.current.delete(id); setDirty(drafts.current.size > 0) },
    canLeave: () => {
      if (isSigningOutEverywhere()) return true
      if (lock.pending()) { toast.info(phrases.current("moderation.pendingBlocked")); return false }
      return drafts.current.size === 0 || window.confirm(phrases.current("moderation.discard"))
    },
    acquire: () => { if (!lock.acquire()) return false; setPending(true); return true },
    release: () => { lock.release(); setPending(false) },
  }), [lock])
  useEffect(() => {
    admittedHref.current = window.location.href
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isSigningOutEverywhere() || (!lock.pending() && drafts.current.size === 0)) return
      event.preventDefault(); event.returnValue = ""
    }
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented || anchor.href === window.location.href || anchor.target === "_blank") return
      if (!registry.canLeave()) { event.preventDefault(); event.stopPropagation() }
      else admittedHref.current = anchor.href
    }
    const pop = () => { if (!registry.canLeave()) { if (admittedHref.current) window.history.pushState(window.history.state, "", admittedHref.current) } else admittedHref.current = window.location.href }
    window.addEventListener("beforeunload", beforeUnload)
    document.addEventListener("click", click, true)
    window.addEventListener("popstate", pop)
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", click, true); window.removeEventListener("popstate", pop) }
  }, [lock, registry])
  return <Context.Provider value={{ ...registry, pending }}>
    {dirty || pending ? <p role="status" className="border-b border-transparent bg-muted px-4 py-3 text-sm">{t(pending ? "moderation.pendingNotice" : "moderation.draftNotice")}</p> : null}
    {children}
  </Context.Provider>
}

export function useModerationGuard() {
  const context = useContext(Context)
  if (!context) throw new Error("ModerationGuard is required")
  return context
}

export function useModerationDraft(dirty: boolean) {
  const id = useId()
  const registry = useModerationGuard()
  const { set, remove } = registry
  useEffect(() => { set(id, dirty) }, [dirty, id, set])
  useEffect(() => () => { remove(id) }, [id, remove])
}
