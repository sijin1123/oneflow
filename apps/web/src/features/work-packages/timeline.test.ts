import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dayIndex, pct } from './timeline.ts'

test('dayIndex is a UTC epoch-day and rejects malformed input', () => {
  assert.equal(dayIndex(null), null)
  assert.equal(dayIndex('nonsense'), null)
  const a = dayIndex('2026-07-01')
  const b = dayIndex('2026-07-02')
  assert.ok(a !== null && b !== null && b - a === 1)
})

test('pct maps a day offset into percent', () => {
  assert.equal(pct(5, 10), 50)
  assert.equal(pct(0, 10), 0)
})
