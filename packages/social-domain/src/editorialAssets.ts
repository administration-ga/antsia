/** MP12 : limites des illustrations éditoriales, distinctes des publications sociales. */
export const EDITORIAL_IMAGE_CONSENT_VERSION = "2026-10-21-mp12-editorial-image-v1" as const
export const EDITORIAL_PAGE_ASSETS_MAX = 200
export const EDITORIAL_ARTICLE_IMAGES_MAX = 4

export function editorialImageDescription(value: string, maxLength: number): string | null {
  const text = value.trim().normalize("NFC")
  return text.length > 0 && text.length <= maxLength && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text) ? text : null
}
