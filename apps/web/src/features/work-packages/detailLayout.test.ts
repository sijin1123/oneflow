import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_DETAIL_LAYOUT,
  parseDetailLayout,
  serializeDetailLayout,
} from './detailLayout.ts'

test('detail layout recovers absent, corrupt and partial preferences', () => {
  assert.deepEqual(parseDetailLayout(null), DEFAULT_DETAIL_LAYOUT)
  assert.deepEqual(parseDetailLayout('{broken'), DEFAULT_DETAIL_LAYOUT)
  assert.deepEqual(parseDetailLayout('{"panelWidth":32}'), { panelWidth: 32, labelWidth: 30 })
})

test('detail layout rounds and clamps both slider values to 20-40', () => {
  assert.deepEqual(parseDetailLayout('{"panelWidth":9,"labelWidth":47.6}'), {
    panelWidth: 20,
    labelWidth: 40,
  })
  assert.deepEqual(parseDetailLayout('{"panelWidth":27.4,"labelWidth":33.7}'), {
    panelWidth: 27,
    labelWidth: 34,
  })
})

test('detail layout serialization is canonical and round-trips', () => {
  const serialized = serializeDetailLayout({ panelWidth: 31, labelWidth: 29 })
  assert.equal(serialized, '{"panelWidth":31,"labelWidth":29}')
  assert.deepEqual(parseDetailLayout(serialized), { panelWidth: 31, labelWidth: 29 })
})
