// @vitest-environment jsdom
import type { Id } from "@antsia/api/engine"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { EngineTestWrapper } from "../../tests/engine-wrapper"
import { useConnectionRequest } from "./use-connection-request"

const mocks = vi.hoisted(() => ({ mutation: vi.fn(), info: vi.fn() }))
vi.mock("convex/react", () => ({ useMutation: () => mocks.mutation }))
vi.mock("sonner", () => ({ toast: { info: mocks.info } }))
let person = 0
const wrapperFor = (personId = `persons_rate_${++person}` as Id<"persons">) =>
  function Wrapper({ children }: { children: ReactNode }) { return <EngineTestWrapper personId={personId}>{children}</EngineTestWrapper> }

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(100_000) })
afterEach(() => { cleanup(); vi.useRealTimers() })

it("verrouille les demandes entre surfaces avant le prochain rendu", async () => {
  let finish!: (value: { status: "requested" }) => void
  mocks.mutation.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const wrapper = wrapperFor()
  const first = renderHook(useConnectionRequest, { wrapper })
  const second = renderHook(useConnectionRequest, { wrapper })
  let sent!: Promise<boolean>
  await act(async () => {
    sent = first.result.current.send({ handle: "alice" })
    expect(await second.result.current.send({ handle: "bob" })).toBe(false)
  })
  expect(mocks.mutation).toHaveBeenCalledTimes(1)
  expect(second.result.current.disabled).toBe(true)
  await act(async () => { finish({ status: "requested" }); expect(await sent).toBe(true) })
  expect(second.result.current.disabled).toBe(false)
})

it.each(["result", "legacy error"])("partage l'attente (%s) et autorise un nouvel essai à échéance", async (kind) => {
  if (kind === "result") mocks.mutation.mockResolvedValueOnce({ status: "rateLimited", retryAfterMs: 1500 })
  else mocks.mutation.mockRejectedValueOnce({ data: { code: "rateLimited", retryAfterMs: 1500 } })
  const wrapper = wrapperFor()
  const first = renderHook(useConnectionRequest, { wrapper })
  await act(async () => { expect(await first.result.current.send({ handle: "alice" })).toBe(false) })
  expect(first.result.current.waitLabel).toBe("Réessayez dans 2 s.")
  expect(mocks.info).toHaveBeenCalledWith("Réessayez dans 2 s.")
  first.unmount()
  const second = renderHook(useConnectionRequest, { wrapper })
  expect(second.result.current.disabled).toBe(true)
  await act(async () => { expect(await second.result.current.send({ handle: "bob" })).toBe(false) })
  expect(mocks.mutation).toHaveBeenCalledTimes(1)
  const other = renderHook(useConnectionRequest, { wrapper: wrapperFor() })
  expect(other.result.current.disabled).toBe(false)
  act(() => { vi.advanceTimersByTime(2000) })
  expect(second.result.current.disabled).toBe(false)
  mocks.mutation.mockResolvedValueOnce({ status: "requested" })
  await act(async () => { expect(await second.result.current.send({ handle: "bob" })).toBe(true) })
  expect(mocks.mutation).toHaveBeenCalledTimes(2)
})

it("propage les erreurs inattendues et libère le verrou", async () => {
  const error = { data: { code: "notFound" } }
  mocks.mutation.mockRejectedValueOnce(error)
  const hook = renderHook(useConnectionRequest, { wrapper: wrapperFor() })
  await act(async () => { await expect(hook.result.current.send({ handle: "unknown" })).rejects.toBe(error) })
  expect(hook.result.current.disabled).toBe(false)
  expect(mocks.info).not.toHaveBeenCalled()
})
