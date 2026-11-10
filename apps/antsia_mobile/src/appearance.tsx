import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useColorScheme } from "react-native"
import { isMemberThemeId, type MemberThemeId } from "@antsia/social-contracts/appearance"
import { nativeThemeTokens, type NativeThemeTokens } from "@antsia/ui/themes/antsia-native"
import fr from "./i18n/fr.json"
import en from "./i18n/en.json"

import entryFr from "./i18n/entry.fr.json"
import entryEn from "./i18n/entry.en.json"

import feedFr from "./i18n/feed.fr.json"
import feedEn from "./i18n/feed.en.json"

import profileFr from "./i18n/profile.fr.json"
import profileEn from "./i18n/profile.en.json"

import navigationFr from "./i18n/navigation.fr.json"
import navigationEn from "./i18n/navigation.en.json"

type Appearance = {
  tokens: NativeThemeTokens
  theme: MemberThemeId
  mode: "light" | "dark" | "system"
  locale: "fr" | "en"
  setTheme: (theme: MemberThemeId) => void
  setMode: (mode: "light" | "dark" | "system") => void
  setLocale: (locale: "fr" | "en") => void
  t: (key: string, params?: Record<string, string | number>) => string
}
const Context = createContext<Appearance | null>(null)
export function NativeAppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<MemberThemeId>("gaboma")
  const [mode, setMode] = useState<Appearance["mode"]>("system")
  const [locale, setLocale] = useState<"fr" | "en">("fr")
  const system = useColorScheme()
  const tokens = nativeThemeTokens(theme, mode === "system" ? system === "dark" ? "dark" : "light" : mode)
  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const messages: Record<string, string> = locale === "fr" ? { ...fr, ...entryFr, ...feedFr, ...profileFr, ...navigationFr } : { ...en, ...entryEn, ...feedEn, ...profileEn, ...navigationEn }
    return (messages[key] ?? key).replace(/\{\{\s*([\w]+)\s*\}\}/gu, (placeholder, name: string) => params?.[name] === undefined ? placeholder : String(params[name]))
  }, [locale])
  const value = useMemo(() => ({ tokens, theme, mode, locale, setTheme, setMode, setLocale, t }), [tokens, theme, mode, locale, t])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useNativeAppearance() {
  const value = useContext(Context)
  if (!value) throw new Error("nativeAppearanceMissing")
  return value
}
export function validNativeTheme(value: unknown): MemberThemeId | undefined {
  return isMemberThemeId(value) ? value : undefined
}
