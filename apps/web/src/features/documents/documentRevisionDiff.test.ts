import assert from 'node:assert/strict'
import test from 'node:test'

import { diffRevisionText } from './documentRevisionDiff.ts'

test('document revision diff marks Korean word additions without losing equal text', () => {
  assert.deepEqual(diffRevisionText('운영 절차를 정리합니다.', '운영 절차를 안전하게 정리합니다.'), [
    { kind: 'equal', value: '운영 절차를 ' },
    { kind: 'added', value: '안전하게 ' },
    { kind: 'equal', value: '정리합니다.' },
  ])
})

test('document revision diff marks replacements as removals and additions', () => {
  assert.deepEqual(diffRevisionText('초기 운영 가이드', '최신 운영 가이드'), [
    { kind: 'removed', value: '초기' },
    { kind: 'added', value: '최신' },
    { kind: 'equal', value: ' 운영 가이드' },
  ])
})

test('document revision diff handles empty and unchanged values', () => {
  assert.deepEqual(diffRevisionText('', '새 본문'), [{ kind: 'added', value: '새 본문' }])
  assert.deepEqual(diffRevisionText('같은 본문', '같은 본문'), [
    { kind: 'equal', value: '같은 본문' },
  ])
})

test('document revision diff keeps substantially replaced sentences readable', () => {
  assert.deepEqual(
    diffRevisionText('운영 절차에 승인 단계를 추가했습니다.', '현재 운영 절차입니다.'),
    [
      { kind: 'removed', value: '운영 절차에 승인 단계를 추가했습니다.' },
      { kind: 'added', value: '현재 운영 절차입니다.' },
    ],
  )
})
