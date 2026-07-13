import { useMutation } from '@tanstack/react-query'
import { ChevronsDownUp, ChevronsUpDown, Play, X } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { validateWorkspacePql } from '@/features/search/api'
import { cn } from '@/lib/utils'

import {
  appendWorkspacePqlSuggestion,
  getWorkspacePqlSuggestions,
  isWorkspacePqlRunnable,
} from './workspacePql'

export type WorkspaceFilterMode = 'basic' | 'pql'

export function WorkspacePqlEditor({
  mode,
  draft,
  applied,
  onModeChange,
  onDraftChange,
  onApply,
  onClear,
  basicControls,
}: {
  mode: WorkspaceFilterMode
  draft: string
  applied: string
  onModeChange: (mode: WorkspaceFilterMode) => void
  onDraftChange: (value: string) => void
  onApply: (value: string) => void
  onClear: () => void
  basicControls: ReactNode
}) {
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const latestDraftRef = useRef(draft)
  const [expanded, setExpanded] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [error, setError] = useState('')
  const suggestions = useMemo(() => getWorkspacePqlSuggestions(draft), [draft])
  const validate = useMutation({ mutationFn: validateWorkspacePql })
  const runnable = isWorkspacePqlRunnable(draft)

  useEffect(() => {
    latestDraftRef.current = draft
  }, [draft])

  const run = async () => {
    if (!runnable || validate.isPending) return
    const requestedDraft = draft
    setError('')
    setSuggestionsOpen(false)
    try {
      const result = await validate.mutateAsync(requestedDraft)
      if (latestDraftRef.current !== requestedDraft) return
      latestDraftRef.current = result.normalized
      onDraftChange(result.normalized)
      onApply(result.normalized)
    } catch (cause) {
      if (latestDraftRef.current !== requestedDraft) return
      setError(cause instanceof Error && cause.message ? cause.message : 'PQL을 확인하지 못했습니다.')
    }
  }

  const insertSuggestion = (index: number) => {
    const suggestion = suggestions[index]
    if (!suggestion) return
    const nextDraft = appendWorkspacePqlSuggestion(draft, suggestion)
    latestDraftRef.current = nextDraft
    onDraftChange(nextDraft)
    setActiveSuggestion(0)
    requestAnimationFrame(() => editorRef.current?.focus())
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestionsOpen && suggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActiveSuggestion((current) => (current + direction + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        insertSuggestion(activeSuggestion)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setSuggestionsOpen(false)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && runnable) {
      event.preventDefault()
      void run()
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <div role="tablist" aria-label="필터 방식" className="mb-2 flex w-fit items-center rounded-of bg-of-surface-2 p-0.5">
        {(['basic', 'pql'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            className={cn(
              'h-7 rounded-[4px] px-2.5 text-xs text-of-muted transition-colors hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
              mode === item && 'bg-of-surface text-of-text shadow-[var(--of-shadow-xs)]',
            )}
            onClick={() => {
              setError('')
              setSuggestionsOpen(false)
              onModeChange(item)
            }}
          >
            {item === 'basic' ? 'Basic' : 'PQL'}
          </button>
        ))}
      </div>

      {mode === 'basic' ? basicControls : (
        <div role="tabpanel" aria-label="PQL" className="relative min-w-0">
          <div className="flex min-w-0 items-end gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">PQL query</span>
              <textarea
                ref={editorRef}
                value={draft}
                maxLength={1000}
                rows={expanded ? 5 : 1}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'workspace-pql-error' : 'workspace-pql-help'}
                placeholder="Type a query and press Enter to filter..."
                className={cn(
                  'of-scrollbar block w-full resize-none rounded-of border border-of-border bg-of-surface px-3 py-2 font-mono text-xs leading-5 text-of-text outline-none transition-[height,border-color] duration-200 placeholder:text-of-muted focus:border-of-border-strong',
                  expanded ? 'h-28' : 'h-9 overflow-hidden',
                )}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                onChange={(event) => {
                  latestDraftRef.current = event.target.value
                  onDraftChange(event.target.value)
                  setError('')
                  setActiveSuggestion(0)
                  setSuggestionsOpen(true)
                }}
                onKeyDown={onKeyDown}
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={!runnable || validate.isPending}
              onClick={() => void run()}
            >
              <Play size={13} /> {validate.isPending ? '검증 중' : 'Run'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={expanded ? 'Collapse editor' : 'Expand editor'}
              title={expanded ? 'Collapse editor' : 'Expand editor'}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
            </Button>
            {draft || applied ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="PQL Clear all"
                title="Clear all"
                onClick={() => {
                  setError('')
                  setSuggestionsOpen(false)
                  latestDraftRef.current = ''
                  onDraftChange('')
                  onClear()
                  requestAnimationFrame(() => editorRef.current?.focus())
                }}
              >
                <X size={14} />
              </Button>
            ) : null}
          </div>

          {suggestionsOpen && suggestions.length > 0 ? (
            <div
              role="listbox"
              aria-label="PQL suggestions"
              className="absolute left-0 top-[calc(100%+0.25rem)] z-[var(--of-z-popover)] w-[min(22rem,calc(100vw-2rem))] rounded-of border border-of-border bg-of-surface-raised p-1 shadow-[var(--of-shadow-popover)]"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.label}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeSuggestion === index}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[4px] px-2 py-1.5 text-left text-xs hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                    activeSuggestion === index && 'bg-of-surface-hover',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertSuggestion(index)}
                >
                  <span className="min-w-20 font-mono font-medium text-of-text">{suggestion.label}</span>
                  <span className="truncate text-of-muted">{suggestion.description}</span>
                </button>
              ))}
              <div className="flex gap-3 border-t border-of-border-subtle px-2 pt-1.5 text-[10px] text-of-muted">
                <span>↑↓ 이동</span><span>Enter 선택</span><span>Esc 닫기</span>
              </div>
            </div>
          ) : null}

          <p id="workspace-pql-help" className="mt-1 text-[10px] text-of-muted">
            title, state, priority, project, assignee · =, !=, IN, NOT IN · AND/OR · ORDER BY · LIMIT
          </p>
          {error ? <p id="workspace-pql-error" role="alert" className="mt-1 text-xs text-of-danger">{error}</p> : null}
        </div>
      )}
    </div>
  )
}
