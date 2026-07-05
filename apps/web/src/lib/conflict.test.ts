/* Unit test for the 409 decision pure function — runs via `node --test`
   (Node 24 type stripping; erasable syntax only). */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decideOnPatchError } from './conflict.ts'

test('409 → notify + invalidate with Korean message', () => {
  const d = decideOnPatchError(409)
  assert.equal(d.notify, true)
  assert.equal(d.invalidate, true)
  assert.ok(d.message && d.message.length > 0)
})

test('non-conflict statuses do not trigger the conflict flow', () => {
  for (const status of [200, 404, 422, 500, 503]) {
    const d = decideOnPatchError(status)
    assert.equal(d.notify, false)
    assert.equal(d.invalidate, false)
    assert.equal(d.message, null)
  }
})
