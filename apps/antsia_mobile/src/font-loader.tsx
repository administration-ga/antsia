import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import * as Font from "expo-font"
import interRegular from "../assets/fonts/AntsiaInter-Regular.ttf"
import interMedium from "../assets/fonts/AntsiaInter-Medium.ttf"
import interSemiBold from "../assets/fonts/AntsiaInter-SemiBold.ttf"
import interBold from "../assets/fonts/AntsiaInter-Bold.ttf"
import interExtraBold from "../assets/fonts/AntsiaInter-ExtraBold.ttf"
import familjenRegular from "../assets/fonts/AntsiaFamiljenGrotesk-Regular.ttf"
import familjenMedium from "../assets/fonts/AntsiaFamiljenGrotesk-Medium.ttf"
import familjenSemiBold from "../assets/fonts/AntsiaFamiljenGrotesk-SemiBold.ttf"
import familjenBold from "../assets/fonts/AntsiaFamiljenGrotesk-Bold.ttf"
import type { NativeFontFamily } from "./lib/native-typography"

export const NATIVE_FONT_SOURCES: Readonly<Record<NativeFontFamily, Font.FontSource>> = {
  "AntsiaInter-Regular": interRegular,
  "AntsiaInter-Medium": interMedium,
  "AntsiaInter-SemiBold": interSemiBold,
  "AntsiaInter-Bold": interBold,
  "AntsiaInter-ExtraBold": interExtraBold,
  "AntsiaFamiljenGrotesk-Regular": familjenRegular,
  "AntsiaFamiljenGrotesk-Medium": familjenMedium,
  "AntsiaFamiljenGrotesk-SemiBold": familjenSemiBold,
  "AntsiaFamiljenGrotesk-Bold": familjenBold,
}

export type NativeTypographyStatus = "loading" | "ready" | "failed"
type FontLoadResult = { status: "ready" } | { status: "failed"; error: unknown }
type NativeTypographyState = Readonly<{ status: NativeTypographyStatus; fontsReady: boolean }>
const Context = createContext<NativeTypographyState>({ status: "loading", fontsReady: false })
let pendingFonts: Promise<FontLoadResult> | undefined

function loadNativeFonts(): Promise<FontLoadResult> {
  // A single settled result survives theme changes and StrictMode's second effect.
  // A partial SDK load is never exposed as a mixture of custom and system faces.
  pendingFonts ??= Promise.resolve().then(() => Font.loadAsync(NATIVE_FONT_SOURCES)).then(
    () => ({ status: "ready" as const }),
    (error: unknown) => ({ status: "failed" as const, error }),
  )
  return pendingFonts
}

export function NativeTypographyProvider({ children, loadingFallback = null, onLoadError }: {
  children: ReactNode
  loadingFallback?: ReactNode
  onLoadError?: (error: unknown) => void
}) {
  const [status, setStatus] = useState<NativeTypographyStatus>("loading")
  const reportFailure = useRef(onLoadError)
  useEffect(() => { reportFailure.current = onLoadError }, [onLoadError])
  useEffect(() => {
    let active = true
    void loadNativeFonts().then(result => {
      if (!active) return
      setStatus(result.status)
      if (result.status === "failed") reportFailure.current?.(result.error)
    })
    return () => { active = false }
  }, [])
  const value = useMemo(() => ({ status, fontsReady: status === "ready" }), [status])
  // Loading gates the first frame. Failure deliberately releases the app using
  // system text; the explicit failed status/onLoadError remains observable.
  return <Context.Provider value={value}>{status === "loading" ? loadingFallback : children}</Context.Provider>
}

export function useNativeTypography(): NativeTypographyState {
  return useContext(Context)
}
