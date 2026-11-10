"use client"

import { ACTIVITY_BLOCKS, ACTIVITY_CAPABILITIES, ACTIVITY_TEMPLATES, type ActivityBlock, type ActivityCapability, type ActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { ArrowDown, ArrowUp } from "lucide-react"
import { useEffect, useId, useRef } from "react"
import { useTranslation } from "react-i18next"

import { Button, Field } from "@/components/shared/controls"
import { SHOP_SELECT_CLASS } from "./shop-ui"

function allowedBlocks(capabilities: readonly ActivityCapability[]): ActivityBlock[] {
  return ACTIVITY_BLOCKS.filter(block => (block !== "catalog" || capabilities.includes("products")) && (block !== "services" || capabilities.includes("services")))
}

/** La configuration compose une présentation ; elle n'accorde aucun droit métier. */
export function ActivityConfigurationFields({ value, onChange, disabled = false }: { value: ActivityConfiguration; onChange: (value: ActivityConfiguration) => void; disabled?: boolean }) {
  const { t } = useTranslation("activityConfiguration")
  const id = useId()
  const blocksHeading = useRef<HTMLLegendElement>(null)
  const restoreBlockFocus = useRef(false)
  const available = allowedBlocks(value.capabilities)
  useEffect(() => {
    if (!restoreBlockFocus.current) return
    restoreBlockFocus.current = false
    blocksHeading.current?.focus()
  }, [value.blocks])
  const toggleCapability = (capability: ActivityCapability, checked: boolean) => {
    const capabilities = ACTIVITY_CAPABILITIES.filter(item => item === capability ? checked : value.capabilities.includes(item))
    if (!capabilities.length) return
    const blocks = value.blocks.filter(block => allowedBlocks(capabilities).includes(block))
    const newBlock = capability === "products" ? "catalog" : capability === "services" ? "services" : null
    if (checked && newBlock && !blocks.includes(newBlock)) blocks.unshift(newBlock)
    onChange({ ...value, capabilities, blocks: blocks.length ? blocks : ["about"] })
  }
  const move = (block: ActivityBlock, offset: -1 | 1) => {
    const blocks = [...value.blocks]
    const from = blocks.indexOf(block)
    const to = from + offset
    if (from < 0 || to < 0 || to >= blocks.length) return
    const replaced = blocks[to]!
    blocks[to] = block
    blocks[from] = replaced
    onChange({ ...value, blocks })
  }
  return <div className="grid min-w-0 gap-5">
    <fieldset disabled={disabled} className="grid gap-3">
      <legend className="mb-2 font-medium">{t("capabilities.label")}</legend>
      <p className="text-sm text-muted-foreground">{t("capabilities.hint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">{ACTIVITY_CAPABILITIES.map(capability => <label key={capability} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] p-4">
        <input type="checkbox" className="mt-1 size-4 accent-primary" checked={value.capabilities.includes(capability)} disabled={disabled || value.capabilities.length === 1 && value.capabilities.includes(capability)} onChange={event => toggleCapability(capability, event.target.checked)} />
        <span><span className="block font-medium">{t(`capabilities.${capability}`)}</span><span className="text-sm text-muted-foreground">{t(`capabilityHints.${capability}`)}</span></span>
      </label>)}</div>
      {value.capabilities.includes("media") ? <p role="note" className="text-sm text-muted-foreground">{t("mediaPreparation")}</p> : null}
    </fieldset>
    <Field id={`${id}-template`} label={t("template.label")} hint={t("template.hint")}>
      <select id={`${id}-template`} className={SHOP_SELECT_CLASS} value={value.template} disabled={disabled} aria-describedby={`${id}-template-hint`} onChange={event => {
        const template = ACTIVITY_TEMPLATES.find(item => item === event.target.value)
        if (template) onChange({ ...value, template })
      }}>{ACTIVITY_TEMPLATES.map(template => <option key={template} value={template}>{t(`templates.${template}`)}</option>)}</select>
    </Field>
    <fieldset disabled={disabled} className="grid gap-3">
      <legend ref={blocksHeading} tabIndex={-1} className="mb-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("blocks.label")}</legend>
      <p className="text-sm text-muted-foreground">{t("blocks.hint")}</p>
      <ol className="grid gap-2">{value.blocks.map((block, index) => <li key={block} className="flex min-w-0 flex-wrap items-center gap-2 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] p-3">
        <span className="min-w-0 flex-1 text-sm font-medium">{t(`blockNames.${block}`)}</span>
        <Button type="button" variant="ghost" disabled={disabled || index === 0} aria-label={t("blocks.moveUp", { name: t(`blockNames.${block}`) })} onClick={() => move(block, -1)}><ArrowUp aria-hidden="true" className="size-4" /></Button>
        <Button type="button" variant="ghost" disabled={disabled || index === value.blocks.length - 1} aria-label={t("blocks.moveDown", { name: t(`blockNames.${block}`) })} onClick={() => move(block, 1)}><ArrowDown aria-hidden="true" className="size-4" /></Button>
        <Button type="button" variant="outline" disabled={disabled || value.blocks.length === 1} aria-label={t("blocks.hideNamed", { name: t(`blockNames.${block}`) })} onClick={() => { restoreBlockFocus.current = true; onChange({ ...value, blocks: value.blocks.filter(item => item !== block) }) }}>{t("blocks.hide")}</Button>
      </li>)}</ol>
      {available.filter(block => !value.blocks.includes(block)).map(block => <Button key={block} type="button" variant="outline" className="justify-self-start" disabled={disabled} onClick={() => onChange({ ...value, blocks: [...value.blocks, block] })}>{t("blocks.restore", { name: t(`blockNames.${block}`) })}</Button>)}
    </fieldset>
  </div>
}
