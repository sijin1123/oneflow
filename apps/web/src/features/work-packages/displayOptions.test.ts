import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseWorkPackageSort,
  serializeWorkPackageSort,
  WORK_PACKAGE_SORT_LABELS,
} from './displayOptions.ts'

describe('work package display sort params', () => {
  it('defaults absent and unknown sort params to created', () => {
    assert.equal(parseWorkPackageSort(null), 'created')
    assert.equal(parseWorkPackageSort(''), 'created')
    assert.equal(parseWorkPackageSort('priority'), 'created')
  })

  it('keeps the supported subject sort', () => {
    assert.equal(parseWorkPackageSort('subject'), 'subject')
  })

  it('serializes the default sort as a clean URL', () => {
    assert.equal(serializeWorkPackageSort('created'), null)
    assert.equal(serializeWorkPackageSort('subject'), 'subject')
  })

  it('has labels for every supported sort', () => {
    assert.equal(WORK_PACKAGE_SORT_LABELS.created, '생성순')
    assert.equal(WORK_PACKAGE_SORT_LABELS.subject, '제목순 (가나다)')
  })
})
