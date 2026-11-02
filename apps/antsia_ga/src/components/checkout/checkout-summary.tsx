"use client"

import type { CommerceCheckoutFee, CommerceCheckoutLineInput, CommerceCheckoutResult } from "@antsia/social-domain/commerce/command"
import { useTranslation } from "react-i18next"
import { Card } from "@/components/shared/controls"
import { checkoutAmount, checkoutComparison, checkoutDate } from "./checkout-model"

export function CheckoutSummary({ result, expected, expectedFees, expectedPolicyVersion, compare = false }: { result: CommerceCheckoutResult; expected: readonly CommerceCheckoutLineInput[]; expectedFees: readonly CommerceCheckoutFee[]; expectedPolicyVersion: number; compare?: boolean }) {
  const { t, i18n } = useTranslation("checkout")
  const locale = i18n.resolvedLanguage ?? "fr"
  const expectedTotal = expected.reduce((sum, line) => sum + line.expectedUnitAmount.amount * line.quantity, 0) + expectedFees.reduce((sum, fee) => sum + fee.amount.amount, 0)
  const feeList = (fees: readonly CommerceCheckoutFee[]) => fees.length
    ? <ul className="grid gap-1 text-sm">{fees.map((fee, index) => <li key={index} className="flex flex-wrap justify-between gap-x-3"><span>{fee.label}</span><span>{checkoutAmount(fee.amount.amount, locale)}</span></li>)}</ul>
    : <p className="text-sm">{t("noFees")}</p>
  return <Card><div className="grid gap-4">
    <h2 className="antsia-subtitle">{t("summary")}</h2>
    {checkoutComparison(expected, result.lines).map(({ before, after, changed }, index) => <section key={index} className="grid gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-[var(--esp-card-padding,16px)]">
      <h3 className="font-display text-base font-bold leading-snug">{after.label}</h3>
      {compare && changed ? <><p className="text-sm font-medium">{t("changed")}</p>{before ? <div className="grid gap-1"><h4 className="font-medium">{t("before")}</h4><p>{t("quantity")} : {before.quantity}</p><p>{t("unitAmount")} : {checkoutAmount(before.expectedUnitAmount.amount, locale)}</p><p>{t("revision", { revision: before.expectedCatalogRevision })}</p></div> : null}<h4 className="font-medium">{t("after")}</h4></> : null}
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm"><dt>{t("quantity")}</dt><dd>{after.quantity}</dd><dt>{t("unitAmount")}</dt><dd>{checkoutAmount(after.unitAmount.amount, locale)}</dd><dt>{t("lineAmount")}</dt><dd>{checkoutAmount(after.lineAmount.amount, locale)}</dd></dl>
      <p className="text-xs text-muted-foreground">{t("revision", { revision: after.catalogRevision })}</p>
    </section>)}
    <section className="grid gap-3">
      <h3 className="font-display text-base font-bold leading-snug">{t("fees")}</h3>
      {compare ? <div className="grid gap-2 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-[var(--esp-card-padding,16px)]"><h4 className="font-medium">{t("before")}</h4><p className="text-xs text-muted-foreground">{t("policyVersion", { version: expectedPolicyVersion })}</p>{feeList(expectedFees)}<p>{t("total")} : {checkoutAmount(expectedTotal, locale)}</p></div> : null}
      {compare ? <h4 className="font-medium">{t("after")}</h4> : null}
      {feeList(result.fees)}
    </section>
    <p className="text-lg font-semibold">{t("total")} : {checkoutAmount(result.total.amount, locale)}</p>
    <p>{t("expires", { date: checkoutDate(result.expiresAt, locale) })}</p>
    <p className="text-sm text-muted-foreground">{t("noPayment")}</p>
  </div></Card>
}
