import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  OverlayRegistry,
  isCommandPaletteOpenShortcut,
  isEditableShortcutTarget,
  isGlobalShortcutAllowed,
} from './shortcuts.ts'

type FakeElement = {
  tagName: string
  parentElement: FakeElement | null
  isContentEditable?: boolean
  attrs: Record<string, string>
  classes: Set<string>
  getAttribute: (name: string) => string | null
  classList: { contains: (name: string) => boolean }
}

function el(
  tagName: string,
  options: { parent?: FakeElement | null; attrs?: Record<string, string>; classes?: string[] } = {},
): FakeElement {
  const node: FakeElement = {
    tagName,
    parentElement: options.parent ?? null,
    attrs: options.attrs ?? {},
    classes: new Set(options.classes ?? []),
    getAttribute(name: string) {
      return this.attrs[name] ?? null
    },
    classList: {
      contains(name: string) {
        return node.classes.has(name)
      },
    },
  }
  return node
}

function target(node: FakeElement): EventTarget {
  return node as unknown as EventTarget
}

test('global shortcuts ignore editable form fields', () => {
  const input = el('input')
  assert.equal(isEditableShortcutTarget(target(input)), true)
  assert.equal(
    isGlobalShortcutAllowed({ key: 'k', metaKey: true, target: target(input) }, 0),
    false,
  )
})

test('global shortcuts ignore contenteditable and Tiptap ancestors', () => {
  const editableParent = el('div', { attrs: { contenteditable: 'true' } })
  const child = el('span', { parent: editableParent })
  assert.equal(isEditableShortcutTarget(target(child)), true)

  const tiptapRoot = el('div', { classes: ['ProseMirror'] })
  const nestedText = el('span', { parent: tiptapRoot })
  assert.equal(isEditableShortcutTarget(target(nestedText)), true)
})

test('IME composition and repeated keydown events cannot open global shortcuts', () => {
  const shell = el('div')
  assert.equal(
    isCommandPaletteOpenShortcut({ key: 'k', metaKey: true, isComposing: true, target: target(shell) }, 0),
    false,
  )
  assert.equal(
    isCommandPaletteOpenShortcut({ key: '/', repeat: true, target: target(shell) }, 0),
    false,
  )
})

test('overlay registry blocks global open shortcuts while a layer is active', () => {
  const registry = new OverlayRegistry()
  const closeSheet = registry.register('sheet')
  const closeMenu = registry.register('menu')
  assert.equal(registry.openCount, 2)
  assert.equal(registry.hasOpenOverlays, true)

  const shell = el('div')
  assert.equal(
    isGlobalShortcutAllowed({ key: 'k', metaKey: true, target: target(shell) }, registry.openCount),
    false,
  )

  closeSheet()
  assert.equal(registry.openCount, 1)
  closeMenu()
  assert.equal(registry.openCount, 0)
  assert.equal(registry.hasOpenOverlays, false)
})

test('ordinary shell targets allow only command palette open shortcuts', () => {
  const shell = el('main')
  assert.equal(
    isCommandPaletteOpenShortcut({ key: 'k', metaKey: true, target: target(shell) }, 0),
    true,
  )
  assert.equal(
    isCommandPaletteOpenShortcut({ key: 'k', ctrlKey: true, target: target(shell) }, 0),
    true,
  )
  assert.equal(isCommandPaletteOpenShortcut({ key: '/', target: target(shell) }, 0), true)
  assert.equal(
    isCommandPaletteOpenShortcut({ key: 'f', metaKey: true, target: target(shell) }, 0),
    false,
  )
})
