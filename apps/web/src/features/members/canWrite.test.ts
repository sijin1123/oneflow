import assert from 'node:assert/strict'
import { test } from 'node:test'

import { canWriteFrom } from './canWrite.ts'

test('canWriteFrom: owner/member on an active project can write', () => {
  assert.equal(canWriteFrom('owner', null, true), true)
  assert.equal(canWriteFrom('member', null, true), true)
})

test('canWriteFrom: viewer and non-member cannot write', () => {
  assert.equal(canWriteFrom('viewer', null, true), false)
  assert.equal(canWriteFrom(undefined, null, true), false)
})

test('canWriteFrom: archived project denies even an owner (server 409 parity)', () => {
  assert.equal(canWriteFrom('owner', '2026-07-06T00:00:00Z', true), false)
})

test('canWriteFrom: fail-closed while queries are still loading', () => {
  assert.equal(canWriteFrom('owner', null, false), false)
})
