import assert from 'node:assert/strict'
import { test } from 'node:test'

import { groupThreads } from './comments.ts'
import type { Comment } from './types.ts'

function c(id: string, parent_id: string | null, at: string): Comment {
  return {
    id,
    work_package_id: 'w',
    parent_id,
    author_id: null,
    body: id,
    mentions: null,
    reactions: [],
    created_at: at,
    updated_at: at,
  }
}

test('groupThreads keeps roots in order and nests replies beneath their root', () => {
  // root A, root B, then a LATE reply to A — the reply must move under A.
  const threads = groupThreads([
    c('a', null, '2026-01-01T00:00:00Z'),
    c('b', null, '2026-01-02T00:00:00Z'),
    c('r1', 'a', '2026-01-03T00:00:00Z'),
  ])
  assert.deepEqual(
    threads.map((t) => t.root.id),
    ['a', 'b'],
  )
  assert.deepEqual(
    threads[0].replies.map((r) => r.id),
    ['r1'],
  )
})

test('a reply whose root is absent surfaces as a root (never hidden)', () => {
  const threads = groupThreads([c('orphan', 'missing', '2026-01-01T00:00:00Z')])
  assert.equal(threads.length, 1)
  assert.equal(threads[0].root.id, 'orphan')
})

test('replies keep created_at order within their thread', () => {
  const threads = groupThreads([
    c('a', null, '2026-01-01T00:00:00Z'),
    c('r1', 'a', '2026-01-02T00:00:00Z'),
    c('r2', 'a', '2026-01-03T00:00:00Z'),
  ])
  assert.deepEqual(
    threads[0].replies.map((r) => r.id),
    ['r1', 'r2'],
  )
})
