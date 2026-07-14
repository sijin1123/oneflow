import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  COLUMNS_STORAGE_KEY,
  LAYOUT_STORAGE_KEY,
  LatestPreferenceWriter,
  SORT_STORAGE_KEY,
  loadLocalProjectDirectoryPreferences,
  parseProjectDirectoryPreferences,
  type ProjectDirectoryPreferences,
} from './projectDirectoryPreferences.ts'

const preference: ProjectDirectoryPreferences = {
  columns: ['member_count'],
  sort: { key: 'name', dir: 'desc' },
  layout: 'list',
}

test('hydrates a server preference with closed-vocabulary columns in first-occurrence order', () => {
  assert.deepEqual(
    parseProjectDirectoryPreferences({
      columns: ['member_count', 'unknown', 'member_count', 'overdue_count'],
      sort_key: 'name',
      sort_direction: 'desc',
      layout: 'list',
    }),
    { ...preference, columns: ['member_count', 'overdue_count'] },
  )
  assert.equal(
    parseProjectDirectoryPreferences({
      columns: [],
      sort_key: 'default',
      sort_direction: 'asc',
      layout: 'grid',
    })?.columns.length,
    0,
  )
})

test('recognizes a valid legacy local preference for one-time migration', () => {
  const values = new Map<string, string>([
    [COLUMNS_STORAGE_KEY, JSON.stringify(preference.columns)],
    [SORT_STORAGE_KEY, JSON.stringify(preference.sort)],
    [LAYOUT_STORAGE_KEY, preference.layout],
  ])
  const result = loadLocalProjectDirectoryPreferences({
    getItem: (key) => values.get(key) ?? null,
    setItem: () => undefined,
  })
  assert.equal(result.hasLegacy, true)
  assert.equal(result.isValid, true)
  assert.deepEqual(result.preferences, preference)
})

test('keeps the latest preference after a failed save and retries it', async () => {
  const attempts: ProjectDirectoryPreferences[] = []
  const statuses: string[] = []
  let fail = true
  const writer = new LatestPreferenceWriter(async (value: ProjectDirectoryPreferences) => {
    attempts.push(value)
    if (fail) throw new Error('offline')
  }, (status) => statuses.push(status))

  writer.queue(preference)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(statuses.at(-1), 'error')

  fail = false
  writer.retry()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(attempts, [preference, preference])
  assert.equal(statuses.at(-1), 'idle')
})

test('serializes a later interaction after the in-flight preference', async () => {
  const first = { ...preference, layout: 'grid' as const }
  const attempts: ProjectDirectoryPreferences[] = []
  let release: (() => void) | undefined
  const writer = new LatestPreferenceWriter(
    async (value: ProjectDirectoryPreferences) => {
      attempts.push(value)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    },
    () => undefined,
  )

  writer.queue(first)
  writer.queue(preference)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(attempts, [first])
  release?.()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(attempts, [first, preference])
  release?.()
})
