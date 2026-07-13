import assert from 'node:assert/strict'
import test from 'node:test'

import type { SearchResultItem } from '@/features/search/api'

import {
  buildWorkspaceCalendar,
  buildWorkspaceTimeline,
  parseWorkspaceMonth,
  shiftWorkspaceMonth,
  workspaceMonthKey,
} from './workspaceViews.ts'

function item(
  id: string,
  dates: { start?: string | null; due?: string | null },
): SearchResultItem {
  return {
    id,
    project_id: 'project-1',
    project_key: 'ONE',
    project_name: 'OneFlow',
    subject: `Item ${id}`,
    status: 'todo',
    priority: 'medium',
    type: 'task',
    start_date: dates.start ?? null,
    due_date: dates.due ?? null,
    version: 0,
    current_user_can_write: false,
    matched_in: 'primary',
    snippet: null,
  }
}

test('workspace calendar buckets exact date-only due dates and keeps missing due dates visible', () => {
  const due = item('due', { due: '2026-07-15' })
  const epoch = item('epoch', { due: '1970-01-01' })
  const noDue = item('no-due', { start: '2026-07-10' })
  const invalid = item('invalid', { due: '2026-02-31' })
  const calendar = buildWorkspaceCalendar(2026, 7, [due, epoch, noDue, invalid])

  const target = calendar.weeks.flat().find((day) => day.iso === '2026-07-15')
  assert.deepEqual(target?.items.map((row) => row.id), ['due'])
  assert.deepEqual(calendar.withoutDue.map((row) => row.id), ['no-due', 'invalid'])
  assert.deepEqual(
    buildWorkspaceCalendar(1970, 1, [epoch]).weeks.flat()
      .find((day) => day.iso === '1970-01-01')?.items.map((row) => row.id),
    ['epoch'],
  )
  assert.equal(calendar.weeks.every((week) => week.length === 7), true)
})

test('workspace month shift normalizes year boundaries', () => {
  assert.deepEqual(shiftWorkspaceMonth(2026, 1, -1), { year: 2025, month: 12 })
  assert.deepEqual(shiftWorkspaceMonth(2026, 12, 1), { year: 2027, month: 1 })
  assert.deepEqual(parseWorkspaceMonth('2026-07'), { year: 2026, month: 7 })
  assert.equal(parseWorkspaceMonth('2026-13'), null)
  assert.equal(parseWorkspaceMonth('0000-12'), null)
  assert.equal(workspaceMonthKey({ year: 2026, month: 7 }), '2026-07')
})

test('workspace timeline normalizes one-ended and reversed ranges and partitions undated items', () => {
  const single = item('single', { start: '2026-07-10' })
  const reversed = item('reversed', { start: '2026-07-20', due: '2026-07-15' })
  const undated = item('undated', {})
  const timeline = buildWorkspaceTimeline([single, reversed, undated])

  assert.equal(timeline.start, '2026-07-10')
  assert.equal(timeline.end, '2026-07-20')
  assert.equal(timeline.spanDays, 11)
  assert.deepEqual(timeline.undated.map((row) => row.id), ['undated'])
  assert.deepEqual(
    timeline.rows.map((row) => [row.item.id, row.start, row.end]),
    [
      ['single', '2026-07-10', '2026-07-10'],
      ['reversed', '2026-07-15', '2026-07-20'],
    ],
  )
  assert.equal(timeline.rows[0].leftPercent, 0)
  assert.ok(timeline.rows[0].widthPercent > 0)
  assert.ok(timeline.rows[1].leftPercent > timeline.rows[0].leftPercent)
})

test('workspace timeline bars stay inside a long derived range', () => {
  const first = item('first', { due: '2020-01-01' })
  const last = item('last', { due: '2030-01-01' })
  const timeline = buildWorkspaceTimeline([first, last])

  assert.ok(timeline.spanDays > 3650)
  for (const row of timeline.rows) {
    assert.ok(row.leftPercent >= 0)
    assert.ok(row.widthPercent > 0)
    assert.ok(row.leftPercent + row.widthPercent <= 100)
  }
})
