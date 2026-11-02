import { assertPostContent } from "@antsia/social-domain/content"

export type NativePostIntent = Readonly<{ owner: string; body: string; key: string }>
/** A retry reuses the admitted body/key; it cannot silently become a second publication. */
export function nativePostIntent(previous: NativePostIntent | null, owner: string, body: string, createKey: () => string): NativePostIntent | null {
  const normalized = assertPostContent({ body, mediaCount: 0, isShare: false })
  if (previous) return previous.owner === owner && previous.body === normalized ? previous : null
  return { owner, body: normalized, key: createKey() }
}
