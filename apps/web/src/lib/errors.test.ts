/* Unit test for the API error-body parser — runs via `node --test`
   (Node 24 type stripping; erasable syntax only, no import.meta/DOM). */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { detailFromPayload } from './errors.ts'

test('string detail passes through', () => {
  assert.equal(detailFromPayload({ detail: '이미 존재합니다' }), '이미 존재합니다')
})

test('422 validation array becomes "field: msg"', () => {
  const payload = {
    detail: [{ loc: ['body', 'hours'], msg: 'hours must be at least 0.01', type: 'value_error' }],
  }
  assert.equal(detailFromPayload(payload), 'hours: hours must be at least 0.01')
})

test('array without loc falls back to msg only', () => {
  assert.equal(detailFromPayload({ detail: [{ msg: '잘못된 값' }] }), '잘못된 값')
})

test('unknown / empty bodies return null', () => {
  assert.equal(detailFromPayload({}), null)
  assert.equal(detailFromPayload(null), null)
  assert.equal(detailFromPayload({ detail: [] }), null)
})
