/* Tiptap rich-text editor (PLAN §3 Phase 1 후속). Emits HTML; the SERVER sanitizes
   on write (nh3 allowlist), so this editor is a convenience layer, not the security
   boundary. StarterKit only, keeping the output within the server's allowlist. */

import { Mark, mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Code2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  MessageSquarePlus,
  Quote,
  Redo2,
  Send,
  SeparatorHorizontal,
  Strikethrough,
  Undo2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  value: string
  onSave: (html: string) => void
  onChange?: (html: string) => void
  ariaLabel: string
  /** Inline images (Pass 68): upload the file and resolve to the canonical
      download URL. Only the document editor passes this — surfaces without
      it (meetings, …) get no image button and the server rejects <img>. */
  onImageUpload?: (file: File) => Promise<string>
  /** Read-only (Pass 76): no toolbar, no editing — content renders as-is. */
  editable?: boolean
  /** Work-item descriptions use an explicit Save action instead of blur-save. */
  saveOnBlur?: boolean
  /** Plain removes editor chrome for scan-first read surfaces. Document
      provides a full-height page canvas while preserving the same commands. */
  appearance?: 'framed' | 'plain' | 'document'
  /** Document-only inline comment integration. Other rich-text surfaces omit
      these props and retain the original editor behavior. */
  documentHeader?: ReactNode
  activeCommentAnchorIds?: string[]
  activeCommentAnchorId?: string | null
  onCommentAnchorActivate?: (anchorId: string) => void
  onCreateInlineComment?: (input: InlineCommentRequest) => Promise<void>
  mentionOptions?: Array<{ id: string; label: string }>
}

