import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { DocumentListItem } from './api.ts'
import { buildDocTree, subtreeIds } from './tree.ts'

function doc(id: string, parent_id: string | null, title = id): DocumentListItem {
  return {
    id,
    project_id: 'p',
    parent_id,
    title,
    author_id: null,
    version: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

test('buildDocTree nests children and sorts siblings by title', () => {
  const forest = buildDocTree([doc('b', null, '나'), doc('a', null, '가'), doc('c', 'a', '하위')])
  assert.deepEqual(
    forest.map((n) => n.doc.id),
    ['a', 'b'],
  )
  assert.equal(forest[0].children[0].doc.id, 'c')
  assert.equal(forest[0].children[0].depth, 1)
})

test('buildDocTree surfaces orphans (absent parent) as roots', () => {
  const forest = buildDocTree([doc('x', 'missing')])
  assert.equal(forest.length, 1)
  assert.equal(forest[0].depth, 0)
})

test('buildDocTree renders each doc exactly once under a residual cycle', () => {
  // a↔b cycle (backend forbids it; the renderer must still terminate).
  const forest = buildDocTree([doc('a', 'b'), doc('b', 'a')])
  const count = (nodes: ReturnType<typeof buildDocTree>): number =>
    nodes.reduce((n, node) => n + 1 + count(node.children), 0)
  assert.equal(count(forest), 2)
})

test('subtreeIds covers the document and all descendants', () => {
  const items = [doc('r', null), doc('c1', 'r'), doc('c2', 'r'), doc('g', 'c1'), doc('z', null)]
  assert.deepEqual([...subtreeIds(items, 'r')].sort(), ['c1', 'c2', 'g', 'r'])
  assert.deepEqual([...subtreeIds(items, 'z')], ['z'])
})
