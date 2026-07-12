import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_PROJECT_LIMIT,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  parseSidebarPreferences,
} from './sidebar-preferences.ts'

test('sidebar preferences keep legacy payloads compatible', () => {
  const parsed = parseSidebarPreferences(JSON.stringify({
    collapsed: true,
    hidden: ['/drafts'],
    order: ['/notes', '/my'],
  }))

  assert.equal(parsed.collapsed, true)
  assert.equal(parsed.width, DEFAULT_SIDEBAR_WIDTH)
  assert.equal(parsed.projectNavigation, 'accordion')
  assert.equal(parsed.limitProjects, false)
  assert.equal(parsed.projectLimit, DEFAULT_PROJECT_LIMIT)
  assert.deepEqual(parsed.order.slice(0, 2), ['/notes', '/my'])
})

test('sidebar preferences clamp persisted numeric controls', () => {
  const tooSmall = parseSidebarPreferences(JSON.stringify({ width: 10, projectLimit: 0 }))
  const tooLarge = parseSidebarPreferences(JSON.stringify({
    width: 900,
    projectNavigation: 'tabs',
    limitProjects: true,
    projectLimit: 500,
  }))

  assert.equal(tooSmall.width, MIN_SIDEBAR_WIDTH)
  assert.equal(tooSmall.projectLimit, 1)
  assert.equal(tooLarge.width, MAX_SIDEBAR_WIDTH)
  assert.equal(tooLarge.projectNavigation, 'tabs')
  assert.equal(tooLarge.limitProjects, true)
  assert.equal(tooLarge.projectLimit, 50)
})

test('sidebar preferences recover from corrupt payloads', () => {
  const parsed = parseSidebarPreferences('{broken')
  assert.equal(parsed.width, DEFAULT_SIDEBAR_WIDTH)
  assert.equal(parsed.projectNavigation, 'accordion')
})
