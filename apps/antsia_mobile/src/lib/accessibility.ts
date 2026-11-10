/** Platform-independent presentation rules; no screen reader or device is simulated here. */
export function nativeControlState(input: { disabled?: boolean; pending?: boolean; selected?: boolean; checked?: boolean }) {
  return {
    disabled: input.disabled === true || input.pending === true,
    busy: input.pending === true,
    ...(input.selected !== undefined ? { selected: input.selected } : {}),
    ...(input.checked !== undefined ? { checked: input.checked } : {}),
  }
}
export function nativeFieldLabel(label: string, error?: string): string {
  return error ? `${label}. ${error}` : label
}
export function nativePagingAllowed(input: { immersive: boolean; reducedMotion: boolean; fontScale: number; viewportHeight: number }): boolean {
  // Presentation guard, not a measured performance/AA threshold. Enlarged text and
  // short windows retain continuous scrolling rather than fixed-page jumps.
  return input.immersive && !input.reducedMotion && Number.isFinite(input.fontScale) && input.fontScale > 0 && input.fontScale <= 1.3 && Number.isFinite(input.viewportHeight) && input.viewportHeight >= 480
}
export type NativeCallPresentation = "hidden" | "pill" | "modal"
export function nativeCallPresentation(input: { foreground: boolean; phase: string; minimized: boolean; busy: boolean }): NativeCallPresentation {
  if (!input.foreground || input.phase === "idle") return "hidden"
  return input.minimized && input.busy ? "pill" : "modal"
}
export function nativeModalOpens(previous: NativeCallPresentation, next: NativeCallPresentation): boolean {
  return previous !== "modal" && next === "modal"
}
