import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  advancedSearchHref,
  commandPaletteSearchKey,
  countCommandPaletteItems,
  filterCommandPaletteItems,
  flattenCommandPaletteResults,
} from './commandPalette.ts'
import type { UnifiedSearchResults } from './api.ts'

const emptyGroup = { items: [], returned: 0, truncated: false }

test('commandPaletteSearchKey trims to the dedicated cache key', () => {
  assert.deepEqual(commandPaletteSearchKey('  구현  '), ['command-palette-search', '구현'])
})

test('advancedSearchHref preserves the query safely', () => {
  assert.equal(
    advancedSearchHref('구현 가이드'),
    '/search?q=%EA%B5%AC%ED%98%84%20%EA%B0%80%EC%9D%B4%EB%93%9C',
  )
  assert.equal(advancedSearchHref('   '), '/search')
})

test('flattenCommandPaletteResults maps every group to a stable route', () => {
  const data: UnifiedSearchResults = {
    query: '구현',
    work_packages: {
      items: [
        {
          id: 'wp-1',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          subject: '워크패키지 API 구현',
          status: 'todo',
          priority: 'high',
          type: 'task',
          due_date: null,
          matched_in: 'content',
          snippet: '본문 구현',
        },
      ],
      returned: 1,
      truncated: false,
    },
    documents: {
      items: [
        {
          id: 'doc-1',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          title: '구현 문서',
          matched_in: 'primary',
          snippet: null,
        },
      ],
      returned: 1,
      truncated: false,
    },
    meetings: {
      items: [
        {
          id: 'mt-1',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          title: '구현 회의',
          matched_in: 'primary',
          snippet: null,
          scheduled_on: '2026-07-09',
        },
      ],
      returned: 1,
      truncated: false,
    },
    cycles: {
      items: [
        {
          id: 'cy-1',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          name: 'Sprint 1',
        },
      ],
      returned: 1,
      truncated: false,
    },
    modules: {
      items: [
        {
          id: 'md-1',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          name: '검색',
        },
      ],
      returned: 1,
      truncated: false,
    },
    initiatives: {
      items: [{ id: 'ini-1', name: '플랫폼 전략', state: 'in_progress' }],
      returned: 1,
      truncated: false,
    },
  }
  assert.deepEqual(
    flattenCommandPaletteResults(data).map((item) => [item.kind, item.href]),
    [
      ['work_packages', '/projects/p-1/work-packages?wp=wp-1'],
      ['documents', '/projects/p-1/documents/doc-1'],
      ['meetings', '/projects/p-1/meetings/mt-1'],
      ['cycles', '/projects/p-1/cycles'],
      ['modules', '/projects/p-1/modules'],
      ['initiatives', '/initiatives?highlight=ini-1'],
    ],
  )
})

test('duplicate ids are only removed inside the same result kind', () => {
  const data: UnifiedSearchResults = {
    query: 'one',
    work_packages: {
      items: [
        {
          id: 'same',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          subject: '첫 작업',
          status: 'todo',
          priority: 'high',
          type: 'task',
          due_date: null,
          matched_in: 'primary',
          snippet: null,
        },
        {
          id: 'same',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          subject: '중복 작업',
          status: 'todo',
          priority: 'high',
          type: 'task',
          due_date: null,
          matched_in: 'primary',
          snippet: null,
        },
      ],
      returned: 2,
      truncated: false,
    },
    documents: {
      items: [
        {
          id: 'same',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          title: '같은 id 문서',
          matched_in: 'primary',
          snippet: null,
        },
      ],
      returned: 1,
      truncated: false,
    },
    meetings: emptyGroup,
    cycles: emptyGroup,
    modules: emptyGroup,
    initiatives: emptyGroup,
  }
  const items = flattenCommandPaletteResults(data)
  assert.deepEqual(items.map((item) => item.key), ['work_packages:same', 'documents:same'])
})

test('counts and tab filters use flattened visible items', () => {
  const items = flattenCommandPaletteResults({
    query: 'one',
    work_packages: emptyGroup,
    documents: {
      items: [
        {
          id: 'doc-1',
          project_id: 'p-1',
          project_key: 'ONE',
          project_name: 'OneFlow 도입',
          title: '구현 문서',
          matched_in: 'primary',
          snippet: null,
        },
      ],
      returned: 1,
      truncated: false,
    },
    meetings: emptyGroup,
    cycles: emptyGroup,
    modules: emptyGroup,
    initiatives: emptyGroup,
  })
  assert.equal(countCommandPaletteItems(items).all, 1)
  assert.equal(countCommandPaletteItems(items).documents, 1)
  assert.equal(filterCommandPaletteItems(items, 'documents').length, 1)
  assert.equal(filterCommandPaletteItems(items, 'work_packages').length, 0)
})
