export const COMMAND_PALETTE_OPEN_EVENT = 'oneflow:command-palette-open'

export type GlobalShortcutEventLike = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  repeat?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  target?: EventTarget | null
}

type ElementLike = {
  tagName?: string
  parentElement?: unknown
  parentNode?: unknown
  isContentEditable?: boolean
  getAttribute?: (name: string) => string | null
  classList?: { contains: (name: string) => boolean }
}

const editableTags = new Set(['input', 'select', 'textarea'])
const textboxRoles = new Set(['searchbox', 'textbox'])

function asElementLike(value: unknown): ElementLike | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as ElementLike
  if (
    typeof candidate.tagName === 'string' ||
    typeof candidate.getAttribute === 'function' ||
    typeof candidate.parentElement === 'object' ||
    typeof candidate.parentNode === 'object'
  ) {
    return candidate
  }
  return null
}

function attr(element: ElementLike, name: string): string | null {
  return typeof element.getAttribute === 'function' ? element.getAttribute(name) : null
}

function classContains(element: ElementLike, name: string): boolean {
  return element.classList?.contains(name) === true
}

function nextParent(element: ElementLike): ElementLike | null {
  return asElementLike(element.parentElement) ?? asElementLike(element.parentNode)
}

export function isEditableShortcutTarget(target: EventTarget | null | undefined): boolean {
  let element = asElementLike(target)
  while (element) {
    const tagName = element.tagName?.toLowerCase()
    if (tagName && editableTags.has(tagName)) return true
    if (element.isContentEditable === true) return true

    const contentEditable = attr(element, 'contenteditable')
    if (contentEditable !== null && contentEditable.toLowerCase() !== 'false') return true

    const role = attr(element, 'role')?.toLowerCase()
    if (role && textboxRoles.has(role)) return true

    if (
      classContains(element, 'ProseMirror') ||
      attr(element, 'data-tiptap-editor') !== null ||
      attr(element, 'data-oneflow-rich-text-editor') !== null
    ) {
      return true
    }

    element = nextParent(element)
  }
  return false
}

export function isGlobalShortcutAllowed(
  event: GlobalShortcutEventLike,
  overlayOpenCount: number,
): boolean {
  if (event.defaultPrevented) return false
  if (event.repeat) return false
  if (event.isComposing) return false
  if (overlayOpenCount > 0) return false
  return !isEditableShortcutTarget(event.target)
}

export function isCommandPaletteOpenShortcut(
  event: GlobalShortcutEventLike,
  overlayOpenCount: number,
): boolean {
  if (!isGlobalShortcutAllowed(event, overlayOpenCount)) return false
  const key = event.key.toLowerCase()
  if (key === 'k' && (event.metaKey === true || event.ctrlKey === true)) {
    return event.altKey !== true && event.shiftKey !== true
  }
  return event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey
}

export class OverlayRegistry {
  private readonly registrations = new Set<symbol>()

  register(label = 'overlay'): () => void {
    const token = Symbol(label)
    this.registrations.add(token)
    return () => {
      this.registrations.delete(token)
    }
  }

  get openCount(): number {
    return this.registrations.size
  }

  get hasOpenOverlays(): boolean {
    return this.openCount > 0
  }
}

export const appOverlayRegistry = new OverlayRegistry()
