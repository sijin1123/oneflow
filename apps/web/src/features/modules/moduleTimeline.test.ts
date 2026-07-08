import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ProjectModule } from './api.ts'
import { moduleBars } from './moduleTimeline.ts'

function mod(id: string, start: string | null, target: string | null): ProjectModule {
  return {
    id,
    project_id: 'p',
    name: id,
    description: null,
    lead_id: null,
    state: 'in_progress',
    start_date: start,
    target_date: target,
    work_package_count: 0,
    done_work_package_count: 0,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }
}

test('needs both dates for a bar; undated collects the rest; null when no bars', () => {
  assert.equal(moduleBars([mod('a', null, '2026-07-10')], 0), null)
  const model = moduleBars([mod('a', '2026-07-01', '2026-07-10'), mod('b', null, null)], 0)
  assert.equal(model?.bars.length, 1)
  assert.deepEqual(model?.undated.map((m) => m.id), ['b'])
})

test('range covers bars plus today with padding; reversed dates normalize', () => {
  const today = 20642 // arbitrary UTC day index
  const model = moduleBars([mod('a', '2026-07-10', '2026-07-01')], today)
  assert.ok(model)
  assert.ok(model.bars[0].startIdx < model.bars[0].endIdx)
  assert.ok(model.rangeStart <= Math.min(model.bars[0].startIdx, today) - 2)
  assert.ok(model.rangeEnd >= Math.max(model.bars[0].endIdx, today) + 2)
})