export type InlineCommentRequest = {
  anchorId: string
  anchorQuote: string
  commentBody: string
  mentionedUserIds: string[]
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
  onChange,
  ariaLabel,
  onImageUpload,
  editable = true,
  saveOnBlur = true,
  appearance = 'framed',
  documentHeader,
  activeCommentAnchorIds = [],
  activeCommentAnchorId = null,
  onCommentAnchorActivate,
  onCreateInlineComment,
  mentionOptions = [],
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const activeAnchorIdsRef = useRef(new Set<string>())
  const anchorActivateRef = useRef(onCommentAnchorActivate)
  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(null)
  const [commentRange, setCommentRange] = useState<SelectedRange | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [commentMentioned, setCommentMentioned] = useState<string[]>([])
  const commentMentionedRef = useRef<string[]>([])
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
        class: cn(
          'text-sm outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5',
          appearance === 'plain'
            ? 'max-h-72 min-h-16 overflow-y-auto px-1 py-2 leading-6 [&_blockquote]:border-l-2 [&_blockquote]:border-of-border [&_blockquote]:pl-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_p+p]:mt-2'
            : appearance === 'document'
              ? 'mx-auto min-h-[calc(100vh-15rem)] w-full max-w-3xl px-5 pb-28 pt-4 text-[15px] leading-7 sm:px-10 [&_a]:text-of-accent [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-of-border [&_blockquote]:pl-4 [&_blockquote]:text-of-muted [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:my-6 [&_hr]:border-of-border [&_img]:my-5 [&_img]:rounded-of [&_p+p]:mt-3 [&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-of-border [&_td]:p-2 [&_th]:border [&_th]:border-of-border [&_th]:bg-of-surface-2 [&_th]:p-2 [&_th]:text-left'
              : 'max-h-72 min-h-20 overflow-y-auto rounded-b-of px-2 py-1.5',
        ),
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
    onUpdate: ({ editor }) => {
      if (editor.isFocused) onChange?.(editor.isEmpty ? '' : editor.getHTML())
    },
    onBlur: ({ editor }) => {
      if (saveOnBlur) onSave(editor.isEmpty ? '' : editor.getHTML())
    },
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
      editor.commands.setContent(value || '', false)
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
    commentMentionedRef.current = []
    setCommentMentioned([])
    setCommentError(null)
    editor.setEditable(false)
  }

  const closeCommentComposer = () => {
    if (commentPending) return
    const restore = commentRange
    setCommentRange(null)
    setCommentBody('')
    commentMentionedRef.current = []
    setCommentMentioned([])
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
        mentionedUserIds: commentMentionedRef.current,
        documentBody,
      })
      onSave(documentBody)
      setCommentRange(null)
      setCommentBody('')
      commentMentionedRef.current = []
      setCommentMentioned([])
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
    <div
      className={cn(
        appearance === 'plain'
          ? 'bg-transparent'
          : appearance === 'document'
            ? 'min-w-0 bg-transparent'
            : 'rounded-of border border-of-border bg-of-surface',
      )}
    >
      {editable ? (
      <div
        className={cn(
          'flex min-h-8 items-center gap-0.5 overflow-x-auto border-b border-of-border px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          appearance === 'document'
            ? 'sticky top-0 z-10 bg-of-surface-raised/95 px-3 backdrop-blur'
            : 'bg-of-surface-2/40',
        )}
      >
        {appearance === 'document' ? (
          <>
            <label className="sr-only" htmlFor="document-text-style">
              텍스트 스타일
            </label>
            <select
              id="document-text-style"
              aria-label="텍스트 스타일"
              value={
                editor.isActive('heading', { level: 1 })
                  ? 'h1'
                  : editor.isActive('heading', { level: 2 })
                    ? 'h2'
                    : editor.isActive('heading', { level: 3 })
                      ? 'h3'
                      : 'paragraph'
              }
              onChange={(event) => {
                const chain = editor.chain().focus()
                if (event.target.value === 'h1') chain.toggleHeading({ level: 1 }).run()
                else if (event.target.value === 'h2') chain.toggleHeading({ level: 2 }).run()
                else if (event.target.value === 'h3') chain.toggleHeading({ level: 3 }).run()
                else chain.setParagraph().run()
              }}
              className="h-7 min-w-24 rounded-of border border-of-border bg-of-surface px-2 text-xs text-of-text outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            >
              <option value="paragraph">본문</option>
              <option value="h1">제목 1</option>
              <option value="h2">제목 2</option>
              <option value="h3">제목 3</option>
            </select>
            <span className="mx-0.5 h-4 w-px shrink-0 bg-of-border" aria-hidden="true" />
          </>
        ) : null}
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
        {appearance === 'document' ? (
          <button
            type="button"
            aria-label="취소선"
            className={btn(editor.isActive('strike'))}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={13} />
          </button>
        ) : null}
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
        {appearance === 'document' ? (
          <>
            <button
              type="button"
              aria-label="인용"
              className={btn(editor.isActive('blockquote'))}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote size={13} />
            </button>
            <button
              type="button"
              aria-label="코드 블록"
              className={btn(editor.isActive('codeBlock'))}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              <Code2 size={13} />
            </button>
            <button
              type="button"
              aria-label="구분선"
              className={btn(false)}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <SeparatorHorizontal size={13} />
            </button>
          </>
        ) : null}
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
        {appearance === 'document' ? (
          <>
            <span className="mx-0.5 h-4 w-px shrink-0 bg-of-border" aria-hidden="true" />
            <button
              type="button"
              aria-label="실행 취소"
              className={cn(btn(false), 'disabled:opacity-40')}
              disabled={!editor.can().chain().focus().undo().run()}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 size={13} />
            </button>
            <button
              type="button"
              aria-label="다시 실행"
              className={cn(btn(false), 'disabled:opacity-40')}
              disabled={!editor.can().chain().focus().redo().run()}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 size={13} />
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
          {mentionOptions.length > 0 ? (
            <fieldset className="flex flex-wrap items-center gap-1.5">
              <legend className="sr-only">인라인 코멘트에서 멘션할 멤버</legend>
              <span className="text-[11px] text-of-muted">멘션</span>
              {mentionOptions.map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    'flex items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1 text-[11px]',
                    commentMentioned.includes(option.id)
                      ? 'border-of-accent text-of-accent'
                      : '',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={commentMentioned.includes(option.id)}
                    disabled={commentPending}
                    onChange={() => {
                      const next = commentMentioned.includes(option.id)
                        ? commentMentioned.filter((id) => id !== option.id)
                        : [...commentMentioned, option.id]
                      commentMentionedRef.current = next
                      setCommentMentioned(next)
                    }}
                    aria-label={`${option.label} 인라인 멘션`}
                    className="h-3 w-3 accent-of-accent"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
          ) : null}
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
      {documentHeader}
      <EditorContent editor={editor} />
    </div>
  )
}
