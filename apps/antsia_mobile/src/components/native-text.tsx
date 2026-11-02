import { createContext, forwardRef, useContext, useMemo } from "react"
import { StyleSheet, Text as ReactNativeText, TextInput as ReactNativeTextInput, type TextProps, type TextInputProps } from "react-native"
import { useNativeTypography } from "../font-loader"
import { DEFAULT_NATIVE_TYPOGRAPHY, nativeFontFace, nativeTypographySelection, type NativeTypographySelection, type NativeTypographyVariant } from "../lib/native-typography"

const InheritedTypography = createContext<NativeTypographySelection>(DEFAULT_NATIVE_TYPOGRAPHY)
export type NativeTextProps = TextProps & { variant?: NativeTypographyVariant }
export type NativeTextInputProps = TextInputProps & { variant?: NativeTypographyVariant }
// Keep both native ref types available when the caller aliases these exports as Text/TextInput.
export type NativeText = ReactNativeText
export type NativeTextInput = ReactNativeTextInput

export const NativeText = forwardRef<ReactNativeText, NativeTextProps>(function NativeText({ style, variant, ...props }, ref) {
  const { fontsReady } = useNativeTypography()
  const inherited = useContext(InheritedTypography)
  const weight = StyleSheet.flatten(style)?.fontWeight
  const selection = useMemo(() => nativeTypographySelection({ variant, fontWeight: weight, inherited }), [variant, weight, inherited])
  const face = fontsReady ? { fontFamily: nativeFontFace(selection), fontWeight: "normal" as const } : undefined
  return <InheritedTypography.Provider value={selection}><ReactNativeText {...props} ref={ref} style={[style, face]} /></InheritedTypography.Provider>
})

export const NativeTextInput = forwardRef<ReactNativeTextInput, NativeTextInputProps>(function NativeTextInput({ style, variant, ...props }, ref) {
  const { fontsReady } = useNativeTypography()
  const selection = nativeTypographySelection({ variant, fontWeight: StyleSheet.flatten(style)?.fontWeight })
  const face = fontsReady ? { fontFamily: nativeFontFace(selection), fontWeight: "normal" as const } : undefined
  return <ReactNativeTextInput {...props} ref={ref} style={[style, face]} />
})
