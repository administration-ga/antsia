"use client"

import { formatViewerDate } from "@antsia/api/civil-date"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api } from "@convex/_generated/api"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Scale } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card } from "@/components/shared/controls"

type PersonalMeasure = FunctionReturnType<typeof api.modules.moderation.measures.myJudicialMeasures>["personal"][number]
const NAMED_TARGETS = new Set(["person", "page", "post", "comment", "story", "network"])

/**
 * SU01h — « Mes données » : les mesures sur décision de justice qui visent la personne (son compte ou
 * l'un de ses contenus), et les mesures générales de l'art. 44 en vigueur sur ses réseaux, avec leurs
 * dates et le texte affiché. Ni la référence de la décision, ni l'opérateur : la décision se demande au
 * greffe. Rien ne s'affiche s'il n'y a aucune mesure.
 */
export function MyJudicialMeasures() {
  const { t } = useTranslation("antsia")
  const measures = useQuery(api.modules.moderation.measures.myJudicialMeasures, {})
  if (!measures || (measures.personal.length === 0 && measures.general.length === 0)) return null
  return <Card>
    <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold"><Scale aria-hidden="true" className="size-5 shrink-0" />{t("judicial.mine.title")}</h2>
    <p className="mb-4 text-sm text-muted-foreground">{t("judicial.mine.lead")}</p>
    {measures.personal.length ? <ul className="flex flex-col gap-3">{measures.personal.map((measure) => <MeasureItem key={measure.measureId} measure={measure} />)}</ul> : null}
    {measures.general.length ? <section className="mt-4"><h3 className="font-semibold">{t("judicial.mine.generalTitle")}</h3><p className="mb-3 text-sm text-muted-foreground">{t("judicial.mine.generalLead")}</p><ul className="flex flex-col gap-3">{measures.general.map((measure) => <MeasureItem key={measure.measureId} measure={measure} />)}</ul></section> : null}
  </Card>
}

function MeasureItem({ measure }: { measure: PersonalMeasure }) {
  const { t, i18n } = useTranslation("antsia")
  const zone = useViewerTimeZone()
  const date = (at: number) => formatViewerDate(at, i18n.language, { dateStyle: "long", timeStyle: "short" }, zone)
  const target = NAMED_TARGETS.has(measure.targetKind) ? t(`judicial.mine.targets.${measure.targetKind}`, { network: measure.networkName ?? "" }) : t("judicial.mine.targets.other")
  return <li className="rounded-[var(--ui2-card-radius)] border border-border p-4">
    <p className="font-medium">{t(`judicial.mine.kinds.${measure.kind}`)}</p>
    <p className="text-sm text-muted-foreground">{target}{measure.feature ? ` · ${t(`judicial.features.${measure.feature}`)}` : ""}</p>
    <p className="mt-2 text-sm">{t("judicial.mine.since", { date: date(measure.startsAt) })} · {measure.status === "active" ? (measure.endsAt !== null ? t("judicial.mine.until", { date: date(measure.endsAt) }) : t("judicial.mine.untilLifted")) : measure.liftedAt !== null ? t(measure.liftCause === "expired" ? "judicial.mine.liftedExpired" : "judicial.mine.lifted", { date: date(measure.liftedAt) }) : null}</p>
    <p className="text-xs text-muted-foreground">{t(measure.status === "active" ? "judicial.mine.active" : "judicial.mine.ended")}</p>
    {measure.correctionText ? <p className="mt-2 whitespace-pre-wrap break-words text-sm"><span className="font-medium">{t("judicial.mine.correction")}</span> {measure.correctionText}</p> : null}
    {measure.originLabel ? <p className="mt-2 break-words text-sm"><span className="font-medium">{t("judicial.mine.origin")}</span> {measure.originLabel}</p> : null}
  </li>
}
