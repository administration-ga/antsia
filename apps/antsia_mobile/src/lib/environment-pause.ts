import { nativeRequest } from "@antsia/social-native/request"

/** One terminal pause per controller; a failed stop never reopens the previous environment. */
export function createNativeEnvironmentPauseGate() {
  let terminal: Promise<boolean> | null = null
  return (options: { block: () => void; stopResources: () => Promise<void> }): Promise<boolean> => {
    if (terminal) return terminal
    let complete!: (ready: boolean) => void
    terminal = new Promise<boolean>(resolve => { complete = resolve })
    try {
      options.block()
    } catch {
      complete(false)
      return terminal
    }
    void nativeRequest(() => options.stopResources()).then(() => complete(true), () => complete(false))
    return terminal
  }
}
