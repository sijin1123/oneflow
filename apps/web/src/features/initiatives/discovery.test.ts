import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Initiative } from './api.ts'
import {
  countActiveInitiativeDiscovery,
  DEFAULT_INITIATIVE_DISCOVERY,
  discoverInitiatives,
  readInitiativeDiscovery,
} from './discovery.ts'

function initiative(overrides: Partial<Initiative> & Pick<Initiative, 'id' | 'name'>): Initiative {
  return {
    description: null,
    owner_id: 'owner-1',
    owner_name: 'Owner',
    owner_active: true,
    state: 'planned',
    start_date: null,
    target_date: null,
    health: null,
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    is_mine: false,
    can_claim_ownership: false,
    connected_project_count: 0,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [],
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

const items = [
  initiative({
    id: 'mine',
    name: '플랫폼 전환',
    description: '클라우드 기반',
    state: 'in_progress',
    health: 'at_risk',
    is_mine: true,
    target_date: '2027-09-30',
    updated_at: '2026-07-03T00:00:00Z',
  }),
  initiative({
    id: 'shared',
    name: '고객 경험',
    owner_name: 'Mina',
    health: 'on_track',
    target_date: '2027-04-01',
    labels: [{ id: 'label-1', name: '성장', color: '#2563eb', created_at: '', updated_at: '' }],
  }),
  initiative({ id: 'orphan', name: '운영 자동화', owner_id: null, owner_name: null }),
]

test('reads only closed discovery values and bounds the URL query', () => {
  const parsed = readInitiativeDiscovery(
    new URLSearchParams(`q=${'x'.repeat(140)}&state=unknown&health=off_track&owner=mine&sort=name_asc`),
  )
  assert.equal(parsed.query.length, 120)
  assert.equal(parsed.state, 'all')
  assert.equal(parsed.health, 'off_track')
  assert.equal(parsed.ownership, 'mine')
  assert.equal(parsed.sort, 'name_asc')
})

test('combines semantic search, lifecycle, health and ownership filters', () => {
  assert.deepEqual(
    discoverInitiatives(items, {
      query: '클라우드',
      state: 'in_progress',
      health: 'at_risk',
      ownership: 'mine',
      sort: 'updated_desc',
    }).map((item) => item.id),
    ['mine'],
  )
  assert.deepEqual(
    discoverInitiatives(items, {
      ...DEFAULT_INITIATIVE_DISCOVERY,
      query: '성장',
      ownership: 'shared',
    }).map((item) => item.id),
    ['shared'],
  )
  assert.deepEqual(
    discoverInitiatives(items, {
      ...DEFAULT_INITIATIVE_DISCOVERY,
      health: 'unreported',
      ownership: 'unowned',
    }).map((item) => item.id),
    ['orphan'],
  )
})

test('sorts deterministically and puts undated targets last without mutating source', () => {
  const original = items.map((item) => item.id)
  assert.deepEqual(
    discoverInitiatives(items, { ...DEFAULT_INITIATIVE_DISCOVERY, sort: 'target_asc' }).map(
      (item) => item.id,
    ),
    ['shared', 'mine', 'orphan'],
  )
  assert.deepEqual(items.map((item) => item.id), original)
})

test('counts non-default controls including the server-authoritative label', () => {
  assert.equal(countActiveInitiativeDiscovery(DEFAULT_INITIATIVE_DISCOVERY, ''), 0)
  assert.equal(
    countActiveInitiativeDiscovery(
      { ...DEFAULT_INITIATIVE_DISCOVERY, query: 'platform', sort: 'name_asc' },
      'label-1',
    ),
    3,
  )
})
