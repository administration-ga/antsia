"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { CartContext } from "@convex/modules/shops/checkoutRules"
import { useAction, useConvex, useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckoutPreparationForm, type CheckoutCartLine, type CheckoutOptions, type CheckoutPrepareInput } from "@/components/checkout/checkout-form"
import { checkoutCartLines } from "@/components/checkout/checkout-model"
import { Button, Card } from "@/components/shared/controls"
import { Rail } from "@/components/shared/rail"
import { OfferCard } from "@/components/shops/offer-card"
import { ShopFrame, ShopLink, ShopLogo, useShopAction } from "@/components/shops/shop-ui"
import { StorefrontTerms } from "@/components/shops/storefront-terms"
import { CATALOG_PAGE_SIZE } from "@/lib/catalog-search"
import { cartIntentDigest, cartItemKey, type CartDraft, type CartItem } from "@/lib/cart-draft"
import { routes } from "@/lib/routes"
import { CART_LINES, CartBar, CartLayout, CartLine, CartSummary } from "./cart-layout"
import { OfferQuickAdd } from "./offer-quick-add"
import { useCartConnectivity, useCartDraft } from "./use-cart-draft"

/** Une boutique par panier, en pastilles qui défilent ; celle choisie prend la couleur du commerce (ADR-0027). */
const CART_PILL = "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--ui2-button-radius)] bg-[var(--esp-chip-bg,var(--muted))] px-4 text-sm font-semibold text-foreground hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-[var(--role-commerce-fill)] aria-pressed:text-[color:var(--role-commerce-on)]"

