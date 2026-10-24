import { api } from "@antsia/api/engine"
import { useQuery } from "convex/react"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { BusinessMedia } from "../components/business-media"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Screen, Status, useNativeGuard } from "../components/ui"
import { nativeBusinessContactAllowed, nativeBusinessMoney, nativeBusinessOfferTarget, nativeBusinessPrice, nativeBusinessText, nativeDemoOffer, type NativeBusinessOffer } from "../lib/native-business"

type OfferScreenProps = {
  handle: string
  offerRef: string
  onOpenShop: (handle: string) => void
  onOpenPage?: (handle: string) => void
  onOpenWebOffer?: (handle: string, offerRef: string) => void
}
function DemoNotice() {
  const { t } = useNativeAppearance()
  return <Card><Label strong>{t("mobile.business.demoTitle")}</Label><Label muted>{t("mobile.business.demoNotice")}</Label></Card>
}
/** Cards only navigate with the exact opaque identifier returned by the guarded DTO. */
export function BusinessOfferCard({ offer, onOpenOffer, onOpenShop }: { offer: NativeBusinessOffer; onOpenOffer?: (handle: string, offerRef: string) => void; onOpenShop?: (handle: string) => void }) {
  const guard = useNativeGuard(), { t, locale } = useNativeAppearance()
  const target = nativeBusinessOfferTarget(offer.shopHandle, offer.offerRef)
  if (!guard.canRead) return null
  return <Card>
    <BusinessMedia media={offer.media} compact />
    <Label strong accessibilityRole="header">{offer.title}</Label>
    <Label strong>{nativeBusinessPrice(offer.price, locale, t)}</Label>
    <Label>{offer.description}</Label>
    {nativeDemoOffer(offer.offerRef) ? <Label muted>{t("mobile.business.demoTitle")}</Label> : null}
    {onOpenOffer ? <Action label={t("mobile.business.openOffer")} accessibilityLabel={`${t("mobile.business.openOffer")} · ${offer.title}`} disabled={!guard.canAct || !target} onPress={() => { if (guard.current() && target) onOpenOffer(target.handle, target.offerRef) }} /> : null}
    {onOpenShop ? <Action label={t("mobile.business.openShop")} accessibilityLabel={`${t("mobile.business.openShop")} · ${offer.shopHandle}`} disabled={!guard.canAct || !target} onPress={() => { if (guard.current() && target) onOpenShop(target.handle) }} /> : null}
  </Card>
}
function DetailList({ title, items }: { title: string; items: readonly string[] }) {
  return items.length ? <View style={{ gap: 4 }}><Label strong>{title}</Label>{items.map((item, index) => <Label key={index}>{item}</Label>)}</View> : null
}
function OfferBody({ handle, offerRef, onOpenShop, onOpenPage, onOpenWebOffer }: OfferScreenProps) {
  const guard = useNativeGuard(), { t, locale } = useNativeAppearance()
  const target = nativeBusinessOfferTarget(handle, offerRef)
  const offer = useQuery(api.modules.shops.catalog.offer, guard.canRead && target ? { networkId: guard.runtime.networkId, ...target } : "skip")
  if (!guard.canRead) return <RuntimeNotice />
  if (!target) return <Label>{t("mobile.business.unavailable")}</Label>
  if (offer === undefined) return <Status label={t("mobile.business.loading")} busy />
  if (offer === null || offer.shopHandle !== target.handle || offer.offerRef !== target.offerRef) return <Label>{t("mobile.business.unavailable")}</Label>
  const demo = guard.runtime.webBasePath === "/demo" || nativeDemoOffer(offer.offerRef)
  const canContinue = nativeBusinessContactAllowed(offer, demo) && onOpenWebOffer !== undefined
  const availability = offer.availability
  const stale = availability.stale || (availability.updatedAt !== null && Date.now() - availability.updatedAt > 15 * 60_000)
  const availabilityKey = stale ? "availabilityStale" : availability.updatedAt === null ? "availabilityUnknown" : availability.state === "in_stock" ? "availabilityInStock" : availability.state === "out_of_stock" ? "availabilityOutOfStock" : "availabilityUnknown"
  const profile = offer.serviceProfile
  return <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} scrollEnabled={guard.canAct}>
    <RuntimeNotice />
    {demo ? <DemoNotice /> : null}
    <Card>
      <Label strong accessibilityRole="header">{offer.title}</Label>
      <BusinessMedia media={offer.media} />
      <Label strong>{nativeBusinessPrice(offer.price, locale, t)}</Label>
      <Label>{offer.description}</Label>
      <Label muted>{t(`mobile.business.${availabilityKey}`)}</Label>
      {offer.leadTimeDays !== null ? <Label muted>{nativeBusinessText(t, "leadTime", { days: offer.leadTimeDays })}</Label> : null}
      {offer.zone ? <Label>{t("mobile.business.serviceArea") + " · " + offer.zone}</Label> : null}
      {offer.collections.length ? <DetailList title={t("mobile.business.collections")} items={offer.collections.map(collection => collection.label)} /> : null}
      {offer.tags.length ? <Label muted>{offer.tags.join(" · ")}</Label> : null}
    </Card>
    {offer.variants.length ? <Card>
      <Label strong accessibilityRole="header">{t("mobile.business.variants")}</Label>
      {offer.variants.map(variant => {
        const amount = nativeBusinessMoney(variant.amount, locale), unit = variant.unit ?? (offer.price.mode === "unit" || offer.price.mode === "range" ? offer.price.unit : undefined)
        const price = amount && unit ? nativeBusinessText(t, "priceUnit", { amount, unit }) : amount ?? t("mobile.business.priceUnavailable")
        return <View key={variant.variantRef} style={{ gap: 4 }}>
          <Label strong>{variant.label}</Label><Label>{variant.options.join(" · ")}</Label><Label>{price}</Label>
          <Label muted>{t(`mobile.business.${stale ? "availabilityStale" : availability.updatedAt === null ? "availabilityUnknown" : variant.availability === "in_stock" ? "availabilityInStock" : variant.availability === "out_of_stock" ? "availabilityOutOfStock" : "availabilityUnknown"}`)}</Label>
        </View>
      })}
    </Card> : null}
    {profile ? <Card>
      <Label strong accessibilityRole="header">{t("mobile.business.serviceDetails")}</Label>
      <DetailList title={t("mobile.business.languages")} items={profile.languageCodes} />
      <DetailList title={t("mobile.business.serviceArea")} items={profile.zones.map(zone => zone.locality)} />
      <DetailList title={t("mobile.business.deliverables")} items={profile.deliverables} />
      <DetailList title={t("mobile.business.inclusions")} items={profile.inclusions} />
      <DetailList title={t("mobile.business.exclusions")} items={profile.exclusions} />
      {profile.portfolio.map((item, index) => <View key={index} style={{ gap: 4 }}><Label strong>{item.title}</Label><Label>{item.description}</Label></View>)}
    </Card> : null}
    <Card>
      {canContinue ? <><Label muted>{t("mobile.business.contactOnWeb")}</Label><Action label={t("mobile.business.continueOnWeb")} disabled={!guard.canAct} onPress={() => { if (guard.current() && nativeBusinessContactAllowed(offer, guard.runtime.webBasePath === "/demo")) onOpenWebOffer?.(target.handle, target.offerRef) }} /></> : <Label muted>{t(demo ? "mobile.business.demoNotice" : "mobile.business.commercialUnavailable")}</Label>}
      <Action label={t("mobile.business.openShop")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenShop(target.handle) }} />
      {onOpenPage ? <Action label={t("mobile.business.openPage")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPage(target.handle) }} /> : null}
    </Card>
  </ScrollView>
}
export function OfferScreen(props: OfferScreenProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = JSON.stringify([guard.owner, props.handle, props.offerRef, version])
  return <Screen title={t("mobile.business.offerTitle")}>
    <Action label={t("mobile.business.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setVersion(value => value + 1) }} />
    <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.business.error")} error /></Card>}><OfferBody {...props} /></QueryBoundary>
  </Screen>
}
