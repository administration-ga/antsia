import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from "react"
import type { Id } from "@antsia/api/engine"
import { createNativeCallController } from "./call-controller"
import { NativeCallSurface } from "./native-call-surface"
import { callOwner, EMPTY_CALL, type NativeCallAuthority, type NativeCallProviderProps, type NativeCallSnapshot } from "./types"
import type { NativeCallMedia } from "./call-state"

export type { NativeCallAuthority, NativeCallProviderProps } from "./types"
export type NativeCalls = NativeCallSnapshot & {
  startCall: (personId: Id<"persons">, media: NativeCallMedia) => Promise<void>
  enableSystemCalls: () => Promise<void>
  answer: () => void
  end: () => Promise<void>
  toggleMute: () => Promise<void>
  toggleHeld: () => Promise<void>
  toggleCamera: () => Promise<void>
  minimize: () => void
  restore: () => void
  registerMediaStop: (stop: () => void) => () => void
}
const noop = async () => undefined
const UNAVAILABLE: NativeCalls = { ...EMPTY_CALL, startCall: noop, enableSystemCalls: noop, answer: () => undefined, end: noop, toggleMute: noop, toggleHeld: noop, toggleCamera: noop, minimize: () => undefined, restore: () => undefined, registerMediaStop: () => () => undefined }
const Calls = createContext<NativeCalls>(UNAVAILABLE)
/** Honest fallback also keeps the P17b media component usable without a call provider. */
export function useNativeCalls(): NativeCalls { return useContext(Calls) }

type PublishedCalls = { owner: string; calls: NativeCalls }
const PublishCalls = createContext<Dispatch<SetStateAction<PublishedCalls | null>>>(() => undefined)

/** Seul état au-dessus des écrans privés : la valeur publiée par le contrôleur du propriétaire actuel. */
function CallsContext({ owner, children }: { owner: string | null; children: ReactNode }) {
  const [published, publish] = useState<PublishedCalls | null>(null)
  const value = owner !== null && published?.owner === owner ? published.calls : UNAVAILABLE
  return <PublishCalls.Provider value={publish}><Calls.Provider value={value}>{children}</Calls.Provider></PublishCalls.Provider>
}

function ActiveCalls({ owner, authority, env, registerSessionCleanup }: Omit<NativeCallProviderProps, "authority" | "children"> & { owner: string; authority: NativeCallAuthority }) {
  const publish = useContext(PublishCalls)
  const latest = useRef(authority); latest.current = authority
  const [controller] = useState(() => createNativeCallController(() => latest.current, env, process.env.EXPO_PUBLIC_NATIVE_NOTIFICATION_APPLICATION_ID))
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot)
  const lifetime = useRef(0)
  useEffect(() => {
    const generation = ++lifetime.current
    void controller.initialize()
    const remove = registerSessionCleanup(() => controller.close(true))
    return () => {
      remove()
      // Development effect replay must not replace an already-owned Room or duplicate enrollment.
      queueMicrotask(() => { if (lifetime.current === generation) void controller.close(true).catch(() => undefined) })
    }
  }, [controller, registerSessionCleanup])
  useEffect(() => controller.foregroundChanged(), [controller, authority.foreground])
  const value = useMemo<NativeCalls>(() => ({ ...state, startCall: controller.startCall, enableSystemCalls: controller.enableSystemCalls,
    answer: controller.answer, end: controller.end, toggleMute: controller.toggleMute, toggleHeld: controller.toggleHeld,
    toggleCamera: controller.toggleCamera, minimize: controller.minimize, restore: controller.restore, registerMediaStop: controller.registerMediaStop }), [state, controller])
  // Publiée avant l'affichage ; un autre propriétaire ne lit jamais la valeur de celui-ci.
  useLayoutEffect(() => { publish({ owner, calls: value }) }, [owner, publish, value])
  useLayoutEffect(() => () => publish((current) => current?.owner === owner ? null : current), [owner, publish])
  return <Calls.Provider value={value}><NativeCallSurface calls={value} foreground={authority.foreground} videos={controller.videos()} dismiss={controller.dismiss} /></Calls.Provider>
}

/**
 * Lives above the private route/transport. Only changing its actual owner replaces this controller.
 * Les enfants gardent leur place dans l'arbre : l'arrivée, le départ ou le changement d'une autorité
 * d'appel ne démonte jamais le transport privé (sinon son client Convex est remplacé à chaque confirmation).
 */
export function NativeCallProvider({ authority, children, ...props }: NativeCallProviderProps): ReactNode {
  const owner = authority ? callOwner(authority) + ":" + props.env.convexUrl : null
  return <CallsContext owner={owner}>{children}{authority && owner !== null ? <ActiveCalls key={owner} owner={owner} authority={authority} {...props} /> : null}</CallsContext>
}
