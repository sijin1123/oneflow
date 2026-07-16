import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Notification } from './api.ts'
import {
  getNotificationKindLabel,
  getNotificationMessage,
  getNotificationTargetPath,
} from './view.ts'

const initiativeNotification: Notification = {
  id: 'notification-1',
  kind: 'initiative_health',
  project_id: null,
  initiative_id: 'initiative / 1',
  work_package_id: null,
  intake_item_id: null,
  work_package_subject: null,
  initiative_name: '제품 전략',
  actor_name: 'Strategy Lead',
  read: false,
  created_at: '2026-07-15T00:00:00Z',
}

test('initiative notifications render and route directly to their detail query', () => {
  assert.equal(getNotificationKindLabel(initiativeNotification), '이니셔티브')
  assert.match(
    getNotificationMessage(initiativeNotification),
    /'제품 전략' 헬스를 업데이트했습니다\./,
  )
  assert.equal(
    getNotificationTargetPath(initiativeNotification),
    '/initiatives?initiative=initiative%20%2F%201',
  )
})

test('malformed project notifications do not invent a project route', () => {
  assert.equal(
    getNotificationTargetPath({
      ...initiativeNotification,
      kind: 'assigned',
      initiative_id: null,
      work_package_id: 'work-1',
    }),
    null,
  )
})

test('document mention notifications render and route to the exact document', () => {
  const documentNotification: Notification = {
    ...initiativeNotification,
    kind: 'document_mention',
    project_id: 'project / 1',
    initiative_id: null,
    document_id: 'document / 1',
    document_title: '제품 결정 기록',
  }
  assert.equal(getNotificationKindLabel(documentNotification), '멘션')
  assert.match(getNotificationMessage(documentNotification), /'제품 결정 기록' 문서 코멘트/)
  assert.equal(
    getNotificationTargetPath(documentNotification),
    '/projects/project%20%2F%201/documents/document%20%2F%201',
  )
})
