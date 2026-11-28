// @vitest-environment jsdom
import { type Id } from "@antsia/api/engine"
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { afterEach, expect, it, vi } from "vitest"
import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"
import { InboxFilingProvider, ThreadOptions } from "./InboxFiling"

const write = vi.hoisted(() => vi.fn())
vi.mock("@antsia/api/hooks", () => ({
  useConvexMutationQuery: (ref: Parameters<typeof getFunctionName>[0]) => ({
    mutateAsync: (args: unknown) => write(getFunctionName(ref), args),
  }),
  useAuthenticatedPaginatedQuery: (_ref: unknown, args: "skip" | { side?: string; shelf?: string }) => ({
    results: args === "skip" || args.side !== "low" ? [] : [{ threadId: args.shelf ?? "regular" }],
    status: "Exhausted", loadMore: vi.fn(),
  }),
}))

afterEach(() => { cleanup(); write.mockReset() })

it("shows pinned and active discussions together, then only archived threads", () => {
  renderWithEngine(<InboxFilingProvider>{filing => <>
    <output>{filing.direct.map(row => row.threadId).join(",")}</output>
    <button onClick={() => filing.setArchived(!filing.archived)}>Basculer</button>
  </>}</InboxFilingProvider>)
  expect(screen.getByText("pinned,regular")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Basculer" }))
  expect(screen.getByText("archived")).toBeTruthy()
  expect(screen.queryByText("pinned,regular")).toBeNull()
})

it("uses the personal or group mutation for the chosen action and shows a write failure", async () => {
  const personal = "thread1" as Id<"personalThreads">
  const group = "thread2" as Id<"groupThreads">
  renderWithEngine(<InboxFilingProvider>{filing => <>
    <ThreadOptions filing={filing} target={{ kind: "chat", id: personal }} name="Julie" />
    <ThreadOptions filing={filing} target={{ kind: "groupe", id: group }} name="Groupe" />
  </>}</InboxFilingProvider>)
  const personalOptions = screen.getByLabelText("Options pour Julie")
  fireEvent.click(personalOptions)
  fireEvent.click(within(personalOptions.closest("details")!).getByRole("button", { name: "Archiver" }))
  await waitFor(() => expect(write).toHaveBeenCalledWith("modules/messaging/inbox:setMyThreadPreference", { networkId: TEST_NETWORK_ID, threadId: personal, change: { shelf: "archived" } }))
  const groupOptions = screen.getByLabelText("Options pour Groupe")
  fireEvent.click(groupOptions)
  write.mockRejectedValueOnce(new Error("offline"))
  fireEvent.click(within(groupOptions.closest("details")!).getByRole("button", { name: "Mettre en sourdine" }))
  expect(await screen.findByRole("alert")).toBeTruthy()
  expect(write).toHaveBeenCalledWith("modules/groups/threads:setGroupMuted", { networkId: TEST_NETWORK_ID, threadId: group, muted: true })
})
