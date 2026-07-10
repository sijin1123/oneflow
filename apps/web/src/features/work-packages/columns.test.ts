import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_COLUMNS,
  LIST_COLUMNS,
  parseColumns,
  serializeColumns,
} from './columns.ts'

describe('parseColumns', () => {
  it('absent param yields the default five columns', () => {
    assert.deepEqual(parseColumns(null), DEFAULT_COLUMNS)
  })

  it('keeps canonical order regardless of input order and drops duplicates', () => {
    assert.deepEqual(parseColumns('due_date,type,type,status'), ['type', 'status', 'due_date'])
  })

  it('silently ignores unknown keys and trims whitespace', () => {
    assert.deepEqual(parseColumns(' start_date , nope ,assignee'), ['assignee', 'start_date'])
  })

  it('empty or all-unknown values fall back to the defaults', () => {
    assert.deepEqual(parseColumns(''), DEFAULT_COLUMNS)
    assert.deepEqual(parseColumns('nope,zilch'), DEFAULT_COLUMNS)
  })
})

describe('serializeColumns', () => {
  it('returns null for the default set (clean URLs)', () => {
    assert.equal(serializeColumns([...DEFAULT_COLUMNS]), null)
    assert.equal(serializeColumns(['due_date', 'assignee', 'priority', 'status', 'type']), null)
  })

  it('canonicalizes order for non-default sets', () => {
    assert.equal(serializeColumns(['created_at', 'type']), 'type,created_at')
  })

  it('round-trips through parse — URL with unknowns saves clean (R1-④)', () => {
    const fromUrl = parseColumns('created_at,bogus,type')
    assert.equal(serializeColumns(fromUrl), 'type,created_at')
  })

  it('full set serializes to every canonical key', () => {
    assert.equal(serializeColumns([...LIST_COLUMNS]), LIST_COLUMNS.join(','))
  })
})
