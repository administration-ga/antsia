"use client"

import { api, type Id } from "@antsia/api/engine"
import { COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2 } from "@antsia/social-domain/commerce/primitives"
import { Button, Field, Select } from "@antsia/ui"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { controlStyle, EmptyRows, inputStyle, LoadingRows, MotiveAction, useOperationDraft, useOperationDraftGuard, useWindowCursor, WindowPagination } from "./console-operation-controls"

type CatalogShop = FunctionReturnType<typeof api.modules.shops.catalogControl.paginateMappings>["page"][number]
type Emitter = FunctionReturnType<typeof api.modules.federation.emitters.paginate>["page"][number]

function acceptsCatalog(emitter: Emitter): boolean {
  return emitter.allowedContracts.includes(COMMERCE_PUBLIC_CONTRACT) || emitter.allowedContracts.includes(COMMERCE_PUBLIC_CONTRACT_V2)
}

/** La décision choisit une boutique existante ; aucun identifiant technique n'est saisi. */
export function CatalogMapping({ networkId }: { networkId: Id<"networks"> }) {
  return <CatalogMappingWindow key={networkId} networkId={networkId} />
}

function CatalogMappingWindow({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const window = useWindowCursor()
  const result = useQuery(api.modules.shops.catalogControl.paginateMappings, { networkId, paginationOpts: { cursor: window.cursor, numItems: 20, maximumRowsRead: 25, maximumBytesRead: 262_144 } })
  const [selectedId, setSelectedId] = useState<Id<"shops"> | null>(null)
  const [pending, setPending] = useState(false)
  const canChange = useOperationDraftGuard()
  const selected = result?.page.find(shop => shop.shopId === selectedId)
  return <section className="flex min-w-0 flex-col gap-4 border-t border-border pt-4" aria-label={t("catalogMapping.title")}>
    <h4 className="font-semibold">{t("catalogMapping.title")}</h4>
    <p className="text-sm text-muted-foreground">{t("catalogMapping.lead")}</p>
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4" aria-label={t("catalogMapping.shops")}>
      {result === undefined ? <LoadingRows /> : result.page.length === 0 ? <EmptyRows done={result.isDone} /> : <ul className="flex min-w-0 flex-col gap-3">{result.page.map(shop => {
        const name = shop.name ?? t("catalogMapping.unnamedShop")
        return <li key={shop.shopId} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
          <p className="break-words font-medium">{name}</p>
          {shop.handle ? <p className="break-words text-sm text-muted-foreground">@{shop.handle}</p> : null}
          <p className="text-sm">{t(shop.mapping?.enabled ? "catalogMapping.active" : shop.mapping ? "catalogMapping.inactive" : "catalogMapping.unmapped")}</p>
          {shop.mapping ? <p className="break-words text-sm text-muted-foreground">{t("catalogMapping.currentEmitter", { emitter: shop.mapping.emitterSlug ?? t("catalogMapping.unknownEmitter"), generation: shop.mapping.generation })}</p> : null}
          <Button type="button" variant="outline" style={controlStyle} disabled={pending || selectedId === shop.shopId} onClick={() => { if (canChange()) setSelectedId(shop.shopId) }}>{t("catalogMapping.chooseShop", { name })}</Button>
        </li>
      })}</ul>}
      <WindowPagination window={window} result={result} />
    </fieldset>
    {selected ? <ShopCatalogMapping key={JSON.stringify([networkId, selected.shopId, selected.mapping, selected.link])} networkId={networkId} shop={selected} onPendingChange={setPending} /> : <p className="text-sm text-muted-foreground">{t("catalogMapping.chooseShopHint")}</p>}
  </section>
}

function ShopCatalogMapping({ networkId, shop, onPendingChange }: { networkId: Id<"networks">; shop: CatalogShop; onPendingChange: (pending: boolean) => void }) {
  const { t } = useTranslation("operations")
  const window = useWindowCursor()
  const emitters = useQuery(api.modules.federation.emitters.paginate, { networkId, paginationOpts: { cursor: window.cursor, numItems: 25, maximumRowsRead: 25, maximumBytesRead: 262_144 } })
  const [pending, setPending] = useState(false)
  const configure = useMutation(api.modules.shops.catalogControl.configureMapping)
  const name = shop.name ?? t("catalogMapping.unnamedShop")
  const mapping = shop.mapping
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false) }, [onPendingChange, pending])
  const decide = async (emitterId: Id<"federationEmitters">, enabled: boolean, reason: string) => {
    setPending(true)
    try { return await configure({ networkId, shopId: shop.shopId, emitterId, enabled, reason }) }
    finally { setPending(false) }
  }
  return <section className="flex min-w-0 flex-col gap-4 rounded-lg bg-muted p-3" aria-label={t("catalogMapping.editShop", { name })} aria-busy={pending || undefined}>
    <h5 className="break-words font-semibold">{t("catalogMapping.editShop", { name })}</h5>
    <p className="text-sm">{t(shop.link?.publishCatalog ? "catalogMapping.linkReady" : "catalogMapping.linkRequired")}</p>
    {shop.link ? <p className="text-sm text-muted-foreground">{t(`federation.${shop.link.environment}`)}</p> : null}
    <p className="text-sm text-muted-foreground">{t("catalogMapping.categoriesHint")}</p>
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4" aria-label={t("catalogMapping.emitters")}>
      {emitters === undefined ? <LoadingRows /> : <EmitterChoice key={window.cursor ?? "first"} shop={shop} emitters={emitters.page} pending={pending} onDecision={decide} />}
      <WindowPagination window={window} result={emitters} />
    </fieldset>
    {mapping?.enabled ? <MotiveAction label={t("catalogMapping.disable", { name })} minLength={10} danger disabled={pending} onDecision={reason => decide(mapping.emitterId, false, reason)} /> : null}
  </section>
}

