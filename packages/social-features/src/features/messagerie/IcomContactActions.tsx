"use client"

import { Search } from "lucide-react"
import { createContext, useContext, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

export type IcomContactOrigin = "message" | "groupe"

/** Each host supplies its member directory, system sharing and public invitation link. */
export interface IcomContactTools {
  readonly findMembers: (origin: IcomContactOrigin) => string
  readonly smsEntry?: ReactNode
  readonly inviteButton: ReactNode
  readonly shareLink: (
    href: string, channel: "share" | "sms" | "copy", title?: string,
  ) => Promise<"shared" | "copied" | "opened" | "cancelled">
}

const ContactTools = createContext<IcomContactTools | null>(null)
export const IcomContactToolsProvider = ContactTools.Provider

export function useIcomContactTools() {
  return useContext(ContactTools)
}

export function IcomContactActions({ origin, fallback, message }: { origin: IcomContactOrigin; fallback: ReactNode; message?: string }) {
  const tools = useIcomContactTools()
  const { t } = useTranslation("messagerie")
  if (!tools) return <>{fallback}</>
  return (
    <div className="msg-contact-empty">
      <p className="msg-empty">{message ?? t(origin === "groupe" ? "messagerieComposeView.emptyGroup" : "messagerieComposeView.emptyContacts")}</p>
      <div className="msg-contact-actions">
        <a className="msg-group-btn" href={tools.findMembers(origin)}>
          <Search aria-hidden="true" size={16} /> {t("messagerieComposeView.findMembers")}
        </a>
        {tools.inviteButton}
      </div>
    </div>
  )
}
