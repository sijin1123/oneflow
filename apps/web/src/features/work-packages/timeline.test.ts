import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  dayIndex,
  parseTimelineFocus,
  parseZoomLevel,
  pct,
  shiftTimelineFocus,
} from './timeline.ts'

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

test('timeline URL state accepts only canonical scale and focus values', () => {
  assert.equal(parseZoomLevel('week'), 'week')
  assert.equal(parseZoomLevel('quarter'), 'fit')
  assert.equal(parseTimelineFocus('2026-07-27', '2026-01-01'), '2026-07-27')
  assert.equal(parseTimelineFocus('2026-02-30', '2026-01-01'), '2026-01-01')
  assert.equal(parseTimelineFocus('later', '2026-01-01'), '2026-01-01')
})

test('timeline focus navigation follows the active scale', () => {
  assert.equal(shiftTimelineFocus('2026-07-27', 'day', 1), '2026-07-28')
  assert.equal(shiftTimelineFocus('2026-07-27', 'week', -1), '2026-07-20')
  assert.equal(shiftTimelineFocus('2026-01-31', 'month', 1), '2026-03-02')
})
