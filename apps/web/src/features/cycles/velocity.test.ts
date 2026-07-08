import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Cycle } from './api.ts'
import { recentVelocity } from './velocity.ts'

function cycle(id: string, status: Cycle['status'], end: string, done: number): Cycle {
  return {
    id,
    project_id: 'p',
    name: id,
    description: null,
    start_date: '2026-05-01',
    end_date: end,
    status,
    work_package_count: done + 1,
    done_work_package_count: done,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }
}

test('needs at least two completed cycles; active/undated never count', () => {
  assert.equal(recentVelocity([cycle('a', 'completed', '2026-06-01', 3)]), null)
  assert.equal(
    recentVelocity([
      cycle('a', 'completed', '2026-06-01', 3),
      cycle('b', 'active', '2026-07-01', 9),
    ]),
    null,
  )
})

test('keeps the last n by end date (oldest→newest) and averages', () => {
  const cycles = [
    cycle('c3', 'completed', '2026-06-15', 4),
    cycle('c1', 'completed', '2026-05-15', 2),
    cycle('c2', 'completed', '2026-06-01', 6),
  ]
  const model = recentVelocity(cycles, 2)
  assert.deepEqual(model?.points.map((p) => p.id), ['c2', 'c3'])
  assert.equal(model?.average, 5)
  assert.equal(model?.max, 6)
})
