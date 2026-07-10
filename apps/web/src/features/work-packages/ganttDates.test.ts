import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ganttDatesToPatch, nextDay, prevDay } from './ganttDates.ts'

test('nextDay/prevDay are symmetric UTC string math across month/year edges', () => {
  assert.equal(nextDay('2026-07-31'), '2026-08-01')
  assert.equal(prevDay('2026-08-01'), '2026-07-31')
  assert.equal(nextDay('2026-12-31'), '2027-01-01')
  assert.equal(prevDay('2026-01-01'), '2025-12-31')
  assert.equal(prevDay(nextDay('2026-02-28')), '2026-02-28')
})

test('ganttDatesToPatch converts exclusive end to inclusive due', () => {
  // A 3-day bar: Jul 1 .. exclusive Jul 4 → due Jul 3 (resize-right shape).
  assert.deepEqual(ganttDatesToPatch(new Date(2026, 6, 1), new Date(2026, 6, 4)), {
    start_date: '2026-07-01',
    due_date: '2026-07-03',
  })
  // One-day bar: start == due (move / resize-left down to a single day).
  assert.deepEqual(ganttDatesToPatch(new Date(2026, 6, 10), new Date(2026, 6, 11)), {
    start_date: '2026-07-10',
    due_date: '2026-07-10',
  })
  // Local date PARTS only — a late-evening local Date never shifts the day.
  assert.deepEqual(
    ganttDatesToPatch(new Date(2026, 0, 31, 23, 30), new Date(2026, 1, 1, 23, 30)),
    { start_date: '2026-01-31', due_date: '2026-01-31' },
  )
})
