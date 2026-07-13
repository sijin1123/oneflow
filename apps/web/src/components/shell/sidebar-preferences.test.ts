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
  assert.equal(parsed.workspaceExpanded, true)
  assert.equal(parsed.projectsExpanded, true)
  assert.deepEqual(parsed.expandedProjectIds, [])
  assert.equal(parsed.projectDisclosureInitialized, false)
  assert.deepEqual(parsed.pinned, ['/work-items'])
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

test('sidebar preferences retain valid hierarchy and pinned navigation state', () => {
  const parsed = parseSidebarPreferences(JSON.stringify({
    workspaceExpanded: false,
    projectsExpanded: false,
    expandedProjectIds: ['project-1', 'project-1', 5, 'project-2'],
    projectDisclosureInitialized: true,
    pinned: ['/work-items', '/reports', '/projects', '/reports', '/missing'],
  }))

  assert.equal(parsed.workspaceExpanded, false)
  assert.equal(parsed.projectsExpanded, false)
  assert.deepEqual(parsed.expandedProjectIds, ['project-1', 'project-2'])
  assert.equal(parsed.projectDisclosureInitialized, true)
  assert.deepEqual(parsed.pinned, ['/work-items', '/reports'])
})
