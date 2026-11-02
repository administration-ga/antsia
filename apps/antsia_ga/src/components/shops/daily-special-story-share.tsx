"use client"

import { api, type Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { markStoriesOpenedFromApp } from "@antsia/social-features/features/stories/stories-entry"
import { useMutation } from "convex/react"
import { Send } from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, buttonClassName } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { useShopAction } from "./shop-ui"

/** Un geste de publication séparé de la désignation du plat ; le serveur relit cette sélection attendue. */
export function DailySpecialStoryShare({ shopId, offerRef, day, title, available, dirty }: { shopId: Id<"shops">; offerRef: string; day: string; title: string | null; available: boolean; dirty: boolean }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const id = useId()
  const action = useShopAction()
  const publish = useMutation(api.modules.stories.stories.publishDailySpecial)
  const [published, setPublished] = useState<"created" | "existing" | null>(null)
  return <section aria-labelledby={`${id}-title`} className="grid gap-3 border-t border-border pt-4" data-daily-special-story-share>
    <div className="grid gap-1">
      <h4 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold"><Send className="size-4 shrink-0" aria-hidden />{t("dailySpecial.story.title")}</h4>
      <p className="text-sm text-muted-foreground">{t("dailySpecial.story.lead")}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="commerce" pending={action.pending} disabled={dirty || !available} aria-label={title ? t("dailySpecial.story.shareNamed", { title }) : t("dailySpecial.story.share")} onClick={() => {
        if (dirty || !available) return
        setPublished(null)
        void action.run(() => publish({ networkId, shopId, expectedOfferRef: offerRef, expectedDay: day }), result => setPublished(result.created ? "created" : "existing"))
      }}><Send className="size-4 shrink-0" aria-hidden />{t("dailySpecial.story.share")}</Button>
      {published ? <Link href={routes.stories()} onClick={markStoriesOpenedFromApp} className={buttonClassName("outline")}>{t("dailySpecial.story.open")}</Link> : null}
    </div>
    {dirty ? <p className="text-sm text-muted-foreground">{t("link.saveFirst")}</p> : !available ? <p className="text-sm text-muted-foreground">{t("dailySpecial.story.unavailable")}</p> : null}
    {published ? <p role="status" className="text-sm">{t(`dailySpecial.story.${published}`)}</p> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
  </section>
}
