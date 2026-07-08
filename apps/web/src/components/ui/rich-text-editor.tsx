/* Tiptap rich-text editor (PLAN §3 Phase 1 후속). Emits HTML; the SERVER sanitizes
   on write (nh3 allowlist), so this editor is a convenience layer, not the security
   boundary. StarterKit only, keeping the output within the server's allowlist. */

import Image from '@tiptap/extension-image'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Image as ImageIcon, Italic, List, ListOrdered } from 'lucide-react'
import { useEffect, useRef } from 'react'

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
}

export function RichTextEditor({ value, onSave, ariaLabel, onImageUpload, editable = true }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const editor = useEditor({
    extensions: onImageUpload
      ? [StarterKit, Image.configure({ HTMLAttributes: { class: 'max-w-full' } })]
      : [StarterKit],
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
    },
    onBlur: ({ editor }) => onSave(editor.isEmpty ? '' : editor.getHTML()),
  })

  // Resync when the server value changes underneath us (e.g. a 409 reload).
  useEffect(() => {
    if (editor && !editor.isFocused && value !== editor.getHTML()) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editable, editor])

  if (!editor) return null

  const btn = (active: boolean) =>
    cn(
      'rounded p-1 text-of-muted hover:bg-of-surface-2',
      active && 'bg-of-surface-2 text-of-text',
    )

  return (
    <div className="rounded-of border border-of-border bg-of-surface">
      {editable ? (
      <div className="flex items-center gap-0.5 border-b border-of-border px-1 py-0.5">
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
      </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  )
}
