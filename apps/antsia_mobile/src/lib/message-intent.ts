import { assertMessageContent } from "@antsia/social-contracts/messaging"

export type MessageIntentScope = { networkId: string; personId: string; sessionId: string; epoch: number; threadId: string }
export type MessageIntent = {
  owner: string; threadId: string; key: string; text: string
  state: "pending" | "uncertain" | "admitted"; messageId: string | null
}
export function messageOwner(scope: MessageIntentScope): string {
  return JSON.stringify([scope.networkId, scope.personId, scope.sessionId, scope.epoch, scope.threadId])
}
/** Corps texte seul figé : une incertitude n'autorise jamais une autre clé ou un autre corps. */
export function beginMessageIntent(previous: MessageIntent | null, scope: MessageIntentScope, input: string, createKey: () => string): MessageIntent | null {
  const text = assertMessageContent(input, false), owner = messageOwner(scope)
  if (previous) {
    if (previous.owner !== owner || previous.state !== "uncertain" || previous.text !== text) return null
    return { ...previous, state: "pending" }
  }
  return { owner, threadId: scope.threadId, key: createKey(), text, state: "pending", messageId: null }
}
export function uncertainMessageIntent(intent: MessageIntent): MessageIntent {
  return { ...intent, state: "uncertain", messageId: null }
}
export function admittedMessageIntent(intent: MessageIntent, messageId: string): MessageIntent {
  return { ...intent, state: "admitted", messageId }
}
