import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const approvedAssetHashes = {
  'oneflow-login-origin-reference.png':
    '62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76',
  'oneflow-login-origin-reference@2x.png':
    'af72db2bd4fbd19e4dbce706fe14fab428eb7710576d81c0da205ddc455d3fae',
  'oneflow-login-story-reference.png':
    '40e4c8969521a17df4f405652f46a9046823798cc0a7b7a89f42247d36edaf48',
  'oneflow-login-story-reference-667x915.png':
    'e3ccb4be6188cd08170301884115e0578c3994689cab86588cb9d85b25d96aea',
  'oneflow-login-story-reference@2x.png':
    '88bb8a2daeddd5c844a760694f44203c5a65b4371bda4078e8e3bfc4c94a0bea',
  'oneflow-login-logo-lockup.png':
    'b6360179356f752ab48ef31ba92b85b030b9d3267af252dcee48c004c9609c2f',
  'oneflow-login-logo-lockup-173x59.png':
    '9d97cbc7b8804162f4d893d89a20db42f7e901e9fb5fbc8f14e791d1147a5202',
  'oneflow-login-logo-lockup@2x.png':
    '79cc1a160f51c729f5209b08d0c7df75954e9039c2fbd53339d97b04d1fa383a',
} as const

test('승인된 OneFlow 로그인 원본과 파생 crop은 바이트 단위로 유지된다', () => {
  for (const [filename, approvedHash] of Object.entries(approvedAssetHashes)) {
    const asset = readFileSync(new URL(`../../assets/generated/${filename}`, import.meta.url))
    const actualHash = createHash('sha256').update(asset).digest('hex')

    assert.equal(actualHash, approvedHash, `${filename} must match the approved login artwork`)
  }
})
