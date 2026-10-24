import { createContext, useContext, type ReactNode } from "react"
import type { Id } from "@antsia/api/engine"

export type NativeRuntime = {
  networkId: Id<"networks">
  personId: Id<"persons">
  sessionId: string
  epoch: number
  foreground: boolean
  online: boolean
  ready: boolean
  canWrite: boolean
  webUrl?: string
  webBasePath?: "/demo"
  isCurrent: () => boolean
  registerCleanup: (cleanup: () => void | Promise<void>) => () => void
}
const Runtime = createContext<NativeRuntime | null>(null)
export function NativeRuntimeProvider({ value, children }: { value: NativeRuntime; children: ReactNode }) {
  return <Runtime.Provider value={value}>{children}</Runtime.Provider>
}
export function useNativeRuntime() {
  const runtime = useContext(Runtime)
  if (!runtime) throw new Error("nativeRuntimeMissing")
  return runtime
}
