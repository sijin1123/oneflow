/* Tiptap rich-text editor (PLAN §3 Phase 1 후속). Emits HTML; the SERVER sanitizes
   on write (nh3 allowlist), so this editor is a convenience layer, not the security
   boundary. StarterKit only, keeping the output within the server's allowlist. */

import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, List, ListOrdered } from 'lucide-react'
import { useEffect } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  value: string
  onSave: (html: string) => void
  ariaLabel: string
}

export function RichTextEditor({ value, onSave, ariaLabel }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
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

  if (!editor) return null

  const btn = (active: boolean) =>
    cn(
      'rounded p-1 text-of-muted hover:bg-of-surface-2',
      active && 'bg-of-surface-2 text-of-text',
    )

  return (
    <div className="rounded-of border border-of-border bg-of-surface">
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
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
