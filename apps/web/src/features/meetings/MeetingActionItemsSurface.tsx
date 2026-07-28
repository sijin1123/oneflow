import { ArrowRightCircle, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { ActionItem } from './api'

export type ActionIntent =
  | { kind: 'add'; description: string }
  | { kind: 'toggle'; id: string; description: string; done: boolean }
  | { kind: 'convert'; id: string; description: string }
  | { kind: 'delete'; id: string; description: string }

export function MeetingActionItemsSurface({
  items,
  canWrite,
  newItem,
  setNewItem,
  actionPending,
  failedAction,
  onRunAction,
  projectId,
  navigate,
}: {
  items: ActionItem[]
  canWrite: boolean
  newItem: string
  setNewItem: (value: string) => void
  actionPending: boolean
  failedAction: ActionIntent | null
  onRunAction: (intent: ActionIntent) => Promise<void>
  projectId: string
  navigate: (path: string) => void
}) {
  return (
    <section aria-label="액션 아이템" className="min-w-0 pt-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">액션 아이템</h2>
          <p className="text-[11px] leading-5 text-of-muted">
            회의 후 실행할 항목을 추적하고 실제 작업으로 전환합니다.
          </p>
        </div>
        <Badge variant="outline">{items.length}건</Badge>
      </div>

      {canWrite ? (
        <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            placeholder="액션 아이템 추가"
            aria-label="새 액션 아이템"
            className="h-8 min-w-0 text-xs"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !newItem.trim() || actionPending) return
              event.preventDefault()
              void onRunAction({ kind: 'add', description: newItem.trim() })
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={!newItem.trim() || actionPending}
            onClick={() => void onRunAction({ kind: 'add', description: newItem.trim() })}
          >
            {actionPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={13} aria-hidden="true" />
            )}
            추가
          </Button>
        </div>
      ) : null}

      {failedAction ? (
        <div
          role="alert"
          className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-y border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs text-of-danger"
        >
          <span className="min-w-0 break-words">
            '{failedAction.description}' {actionIntentLabel(failedAction)}에 실패했습니다.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={actionPending}
            onClick={() => void onRunAction(failedAction)}
          >
            <RotateCcw size={13} aria-hidden="true" /> 액션 아이템 다시 시도
          </Button>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-of-border-subtle border-y border-of-border-subtle">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 items-start gap-2 px-2 py-2.5 text-sm transition-colors hover:bg-of-surface-hover"
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={!canWrite || actionPending}
                aria-label={`${item.description} 완료`}
                className="mt-0.5 shrink-0"
                onChange={(event) =>
                  void onRunAction({
                    kind: 'toggle',
                    id: item.id,
                    description: item.description,
                    done: event.target.checked,
                  })
                }
              />
              <span
                className={`min-w-0 flex-1 break-words ${item.done ? 'text-of-muted line-through' : ''}`}
              >
                {item.description}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                {item.converted_wp_id ? (
                  <button
                    type="button"
                    className="rounded-of px-1.5 py-1 text-[11px] text-of-accent hover:bg-of-surface-2 hover:underline"
                    onClick={() =>
                      navigate(`/projects/${projectId}/work-packages?wp=${item.converted_wp_id}`)
                    }
                  >
                    작업 보기
                  </button>
                ) : canWrite ? (
                  <button
                    type="button"
                    aria-label={`${item.description} 작업으로 전환`}
                    title="작업으로 전환"
                    disabled={actionPending}
                    className="rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-accent disabled:opacity-50"
                    onClick={() =>
                      void onRunAction({
                        kind: 'convert',
                        id: item.id,
                        description: item.description,
                      })
                    }
                  >
                    <ArrowRightCircle size={13} aria-hidden="true" />
                  </button>
                ) : null}
                {canWrite ? (
                  <button
                    type="button"
                    aria-label="액션 아이템 삭제"
                    disabled={actionPending}
                    className="rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger disabled:opacity-50"
                    onClick={() =>
                      void onRunAction({
                        kind: 'delete',
                        id: item.id,
                        description: item.description,
                      })
                    }
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-y border-of-border-subtle px-3 py-8 text-center text-xs text-of-muted">
          액션 아이템이 없습니다.
        </p>
      )}
    </section>
  )
}

function actionIntentLabel(intent: ActionIntent) {
  if (intent.kind === 'add') return '추가'
  if (intent.kind === 'toggle') return intent.done ? '완료 처리' : '완료 취소'
  if (intent.kind === 'convert') return '작업 전환'
  return '삭제'
}
