/** U03 : une intention de story en mémoire, jamais un nouveau stockage du brouillon. */
import type { ReachAudience } from "../reseau-personnel/shared"

export interface StorySubmissionIntent<StorageId extends string = string> {
  file: File
  caption: string
  audience: ReachAudience
  key: string
  storageId: StorageId | null
}

export function retainStorySubmissionIntent<StorageId extends string>(
  previous: StorySubmissionIntent<StorageId> | null,
  input: { file: File; caption: string; audience: ReachAudience },
  mintKey: () => string,
): StorySubmissionIntent<StorageId> {
  const caption = input.caption.trim()
  if (previous && previous.file === input.file && previous.caption === caption && previous.audience === input.audience) return previous
  return { file: input.file, caption, audience: input.audience, key: mintKey(), storageId: null }
}
