/* Unit test for local date/time helpers — runs via `node --test`. */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatDateTime, localYearMonth, todayISO } from './datetime.ts'

test('todayISO reflects the local calendar day (timezone-independent)', () => {
  // Construct from LOCAL components so the assertion holds in any runner TZ (CI is
  // UTC): the point is that todayISO reads the same local Y-M-D back out.
  const d = new Date(2026, 0, 1, 0, 30, 0) // local 2026-01-01 00:30
  assert.equal(todayISO(d), '2026-01-01')
  const d2 = new Date(2026, 11, 31, 23, 59, 0) // local 2026-12-31 23:59
  assert.equal(todayISO(d2), '2026-12-31')
})

test('localYearMonth is 1-based and local', () => {
  const d = new Date(2026, 6, 5, 10, 0, 0) // local July → month 7
  assert.deepEqual(localYearMonth(d), { year: 2026, month: 7 })
})

test('formatDateTime returns a non-empty string and echoes garbage safely', () => {
  assert.ok(formatDateTime('2026-07-05T00:00:00Z').length > 0)
  assert.equal(formatDateTime('not-a-date'), 'not-a-date')
})
