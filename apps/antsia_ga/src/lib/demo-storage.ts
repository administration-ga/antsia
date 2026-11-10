import { scopedStorage } from "@antsia/api/scoped-storage"
import { appBasePath } from "./app-path"

/** Hors antsia:/antia: : la sortie du vrai compte ne purge jamais la démo. */
export const DEMO_STORAGE_NAMESPACE = "antsia-demo-scope:"
export function demoStorageNamespace(): string { return appBasePath() ? DEMO_STORAGE_NAMESPACE : "" }

const localViews = new WeakMap<Storage, Storage>()
const sessionViews = new WeakMap<Storage, Storage>()
export function demoSessionStorage(kind: "localStorage" | "sessionStorage" = "localStorage"): Storage | undefined {
  if (!appBasePath() || typeof window === "undefined") return undefined
  const storage = window[kind]
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function" || typeof storage.key !== "function") throw new Error("demoStorageUnavailable")
  const views = kind === "localStorage" ? localViews : sessionViews
  const known = views.get(storage)
  if (known) return known
  const view = scopedStorage(storage, DEMO_STORAGE_NAMESPACE)
  views.set(storage, view)
  return view
}
