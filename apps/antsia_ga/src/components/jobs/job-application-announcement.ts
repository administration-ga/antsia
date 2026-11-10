"use client"

import { useTranslation } from "react-i18next"
import { useBusinessAnnouncement } from "@/lib/use-business-announcement"
import type { MyApplication } from "./job-model"

/** No titles, names, attachment identifiers, timestamps or personal text enter the live region. */
export function useJobApplicationAnnouncement(application: MyApplication | null, includeFileTransfers = false): string {
  const { t } = useTranslation("jobs")
  return useBusinessAnnouncement(application?.applicationId ?? "", application ? {
    state: application.state, candidateState: application.state === "submitted" ? application.candidateState ?? "" : "",
    rejection: application.rejection ?? "", remoteUnconfirmed: String(application.remoteUnconfirmed),
    files: includeFileTransfers ? JSON.stringify(application.files.map(file => [file.kind, file.transfer]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))) : "",
  } : null, changed => {
    if (!application) return ""
    const parts: string[] = []
    if (changed.includes("state") || changed.includes("candidateState")) parts.push(application.state === "submitted" && application.candidateState
      ? t(`applications.candidateState.${application.candidateState}`) : t(`applications.state.${application.state}`))
    if (changed.includes("rejection") && application.rejection) parts.push(t(`applications.rejection.${application.rejection}`))
    if (changed.includes("remoteUnconfirmed")) parts.push(t(application.remoteUnconfirmed ? "applications.remoteUnconfirmed" : "applications.announcements.remoteUpdated"))
    if (changed.includes("files")) {
      const transfers = application.files.map(file => t(`files.kind.${file.kind}`) + " : " + t(`applications.transfer.${file.transfer}`))
      parts.push(...[...new Set(transfers)].sort())
    }
    return parts.length ? t("applications.announcements.changed", { changes: parts.join(" ; ") }) : ""
  })
}
