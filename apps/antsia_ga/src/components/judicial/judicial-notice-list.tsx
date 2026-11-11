import { Info, Scale } from "lucide-react"

/**
 * SU01h — le correctif épinglé et l'étiquette d'origine ordonnés par le juge, tels qu'ils se lisent
 * AU-DESSUS du contenu ou du profil. Composant de présentation sans état ni texte propre : les écrans
 * membres (`judicial-notices.tsx`) et publics (`public-judicial-notices.tsx`) lui passent leurs libellés.
 */
export type JudicialNoticeItem = { kind: "pin_correction" | "origin_label"; text: string; startsAt: number }
export type JudicialNoticeLabels = { region: string; correction: string; origin: string }

export function JudicialNoticeList({ notices, labels }: { notices: readonly JudicialNoticeItem[]; labels: JudicialNoticeLabels }) {
  if (notices.length === 0) return null
  return <aside aria-label={labels.region} data-judicial-notices="" className="flex min-w-0 flex-col gap-2">
    {notices.map((notice) => notice.kind === "pin_correction"
      ? <section key={`${notice.kind}:${notice.startsAt}:${notice.text}`} className="min-w-0 rounded-[var(--ui2-card-radius)] border border-border bg-muted p-3 text-sm">
          <p className="m-0 flex items-center gap-2 font-semibold"><Scale aria-hidden="true" className="size-4 shrink-0" />{labels.correction}</p>
          <p className="m-0 mt-1 whitespace-pre-wrap break-words">{notice.text}</p>
        </section>
      : <p key={`${notice.kind}:${notice.startsAt}:${notice.text}`} className="m-0 flex min-w-0 items-start gap-2 rounded-[var(--ui2-card-radius)] border border-border px-3 py-2 text-xs">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words"><span className="font-semibold">{labels.origin}</span> {notice.text}</span>
        </p>)}
  </aside>
}