export function CartScreen() {
  const { t } = useTranslation("cart")
  const cart = useCartDraft()
  return <ShopFrame title={t("title")} lead={t("lead")}>
    <div className="flex flex-wrap gap-2"><ShopLink href={routes.purchases()}>{t("myPurchases")}</ShopLink></div>
    <p className="text-sm text-muted-foreground">{t("draftNotice")}</p>
    {cart.ready && cart.drafts.length ? <nav aria-label={t("cartsNavigation")} className="min-w-0 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><ul className="flex w-max gap-2">{cart.drafts.map(draft => <li key={draft.handle}><button type="button" aria-pressed={cart.selectedHandle === draft.handle} onClick={() => cart.select(draft.handle)} className={CART_PILL}><span>{t("seller", { handle: draft.handle })}</span><span className="font-normal">{t("lineCount", { count: draft.items.length })}</span></button></li>)}</ul></nav> : null}
    {cart.saveError ? <p role="alert">{t(cart.saveError === "drafts_full" ? "drafts_full" : cart.saveError === "conflict" ? "draftConflict" : "draftUnavailable")}</p> : null}
    {!cart.ready ? <p role="status">{t("loading")}</p> : cart.draft ? <CartContents key={JSON.stringify([cart.networkId, cart.personId, cart.draft.handle])} draft={cart.draft} save={cart.save} /> : <Card><p>{t("empty")}</p></Card>}
  </ShopFrame>
}

/**
 * Le panier d'une boutique, sur le modèle des ventes privées (décision du propriétaire du 22/10/2026) : ses lignes,
 * le récapitulatif et « Valider mon panier », qui relit prix, disponibilités et modes de remise avant d'ouvrir
 * l'étape de remise ; puis les conditions de la boutique et « Continuez vos achats ». Rien n'est envoyé sans le
 * formulaire de préparation et son accord explicite.
 */
function CartContents({ draft, save }: { draft: CartDraft; save: (draft: CartDraft | null) => boolean }) {
  const { t, i18n } = useTranslation("cart")
  const { networkId } = useCartDraft(draft.handle)
  const connectivity = useCartConnectivity()
  const router = useRouter()
  const convex = useConvex()
  const query = useAuthenticatedConvexQuery(api.modules.shops.checkout.cartContext, { networkId, handle: draft.handle, items: draft.items })
  const optionsAction = useAction(api.modules.shops.checkoutActions.options)
  const prepare = useAction(api.modules.shops.checkoutActions.prepare)
  const action = useShopAction()
  const [options, setOptions] = useState<CheckoutOptions | null>(null)
  const [checkedStamp, setCheckedStamp] = useState<string | null>(null)
  const [recover, setRecover] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const liveIntent = useRef<string | null>(null)
  const previousContext = useRef<CartContext | null>(null)
  const delivery = useRef<HTMLDivElement>(null)
  const openDelivery = useRef(false)
  if (!query.isError && query.data) previousContext.current = query.data
  const stamp = JSON.stringify([draft.items, connectivity.generation])
  const suspended = !connectivity.online || checkedStamp !== stamp || action.pending
  const submitted = draft.submitted
  const locale = i18n.resolvedLanguage ?? "fr"
  // Une panne conserve le formulaire en mémoire ; aucune ancienne capacité n'autorise l'envoi.
  const context = query.isError ? previousContext.current : query.data ?? previousContext.current
  const lines: CheckoutCartLine[] = context?.items.flatMap((item) => item.available && item.offer ? [{ offer: item.offer, quantity: item.quantity, ...(item.variantRef ? { variantRef: item.variantRef } : {}) }] : []) ?? []
  const first = lines[0]
  const deliveryOpen = !!(options && first && lines.length === draft.items.length && context && (!context.pending || !!submitted))
  // L'étape de remise vient d'être ouverte par « Valider mon panier » : la lecture y est conduite.
  useEffect(() => {
    if (!deliveryOpen || !openDelivery.current) return
    openDelivery.current = false
    delivery.current?.focus()
    delivery.current?.scrollIntoView?.({ block: "start" })
  }, [deliveryOpen])
  const edit = (items: CartItem[]) => {
    if (submitted) return
    setOptions(null); setCheckedStamp(null)
    if (!save(items.length ? { ...draft, items, updatedAt: Date.now() } : null)) setMessage("draftUnavailable")
  }
  const refresh = () => {
    if (!connectivity.online || !navigator.onLine) return
    void action.run(async () => {
      const fresh = await query.refetch()
      if (!action.current() || fresh.isError || !fresh.data?.available) return null
      return await optionsAction({ networkId, handle: draft.handle })
    }, (result) => {
      if (result?.outcome !== "ready") { setCheckedStamp(null); setMessage("unavailable"); return }
      openDelivery.current = true
      setOptions(result); setCheckedStamp(stamp); setMessage(null)
    })
  }
  const beforeResume = async (input: CheckoutPrepareInput) => {
    const result = await convex.query(api.modules.shops.checkout.findByClientRequestId, { networkId, clientRequestId: input.clientRequestId })
    if (!action.current()) throw new Error("cartSessionChanged")
    return result.outcome === "attempt" ? { outcome: "attempt" as const, attemptId: result.attempt.attemptId } : result.outcome === "stopped" ? { outcome: "refused" as const } : { outcome: "absent" as const }
  }
  const persistIntent = async (input: CheckoutPrepareInput) => {
    const digest = await cartIntentDigest({ networkId, handle: draft.handle, ...input })
    if (!action.current()) return false
    if (!digest || submitted && (submitted.clientRequestId !== input.clientRequestId || submitted.digest !== digest)) { setMessage("mismatch"); return false }
    liveIntent.current = input.clientRequestId
    const saved = save({ ...draft, updatedAt: Date.now(), submitted: submitted ?? { clientRequestId: input.clientRequestId, submittedAt: Date.now(), digest, expectedLines: input.lines, expectedPolicyVersion: input.expectedPolicyVersion } })
    if (!saved) { liveIntent.current = null; setMessage("draftUnavailable") }
    return saved
  }
  const stopped = () => { setRecover(false); setOptions(null); setCheckedStamp(null); liveIntent.current = null; setMessage(null) }
  if (submitted && liveIntent.current !== submitted.clientRequestId && !recover) return <SubmittedCart draft={draft} save={save} onRecover={() => setRecover(true)} onStopped={stopped} />
  // Le montant des articles à leur prix exact, variante comprise ; `null` dès qu'une ligne n'en a pas (ou manque).
  const prepared = lines.length === draft.items.length ? checkoutCartLines(lines) : null
  const itemsAmount = prepared ? prepared.reduce((sum, line) => sum + line.expectedUnitAmount.amount * line.quantity, 0) : null
  const articles = draft.items.reduce((sum, item) => sum + item.quantity, 0)
  // « Valider mon panier » relit prix, disponibilités et modes de remise ; ensuite (ou en reprise), « Relire ».
  const validate = <Button variant="commerce" pending={action.pending} disabled={!connectivity.online} onClick={refresh}>{t(deliveryOpen || submitted ? "refresh" : "validate")}</Button>
  return <CartLayout
    main={<>
      <CartShopHeader handle={draft.handle} />
      {!connectivity.online ? <p role="status">{t("offline")}</p> : null}
      {recover && submitted ? <Card><p>{t("recoverHint")}</p><SubmittedCart draft={draft} save={save} onRecover={() => setRecover(true)} onStopped={stopped} recovery /></Card> : null}
      {submitted && !recover ? <SubmittedCart draft={draft} save={save} onRecover={() => setRecover(true)} onStopped={stopped} recovery /> : null}
      <ul aria-label={t("linesLabel")} className={CART_LINES}>{draft.items.map((item) => {
        const current = context?.items.find((entry) => entry.offerRef === item.offerRef && (entry.variantRef ?? undefined) === item.variantRef)
        return <li key={cartItemKey(item)} className="min-w-0"><CartLine item={item} offer={current?.offer ?? null} available={current?.available === true} locked={!!submitted} locale={locale} update={(quantity) => edit(draft.items.map((entry) => cartItemKey(entry) === cartItemKey(item) ? { ...entry, quantity } : entry))} remove={() => edit(draft.items.filter((entry) => cartItemKey(entry) !== cartItemKey(item)))} /></li>
      })}</ul>
      {!submitted ? <Button variant="danger" className="justify-self-start" onClick={() => edit([])}>{t("clear")}</Button> : null}
      {query.isPending ? <p role="status">{t("loading")}</p> : null}
      {query.isError || context && !context.available ? <p role="alert">{t("unavailable")}</p> : null}
      {context?.pending && !submitted ? <Card><p>{t("found")}</p><ShopLink href={routes.checkoutAttempt(context.pending.attemptId)}>{t("openAttempt")}</ShopLink></Card> : null}
      {!deliveryOpen ? <CartBar articles={articles} amount={itemsAmount} locale={locale}>{validate}</CartBar> : null}
    </>}
    aside={<>
      <CartSummary articles={articles} amount={itemsAmount} locale={locale} everywhere={deliveryOpen}>{validate}</CartSummary>
      <CartShopTerms handle={draft.handle} />
    </>}
    after={<>
      {deliveryOpen && options && first && context ? <div ref={delivery} tabIndex={-1} role="region" aria-label={t("prepareTitle")} className="min-w-0 rounded-[var(--ui2-card-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-cart-delivery><CheckoutPreparationForm offer={first.offer} cartLines={lines} options={options} consentTextVersion={context.consentTextVersion} consentEpoch={JSON.stringify([stamp, options.policyVersion, lines.map((line) => [line.offer.revision, line.offer.price, line.offer.variants])])} suspended={suspended || !context.available || context.reason !== null || query.isError} recoveredRequestId={recover ? submitted?.clientRequestId : undefined} beforeResume={beforeResume} onIntent={persistIntent} prepare={(input) => prepare({ networkId, handle: draft.handle, ...input })} onAttempt={(attemptId) => {
        const original = draft.submitted
        if (original) save({ ...draft, updatedAt: Date.now(), submitted: { ...original, attemptId } })
        router.push(routes.checkoutAttempt(attemptId))
      }} stickyActions /></div> : null}
      {message ? <p role="alert" className="text-sm">{t(message)}</p> : null}{action.error ? <p role="alert">{t("unavailable")}</p> : null}
    </>}
    more={!submitted ? <ContinueShopping handle={draft.handle} exclude={new Set(draft.items.map(item => item.offerRef))} /> : null}
  />
}

