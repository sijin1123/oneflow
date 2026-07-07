/* Pure single-level thread grouping (Pass 10 PR-W, PLAN v10.1 R1-⑦).
   The API returns a flat created_at-asc list; the display contract is: roots in
   created_at asc, each root's replies directly beneath it in created_at asc. A
   reply whose root is absent from the set surfaces as a root (never hidden). */

import type { Comment } from './types'

export type CommentThread = { root: Comment; replies: Comment[] }

export function groupThreads(items: Comment[]): CommentThread[] {
  const rootIds = new Set(items.filter((c) => c.parent_id === null).map((c) => c.id))
  const threads: CommentThread[] = []
  const byRoot = new Map<string, CommentThread>()
  for (const c of items) {
    if (c.parent_id !== null && rootIds.has(c.parent_id)) continue
    const thread = { root: c, replies: [] }
    threads.push(thread)
    byRoot.set(c.id, thread)
  }
  for (const c of items) {
    if (c.parent_id !== null) byRoot.get(c.parent_id)?.replies.push(c)
  }
  return threads
}
