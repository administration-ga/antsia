import type { api } from "@antsia/api/engine"
import { engineErrorAppRule, engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { PAGE_DESCRIPTION_MAX_LENGTH, PAGE_NAME_MAX_LENGTH } from "@antsia/social-domain/pages"
import type { FunctionReturnType } from "convex/server"
import type { TFunction } from "i18next"
import { z } from "zod"
import { activityConfigurationSchema } from "@/lib/activity-configuration-schema"

export type ShopEditorData = NonNullable<FunctionReturnType<typeof api.modules.shops.shops.getMyShop>>
export type StorefrontData = NonNullable<FunctionReturnType<typeof api.modules.shops.shops.storefront>>
export type ShopModel = ShopEditorData["model"]
export const SHOP_MODELS = ["products", "quote_services"] as const satisfies readonly ShopModel[]
/** Bornes P07 ; les tests les confrontent aux règles serveur sans import serveur dans le client. */
export const SHOP_FORM_LIMITS = { nameMin: 2, nameMax: PAGE_NAME_MAX_LENGTH, descriptionMax: PAGE_DESCRIPTION_MAX_LENGTH, specialtyMax: 80, serviceAreaMax: 120, hoursMax: 200 } as const

const invalidControls = (raw: string) => Array.from(raw).some((character) => { const code = character.charCodeAt(0); return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13) })
const line = (raw: string) => raw.normalize("NFC").replace(/\s+/g, " ").trim()
const text = (raw: string) => raw.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
const field = (max: number, t: TFunction, multiline = false) => z.string().refine((raw) => !invalidControls(raw), t("errors.shop_text_invalid")).transform(multiline ? text : line).refine((value) => value.length <= max, t("validation.max", { max }))

export function startShopSchema(t: TFunction) {
  return z.object({ model: z.enum(SHOP_MODELS), activityConfiguration: activityConfigurationSchema.optional(), name: field(SHOP_FORM_LIMITS.nameMax, t), pageId: z.string() }).superRefine((value, context) => {
    if (!value.pageId && value.name.length < SHOP_FORM_LIMITS.nameMin) context.addIssue({ code: "custom", path: ["name"], message: t("errors.shop_name_length", { min: SHOP_FORM_LIMITS.nameMin, max: SHOP_FORM_LIMITS.nameMax }) })
  })
}
export type StartShopValues = z.input<ReturnType<typeof startShopSchema>>

export function presentationSchema(t: TFunction) {
  return z.object({
    name: field(SHOP_FORM_LIMITS.nameMax, t).refine((value) => value.length >= SHOP_FORM_LIMITS.nameMin, t("errors.shop_name_length", { min: SHOP_FORM_LIMITS.nameMin, max: SHOP_FORM_LIMITS.nameMax })),
    description: field(SHOP_FORM_LIMITS.descriptionMax, t, true),
    specialty: field(SHOP_FORM_LIMITS.specialtyMax, t),
    serviceArea: field(SHOP_FORM_LIMITS.serviceAreaMax, t),
    hours: field(SHOP_FORM_LIMITS.hoursMax, t),
  })
}
export type PresentationValues = z.input<ReturnType<typeof presentationSchema>>
export function presentationValues(shop: ShopEditorData): PresentationValues {
  return { name: shop.name ?? "", description: shop.description ?? "", specialty: shop.specialty ?? "", serviceArea: shop.serviceArea ?? "", hours: shop.hours ?? "" }
}
export const EDITOR_STEPS = ["activity", "presentation", "offers", "publish"] as const
export type EditorStep = typeof EDITOR_STEPS[number]

/** Le serveur projette le droit de demander ; un état local ne peut que le fermer. */
export function publicationActions(shop: ShopEditorData, dirty: boolean) {
  return { request: !dirty && shop.policy !== "closed" && shop.publication.requestable && shop.publication.gaps.length === 0 && (["draft", "rejected", "withdrawn"] as const).some((state) => state === shop.storefront.state), cancel: shop.storefront.state === "pending_review", withdraw: shop.storefront.state === "published" }
}

const SHOP_ERROR_RULES = new Set(["shop_name_length", "shop_description_length", "shop_specialty_length", "shop_service_area_length", "shop_hours_length", "shop_text_invalid", "shop_draft_quota", "shop_page_reserved", "shop_page_taken", "shop_publication_closed", "shop_presentation_incomplete", "shop_state_invalid", "shop_suspended", "shop_consent_outdated", "shop_owner_inactive", "shop_handle_unavailable"])
export function shopErrorText(error: unknown, t: TFunction): string {
  const app = engineErrorAppRule(error)
  if (app && SHOP_ERROR_RULES.has(app.appRule)) return t(`errors.${app.appRule}`, app.appParams)
  const rule = engineErrorRule(error)
  if (rule) return t(`rules:${rule.rule}`, rule.params)
  const code = engineErrorCode(error)
  return code ? t(`errors:${code}`) : t("common.actionFailed")
}
