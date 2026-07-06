import assert from 'node:assert/strict'
import { test } from 'node:test'

import { branchIds, buildTree, countNodes } from './tree.ts'
import type { WorkPackage } from './types.ts'

function wp(id: string, parent_id: string | null): WorkPackage {
  return {
    id,
    project_id: 'p',
    subject: id,
    description: null,
    type: 'task',
    status: 'todo',
    priority: 'none',
    assignee_id: null,
    parent_id,
    milestone_id: null,
  cycle_id: null,
  module_id: null,
    start_date: null,
    due_date: null,
    estimated_hours: null,
    version: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

test('buildTree nests children under their parent', () => {
  const tree = buildTree([wp('a', null), wp('b', 'a'), wp('c', 'b'), wp('d', null)])
  assert.equal(tree.length, 2) // a, d are roots
  const a = tree.find((n) => n.wp.id === 'a')!
  assert.equal(a.children.length, 1)
  assert.equal(a.children[0].wp.id, 'b')
  assert.equal(a.children[0].depth, 1)
  assert.equal(a.children[0].children[0].wp.id, 'c')
  assert.equal(a.children[0].children[0].depth, 2)
})

test('a node whose parent is absent surfaces as a root', () => {
  // parent "ghost" is not in the set → b is treated as a root, never hidden
  const tree = buildTree([wp('b', 'ghost')])
  assert.equal(tree.length, 1)
  assert.equal(tree[0].wp.id, 'b')
  assert.equal(tree[0].depth, 0)
})

test('a residual cycle cannot cause infinite recursion', () => {
  // a→b→a would be rejected by the backend; the builder must still terminate.
  const tree = buildTree([wp('a', 'b'), wp('b', 'a')])
  // both have an in-set parent, so neither is a root → empty forest, no hang
  assert.equal(countNodes(tree), 0)
})

test('branchIds returns only nodes that have children', () => {
  const tree = buildTree([wp('a', null), wp('b', 'a'), wp('c', null)])
  assert.deepEqual(branchIds(tree), ['a'])
})
