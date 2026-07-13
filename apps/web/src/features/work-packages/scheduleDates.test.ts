import assert from 'node:assert/strict'
import test from 'node:test'

import { formatScheduleDate, validateScheduleDates } from './scheduleDates.ts'

test('schedule date validation accepts unset, ordered and same-day values', () => {
  assert.equal(validateScheduleDates(null, null), null)
  assert.equal(validateScheduleDates('2026-07-01', null), null)
  assert.equal(validateScheduleDates(null, '2026-07-15'), null)
  assert.equal(validateScheduleDates('2026-07-01', '2026-07-15'), null)
  assert.equal(validateScheduleDates('2026-07-15', '2026-07-15'), null)
})

test('schedule date validation rejects a reversed range without timezone conversion', () => {
  assert.equal(
    validateScheduleDates('2026-07-16', '2026-07-15'),
    '시작일은 기한보다 늦을 수 없습니다.',
  )
})

test('schedule date display formats valid date-only strings and preserves unknown input', () => {
  assert.equal(formatScheduleDate(null), '미설정')
  assert.equal(formatScheduleDate('2026-07-01'), '2026. 7. 1.')
  assert.equal(formatScheduleDate('not-a-date'), 'not-a-date')
})
