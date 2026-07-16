/* Tiptap rich-text editor (PLAN §3 Phase 1 후속). Emits HTML; the SERVER sanitizes
   on write (nh3 allowlist), so this editor is a convenience layer, not the security
   boundary. StarterKit only, keeping the output within the server's allowlist. */

import { Mark, mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  MessageSquarePlus,
  Send,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  value: string
  onSave: (html: string) => void
  ariaLabel: string
  /** Inline images (Pass 68): upload the file and resolve to the canonical
      download URL. Only the document editor passes this — surfaces without
      it (meetings, …) get no image button and the server rejects <img>. */
  onImageUpload?: (file: File) => Promise<string>
  /** Read-only (Pass 76): no toolbar, no editing — content renders as-is. */
  editable?: boolean
  /** Document-only inline comment integration. Other rich-text surfaces omit
      these props and retain the original editor behavior. */
  activeCommentAnchorIds?: string[]
  activeCommentAnchorId?: string | null
  onCommentAnchorActivate?: (anchorId: string) => void
  onCreateInlineComment?: (input: InlineCommentRequest) => Promise<void>
}

export type InlineCommentRequest = {
  anchorId: string
  anchorQuote: string
  commentBody: string
  documentBody: string
}

const CommentAnchor = Mark.create({
  name: 'commentAnchor',
  inclusive: false,
  addAttributes() {
    return {
      anchorId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-anchor'),
        renderHTML: (attributes) =>
          attributes.anchorId ? { 'data-comment-anchor': attributes.anchorId } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-anchor]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

type SelectedRange = {
  from: number
  to: number
  quote: string
}

const normalizeQuote = (value: string) => value.replace(/\s+/g, ' ').trim()

export function RichTextEditor({
  value,
  onSave,
  ariaLabel,
  onImageUpload,
  editable = true,
  activeCommentAnchorIds = [],
  activeCommentAnchorId = null,
  onCommentAnchorActivate,
  onCreateInlineComment,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const activeAnchorIdsRef = useRef(new Set<string>())
  const anchorActivateRef = useRef(onCommentAnchorActivate)
  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(null)
  const [commentRange, setCommentRange] = useState<SelectedRange | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [commentPending, setCommentPending] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

  anchorActivateRef.current = onCommentAnchorActivate
  activeAnchorIdsRef.current = new Set(activeCommentAnchorIds)

  const editor = useEditor({
    extensions: onImageUpload
      ? [StarterKit, CommentAnchor, Image.configure({ HTMLAttributes: { class: 'max-w-full' } })]
      : [StarterKit, CommentAnchor],
    content: value || '',
    editable,
    // CSR-only Vite app, but keep StrictMode's double-invoke from warning.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class:
          'min-h-20 max-h-72 overflow-y-auto rounded-b-of px-2 py-1.5 text-sm outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5',
      },
      handleClick: (_view, _position, event) => {
        const target = event.target instanceof Element ? event.target : null
        const anchor = target?.closest<HTMLElement>('[data-comment-anchor]')
        const anchorId = anchor?.dataset.commentAnchor
        if (anchorId && activeAnchorIdsRef.current.has(anchorId)) {
          anchorActivateRef.current?.(anchorId)
        }
        return false
      },
    },
    onBlur: ({ editor }) => onSave(editor.isEmpty ? '' : editor.getHTML()),
    onSelectionUpdate: ({ editor }) => {
      const { from, to, $from, $to } = editor.state.selection
      const quote = normalizeQuote(editor.state.doc.textBetween(from, to, ' '))
      let hasActiveAnchor = false
      editor.state.doc.nodesBetween(from, to, (node) => {
        if (
          node.marks.some(
            (mark) =>
              mark.type.name === 'commentAnchor' &&
              activeAnchorIdsRef.current.has(String(mark.attrs.anchorId)),
          )
        ) {
          hasActiveAnchor = true
        }
      })
      const valid =
        from < to &&
        $from.parent === $to.parent &&
        quote.length >= 1 &&
        quote.length <= 500 &&
        !hasActiveAnchor
      setSelectedRange(valid ? { from, to, quote } : null)
    },
  })

  // Resync when the server value changes underneath us (e.g. a 409 reload).
  useEffect(() => {
    if (editor && !editor.isFocused && value !== editor.getHTML()) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  useEffect(() => {
    if (editor && !commentRange && !commentPending) editor.setEditable(editable)
  }, [commentPending, commentRange, editable, editor])

  const syncAnchorClasses = useCallback(() => {
    if (!editor) return
    const active = new Set(activeCommentAnchorIds)
    editor.view.dom
      .querySelectorAll<HTMLElement>('[data-comment-anchor]')
      .forEach((element) => {
        const anchorId = element.dataset.commentAnchor
        const live = Boolean(anchorId && active.has(anchorId))
        element.classList.toggle('of-document-comment-anchor', live)
        element.classList.toggle(
          'of-document-comment-anchor-active',
          live && anchorId === activeCommentAnchorId,
        )
      })
  }, [activeCommentAnchorId, activeCommentAnchorIds, editor])

  useEffect(() => {
    if (!editor) return
    syncAnchorClasses()
    editor.on('update', syncAnchorClasses)
    return () => {
      editor.off('update', syncAnchorClasses)
    }
  }, [editor, syncAnchorClasses])

  if (!editor) return null

  const btn = (active: boolean) =>
    cn(
      'rounded-of p-1 text-of-muted transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
      active && 'bg-of-surface-2 text-of-text',
    )

  const openCommentComposer = () => {
    if (!selectedRange || !onCreateInlineComment || commentPending) return
    setCommentRange(selectedRange)
    setCommentBody('')
    setCommentError(null)
    editor.setEditable(false)
  }

  const closeCommentComposer = () => {
    if (commentPending) return
    const restore = commentRange
    setCommentRange(null)
    setCommentBody('')
    setCommentError(null)
    editor.setEditable(editable)
    if (restore) {
      requestAnimationFrame(() => {
        editor.commands.setTextSelection({ from: restore.from, to: restore.to })
        editor.commands.focus()
      })
    }
  }

  const submitInlineComment = async () => {
    const body = commentBody.trim()
    if (!commentRange || !body || !onCreateInlineComment || commentPending) return
    const previousBody = editor.getHTML()
    const anchorId = crypto.randomUUID()
    setCommentPending(true)
    setCommentError(null)
    try {
      editor.commands.setTextSelection({ from: commentRange.from, to: commentRange.to })
      editor.commands.setMark('commentAnchor', { anchorId })
      const documentBody = editor.getHTML()
      await onCreateInlineComment({
        anchorId,
        anchorQuote: commentRange.quote,
        commentBody: body,
        documentBody,
      })
      onSave(documentBody)
      setCommentRange(null)
      setCommentBody('')
      setSelectedRange(null)
    } catch {
      editor.commands.setContent(previousBody, false)
      setCommentError('인라인 코멘트를 저장하지 못했습니다. 문서가 변경되었는지 확인해 주세요.')
    } finally {
      setCommentPending(false)
      editor.setEditable(editable)
    }
  }

  return (
    <div className="rounded-of border border-of-border bg-of-surface">
      {editable ? (
      <div className="flex min-h-8 items-center gap-0.5 border-b border-of-border bg-of-surface-2/40 px-1 py-0.5">
        <button
          type="button"
          aria-label="굵게"
          className={btn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={13} />
        </button>
        <button
          type="button"
          aria-label="기울임"
          className={btn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={13} />
        </button>
        <button
          type="button"
          aria-label="글머리 목록"
          className={btn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={13} />
        </button>
        <button
          type="button"
          aria-label="번호 목록"
          className={btn(editor.isActive('orderedList'))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={13} />
        </button>
        {onImageUpload ? (
          <>
            <button
              type="button"
              aria-label="이미지 삽입"
              className={btn(false)}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon size={13} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              aria-label="이미지 파일 선택"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  const src = await onImageUpload(file)
                  editor.chain().focus().setImage({ src, alt: file.name }).run()
                  onSave(editor.getHTML())
                } catch {
                  // Upload errors surface via the caller's mutation state.
                }
              }}
            />
          </>
        ) : null}
        {onCreateInlineComment ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-of-border" aria-hidden="true" />
            <button
              type="button"
              aria-label="선택 영역에 코멘트"
              title={
                selectedRange
                  ? '선택 영역에 코멘트'
                  : '한 문단 안에서 500자 이하 텍스트를 선택하세요'
              }
              className={cn(btn(false), 'disabled:cursor-not-allowed disabled:opacity-40')}
              disabled={!selectedRange || Boolean(commentRange) || commentPending}
              onMouseDown={(event) => event.preventDefault()}
              onClick={openCommentComposer}
            >
              <MessageSquarePlus size={13} />
            </button>
          </>
        ) : null}
      </div>
      ) : null}
      {commentRange ? (
        <div
          role="region"
          aria-label="선택 영역 코멘트 작성"
          className="grid gap-2 border-b border-of-border bg-of-accent/5 p-2"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <blockquote className="min-w-0 border-l-2 border-of-accent pl-2 text-xs text-of-muted">
              <span className="line-clamp-2">{commentRange.quote}</span>
            </blockquote>
            <button
              type="button"
              aria-label="인라인 코멘트 취소"
              className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-hover"
              disabled={commentPending}
              onClick={closeCommentComposer}
            >
              <X size={13} />
            </button>
          </div>
          <textarea
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeCommentComposer()
                return
              }
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                void submitInlineComment()
              }
            }}
            aria-label="인라인 코멘트"
            placeholder="선택한 문구에 코멘트를 남기세요"
            maxLength={4000}
            rows={2}
            autoFocus
            className="min-h-16 w-full resize-y rounded-of border border-of-border bg-of-surface px-2 py-1.5 text-xs outline-none focus:border-of-focus"
          />
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="text-[11px] text-of-muted">⌘/Ctrl + Enter</span>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-of bg-of-accent px-2 text-xs font-medium text-white disabled:opacity-50"
              disabled={!commentBody.trim() || commentPending}
              onClick={() => void submitInlineComment()}
            >
              <Send size={12} />
              {commentPending ? '저장 중' : '코멘트'}
            </button>
          </div>
          {commentError ? (
            <p role="alert" className="text-xs text-of-danger">
              {commentError}
            </p>
          ) : null}
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  )
}
