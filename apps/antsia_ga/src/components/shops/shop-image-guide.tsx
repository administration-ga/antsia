"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

/** Conseils au point de préparation ; les offres commerciales restent publiées depuis leur source. */
export function ShopImageGuide({ products = false }: { products?: boolean }) {
  const { t } = useTranslation("shops")
  const id = useId()
  return <section aria-labelledby={id} className="grid min-w-0 gap-2 text-sm" data-shop-image-guide>
    <h3 id={id} className="font-semibold">{t("images.guideTitle")}</h3>
    <p className="text-muted-foreground">{t("images.guideLead")}</p>
    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
      <li>{t("images.guideSquare")}</li>
      <li>{t("images.guideSubject")}</li>
      <li>{t("images.guideEdges")}</li>
    </ul>
    {products ? <p className="text-muted-foreground">{t("images.productSource")}</p> : null}
  </section>
}
