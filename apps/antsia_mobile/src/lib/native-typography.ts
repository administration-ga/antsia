export const NATIVE_FONT_FAMILIES = {
  body: {
    400: "AntsiaInter-Regular",
    500: "AntsiaInter-Medium",
    600: "AntsiaInter-SemiBold",
    700: "AntsiaInter-Bold",
    800: "AntsiaInter-ExtraBold",
  },
  display: {
    400: "AntsiaFamiljenGrotesk-Regular",
    500: "AntsiaFamiljenGrotesk-Medium",
    600: "AntsiaFamiljenGrotesk-SemiBold",
    700: "AntsiaFamiljenGrotesk-Bold",
    800: "AntsiaFamiljenGrotesk-Bold",
  },
} as const

export type NativeTypographyVariant = keyof typeof NATIVE_FONT_FAMILIES
export type NativeFontWeight = keyof typeof NATIVE_FONT_FAMILIES.body
export type NativeFontFamily = (typeof NATIVE_FONT_FAMILIES)[NativeTypographyVariant][NativeFontWeight]
export type NativeTypographySelection = Readonly<{ variant: NativeTypographyVariant; weight: NativeFontWeight }>
export const DEFAULT_NATIVE_TYPOGRAPHY: NativeTypographySelection = { variant: "body", weight: 400 }

/** Select a real bundled face; never ask iOS to synthesize another weight for that face. */
export function nativeFontWeight(value: unknown, inherited: NativeFontWeight = 400): NativeFontWeight {
  if (value === undefined || value === null) return inherited
  if (value === "bold") return 700
  if (value === "normal") return 400
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN
  if (!Number.isFinite(number)) return inherited
  if (number < 450) return 400
  if (number < 550) return 500
  if (number < 650) return 600
  if (number < 750) return 700
  return 800
}

export function nativeTypographySelection({ variant, fontWeight, inherited = DEFAULT_NATIVE_TYPOGRAPHY }: {
  variant?: NativeTypographyVariant
  fontWeight?: unknown
  inherited?: NativeTypographySelection
}): NativeTypographySelection {
  return { variant: variant ?? inherited.variant, weight: nativeFontWeight(fontWeight, inherited.weight) }
}

export function nativeFontFace(selection: NativeTypographySelection): NativeFontFamily {
  return NATIVE_FONT_FAMILIES[selection.variant][selection.weight]
}