function EmitterChoice({ shop, emitters, pending, onDecision }: { shop: CatalogShop; emitters: Emitter[]; pending: boolean; onDecision: (emitterId: Id<"federationEmitters">, enabled: boolean, reason: string) => Promise<null> }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const [selectedId, setSelectedId] = useState("")
  const canChange = useOperationDraftGuard()
  const selected = emitters.find(emitter => emitter._id === selectedId)
  const unchanged = shop.mapping?.enabled === true && shop.mapping.emitterId === selected?._id
  const compatible = (emitter: Emitter) => emitter.enabled && emitter.environment === shop.link?.environment && acceptsCatalog(emitter)
  const available = shop.link?.publishCatalog === true && emitters.some(compatible)
  useOperationDraft(selectedId !== "", pending)
  const name = shop.name ?? t("catalogMapping.unnamedShop")
  return <>
    <Field htmlFor={id} label={t("catalogMapping.emitter")} hint={t("catalogMapping.emitterHint")}>
      <Select id={id} style={inputStyle} disabled={pending || !available} value={selectedId} onChange={event => { if (canChange()) setSelectedId(event.target.value) }}>
        <option value="">{t("catalogMapping.selectEmitter")}</option>
        {emitters.map(emitter => <option key={emitter._id} value={emitter._id} disabled={!compatible(emitter)}>{t("catalogMapping.emitterOption", { slug: emitter.slug, environment: t(`federation.${emitter.environment}`), state: t(emitter.enabled ? "common.active" : "common.inactive"), contract: t(emitter.allowedContracts.includes(COMMERCE_PUBLIC_CONTRACT_V2) ? "catalogMapping.v2" : acceptsCatalog(emitter) ? "catalogMapping.v1" : "catalogMapping.noCatalog") })}</option>)}
      </Select>
    </Field>
    {!available ? <p role="status" className="text-sm text-muted-foreground">{t(shop.link?.publishCatalog ? "catalogMapping.noCompatibleOnPage" : "catalogMapping.linkRequired")}</p> : null}
    {selected && shop.mapping?.enabled ? <p role="status" className="text-sm text-muted-foreground">{t(unchanged ? "catalogMapping.unchanged" : "catalogMapping.replaceHint")}</p> : null}
    {selected ? <MotiveAction key={selected._id} label={t("catalogMapping.enable", { name, emitter: selected.slug })} minLength={10} disabled={pending || unchanged || !shop.link?.publishCatalog || !compatible(selected)} onDecision={reason => onDecision(selected._id, true, reason)} onSuccess={() => setSelectedId("")} /> : <Button type="button" variant="outline" style={controlStyle} disabled>{t("catalogMapping.enableUnselected")}</Button>}
  </>
}