/** La boutique du panier : son logo et son nom (sa vitrine lue), sinon son identifiant ; et le retour à la boutique. */
function CartShopHeader({ handle }: { handle: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("cart")
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, { networkId, handle })
  const shop = query.isError ? null : query.data ?? null
  return <div className="flex min-w-0 flex-wrap items-center gap-3" data-cart-shop>
    {shop ? <ShopLogo url={shop.logoUrl} name={shop.name} /> : null}
    <div className="grid min-w-0 flex-1 gap-0.5">
      <h2 className="truncate font-display text-xl font-bold">{shop?.name ?? t("seller", { handle })}</h2>
      {shop ? <p className="truncate text-sm text-muted-foreground">{t("seller", { handle })}</p> : null}
    </div>
    <ShopLink href={routes.storefront(handle)}>{t("backToShop")}</ShopLink>
  </div>
}

/** Les conditions déclarées par la boutique, sous le récapitulatif : la réassurance réelle, jamais supposée. */
function CartShopTerms({ handle }: { handle: string }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, { networkId, handle })
  if (query.isError || !query.data) return null
  return <StorefrontTerms value={query.data.storefrontTerms} locale={i18n.resolvedLanguage === "en" ? "en" : "fr"} t={t} compact />
}

/** « Continuez vos achats » : d'autres produits de la même boutique, absents du panier, avec l'ajout rapide. */
function ContinueShopping({ handle, exclude }: { handle: string; exclude: ReadonlySet<string> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("cart")
  const { t: shopT, i18n } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.list, { networkId, handle, kind: "product", paginationOpts: { cursor: null, numItems: CATALOG_PAGE_SIZE } })
  const offers = !query.isError && query.data ? query.data.page.filter(offer => !exclude.has(offer.offerRef)) : []
  if (!offers.length) return null
  return <Rail size="product" title={t("continueShopping")} href={routes.shopCatalog(handle)} linkLabel={shopT("catalog.openCatalog")}>{offers.map((offer, index) => <OfferCard key={offer.offerRef} offer={offer} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => shopT(key, options)} eager={index === 0} seller={false} action={<OfferQuickAdd offer={offer} />} />)}</Rail>
}

