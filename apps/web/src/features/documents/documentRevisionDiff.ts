export type RevisionDiffKind = 'equal' | 'added' | 'removed'

export type RevisionDiffPart = {
  kind: RevisionDiffKind
  value: string
}

const MAX_MATRIX_CELLS = 400_000

function appendPart(parts: RevisionDiffPart[], kind: RevisionDiffKind, value: string) {
  if (!value) return
  const previous = parts.at(-1)
  if (previous?.kind === kind) {
    previous.value += value
    return
  }
  parts.push({ kind, value })
}

function segmentWords(value: string): string[] {
  if (!value) return []
  return Array.from(new Intl.Segmenter('ko', { granularity: 'word' }).segment(value), ({ segment }) => segment)
}

function segmentLines(value: string): string[] {
  return value.match(/.*(?:\n|$)/gu)?.filter(Boolean) ?? []
}

function diffTokens(base: string[], target: string[]): RevisionDiffPart[] {
  if (base.length === 0) return target.length ? [{ kind: 'added', value: target.join('') }] : []
  if (target.length === 0) return [{ kind: 'removed', value: base.join('') }]

  const width = target.length + 1
  const table = new Uint32Array((base.length + 1) * width)
  for (let baseIndex = base.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let targetIndex = target.length - 1; targetIndex >= 0; targetIndex -= 1) {
      const index = baseIndex * width + targetIndex
      table[index] =
        base[baseIndex] === target[targetIndex]
          ? table[(baseIndex + 1) * width + targetIndex + 1] + 1
          : Math.max(table[(baseIndex + 1) * width + targetIndex], table[index + 1])
    }
  }

  const parts: RevisionDiffPart[] = []
  let baseIndex = 0
  let targetIndex = 0
  while (baseIndex < base.length && targetIndex < target.length) {
    if (base[baseIndex] === target[targetIndex]) {
      appendPart(parts, 'equal', base[baseIndex])
      baseIndex += 1
      targetIndex += 1
      continue
    }
    if (
      table[(baseIndex + 1) * width + targetIndex] >=
      table[baseIndex * width + targetIndex + 1]
    ) {
      appendPart(parts, 'removed', base[baseIndex])
      baseIndex += 1
    } else {
      appendPart(parts, 'added', target[targetIndex])
      targetIndex += 1
    }
  }
  while (baseIndex < base.length) {
    appendPart(parts, 'removed', base[baseIndex])
    baseIndex += 1
  }
  while (targetIndex < target.length) {
    appendPart(parts, 'added', target[targetIndex])
    targetIndex += 1
  }
  return parts
}

export function diffRevisionText(base: string, target: string): RevisionDiffPart[] {
  if (base === target) return base ? [{ kind: 'equal', value: base }] : []

  const baseWords = segmentWords(base)
  const targetWords = segmentWords(target)
  if (baseWords.length * targetWords.length <= MAX_MATRIX_CELLS) {
    const parts = diffTokens(baseWords, targetWords)
    const equalLength = parts
      .filter((part) => part.kind === 'equal')
      .reduce((total, part) => total + part.value.length, 0)
    if (equalLength / Math.max(base.length, target.length) < 0.5) {
      return [
        ...(base ? [{ kind: 'removed' as const, value: base }] : []),
        ...(target ? [{ kind: 'added' as const, value: target }] : []),
      ]
    }
    return parts
  }

  const baseLines = segmentLines(base)
  const targetLines = segmentLines(target)
  if (baseLines.length * targetLines.length <= MAX_MATRIX_CELLS) {
    return diffTokens(baseLines, targetLines)
  }

  return [
    ...(base ? [{ kind: 'removed' as const, value: base }] : []),
    ...(target ? [{ kind: 'added' as const, value: target }] : []),
  ]
}

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
])

export function revisionBodyText(body: string | null): string {
  if (!body) return ''
  const parsed = new DOMParser().parseFromString(body, 'text/html')
  const chunks: string[] = []

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      chunks.push(node.textContent ?? '')
      return
    }
    if (!(node instanceof Element)) return
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return
    if (node.tagName === 'BR') {
      chunks.push('\n')
      return
    }
    node.childNodes.forEach(visit)
    if (BLOCK_TAGS.has(node.tagName)) chunks.push('\n')
  }

  parsed.body.childNodes.forEach(visit)
  return chunks
    .join('')
    .replace(/\u00a0/gu, ' ')
    .replace(/[\t\f\v ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}
