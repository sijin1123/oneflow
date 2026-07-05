/* Unit test for local date/time helpers — runs via `node --test`. */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatDateTime, localYearMonth, todayISO } from './datetime.ts'

test('todayISO uses the LOCAL date, not UTC', () => {
  // 2026-01-01 00:30 in UTC+9 is still 2026-01-01 locally but 2025-12-31 in UTC —
  // the marker must follow the local calendar day.
  const kst = new Date('2026-01-01T00:30:00+09:00')
  assert.equal(todayISO(kst), '2026-01-01')
})

test('localYearMonth is 1-based and local', () => {
  const d = new Date('2026-07-05T10:00:00+09:00')
  assert.deepEqual(localYearMonth(d), { year: 2026, month: 7 })
})

test('formatDateTime returns a non-empty string and echoes garbage safely', () => {
  assert.ok(formatDateTime('2026-07-05T00:00:00Z').length > 0)
  assert.equal(formatDateTime('not-a-date'), 'not-a-date')
})
