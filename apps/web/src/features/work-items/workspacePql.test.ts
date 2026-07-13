import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendWorkspacePqlSuggestion,
  getWorkspacePqlSuggestions,
  isWorkspacePqlRunnable,
} from './workspacePql.ts'

test('PQL suggestions follow field, operator, value and keyword context', () => {
  assert.deepEqual(getWorkspacePqlSuggestions('').map((item) => item.label), [
    'Title', 'State', 'Priority', 'Project', 'Assignee',
  ])
  assert.deepEqual(getWorkspacePqlSuggestions('priority').map((item) => item.label), [
    '=', '!=', 'IN', 'NOT IN',
  ])
  assert.deepEqual(getWorkspacePqlSuggestions('priority =').map((item) => item.label), [
    'Urgent', 'High', 'Medium', 'Low', 'None',
  ])
  assert.deepEqual(getWorkspacePqlSuggestions('priority = High').map((item) => item.label), [
    'AND', 'OR', 'ORDER BY', 'LIMIT',
  ])
})

test('PQL runnable guard rejects empty, incomplete, unbalanced and oversized drafts', () => {
  assert.equal(isWorkspacePqlRunnable('priority = High'), true)
  assert.equal(isWorkspacePqlRunnable('priority ='), false)
  assert.equal(isWorkspacePqlRunnable('priority IN ('), false)
  assert.equal(isWorkspacePqlRunnable('title = "unfinished'), false)
  assert.equal(isWorkspacePqlRunnable(`title = "${'x'.repeat(1000)}"`), false)
})

test('PQL suggestion insertion preserves the draft and adds one separator', () => {
  const operator = getWorkspacePqlSuggestions('priority')[0]
  assert.equal(appendWorkspacePqlSuggestion('priority', operator), 'priority = ')
  const high = getWorkspacePqlSuggestions('priority =')[1]
  assert.equal(appendWorkspacePqlSuggestion('priority = ', high), 'priority = High')
})