function SubmittedCart({ draft, save, onRecover, onStopped, recovery = false }: { draft: CartDraft; save: (draft: CartDraft | null) => boolean; onRecover: () => void; onStopped: () => void; recovery?: boolean }) {
  const { t } = useTranslation("cart")
  const { networkId } = useCartDraft(draft.handle)
  const connectivity = useCartConnectivity()
  const action = useShopAction()
  const stop = useMutation(api.modules.shops.checkout.stopClientIntent)
  const router = useRouter()
  const query = useAuthenticatedConvexQuery(api.modules.shops.checkout.findByClientRequestId, draft.submitted ? { networkId, clientRequestId: draft.submitted.clientRequestId } : "skip")
  const found = !query.isError && query.data?.outcome === "attempt" ? query.data.attempt : null
  const stoppable = !query.isError && (query.data?.outcome === "absent" || query.data?.outcome === "stopped")
  const abandon = () => {
    if (!stoppable || !draft.submitted || !connectivity.online || !navigator.onLine) return
    void action.run(() => stop({ networkId, clientRequestId: draft.submitted!.clientRequestId }), (result) => {
      if (result.outcome === "attempt") { router.push(routes.checkoutAttempt(result.attempt.attemptId)); return }
      if (result.outcome === "stopped" && save({ ...draft, submitted: null, updatedAt: Date.now() })) onStopped()
    })
  }
  return <Card><div className="grid gap-3"><p role="status">{t("submitted")}</p><Button variant="outline" pending={query.isFetching} disabled={!connectivity.online || action.pending} onClick={() => { if (navigator.onLine) void query.refetch() }}>{t("lookup")}</Button>{query.isPending ? <p>{t("looking")}</p> : found ? <><p>{t("found")}</p><ShopLink href={routes.checkoutAttempt(found.attemptId)}>{t("openAttempt")}</ShopLink><Button variant="outline" onClick={() => { save(null) }}>{t("clearResolved")}</Button></> : stoppable ? <><p>{t(query.data?.outcome === "stopped" ? "stopped" : "notFound")}</p>{!recovery && query.data?.outcome === "absent" ? <Button variant="outline" disabled={!connectivity.online} onClick={onRecover}>{t("recover")}</Button> : null}<p className="text-sm text-muted-foreground">{t("stopHint")}</p><Button variant="outline" pending={action.pending} disabled={!connectivity.online} onClick={abandon}>{t("stopIntent")}</Button></> : <p>{t("unavailable")}</p>}{action.error ? <p role="alert">{t("unavailable")}</p> : null}</div></Card>
}
