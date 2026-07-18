import { Activity, Loader2, Pencil, Save, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { HEALTH_LABELS, HEALTH_STYLES } from '@/features/projects/types'

import {
  INITIATIVE_STATE_LABELS,
  type Initiative,
  type InitiativeState,
  useUpdateInitiative,
} from './api'

const STATE_ORDER: InitiativeState[] = [
  'planned',
  'in_progress',
  'paused',
  'completed',
  'cancelled',
]

export function InitiativeLifecyclePanel({ initiative }: { initiative: Initiative }) {
  const stateUpdate = useUpdateInitiative()
  const healthUpdate = useUpdateInitiative()
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState<InitiativeState>(initiative.state)
  const [health, setHealth] = useState<'' | NonNullable<Initiative['health']>>(
    initiative.health ?? '',
  )
  const [note, setNote] = useState(initiative.health_note ?? '')

  const reset = () => {
    setState(initiative.state)
    setHealth(initiative.health ?? '')
    setNote(initiative.health_note ?? '')
    stateUpdate.reset()
    healthUpdate.reset()
  }
  const stateChanged = state !== initiative.state
  const normalizedNote = note.trim()
  const healthChanged =
    health !== (initiative.health ?? '') ||
    (health !== '' && normalizedNote !== (initiative.health_note ?? ''))

  return (
    <section
      aria-labelledby="initiative-lifecycle-heading"
      className="border-b border-of-border-subtle py-4"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="initiative-lifecycle-heading"
            className="flex items-center gap-1.5 text-sm font-semibold"
          >
            <Activity size={14} aria-hidden="true" /> 상태 및 헬스
          </h3>
          <p className="mt-0.5 text-[11px] text-of-muted">
            전략의 실행 단계와 최신 상태 보고를 한 곳에서 관리합니다.
          </p>
        </div>
        {initiative.is_mine ? (
          <Button
            size="sm"
            variant={editing ? 'secondary' : 'outline'}
            aria-expanded={editing}
            onClick={() => {
              reset()
              setEditing((value) => !value)
            }}
          >
            {editing ? <X /> : <Pencil />}
            {editing ? '편집 닫기' : '수명주기 편집'}
          </Button>
        ) : null}
      </div>

      <dl className="mt-3 grid min-w-0 grid-cols-1 gap-px overflow-hidden rounded-of border border-of-border-subtle bg-of-border-subtle sm:grid-cols-2">
        <div className="bg-of-surface px-3 py-2.5">
          <dt className="text-[10px] text-of-muted">실행 상태</dt>
          <dd className="mt-1 text-xs font-medium">
            {INITIATIVE_STATE_LABELS[initiative.state]}
          </dd>
        </div>
        <div className="bg-of-surface px-3 py-2.5">
          <dt className="text-[10px] text-of-muted">헬스</dt>
          <dd className="mt-1 text-xs font-medium">
            {initiative.health ? (
              <span
                className={`inline-flex rounded-of px-1.5 py-0.5 text-[10px] ${HEALTH_STYLES[initiative.health]}`}
              >
                {HEALTH_LABELS[initiative.health]}
              </span>
            ) : (
              '미설정'
            )}
          </dd>
        </div>
        <div className="bg-of-surface px-3 py-2.5 sm:col-span-2">
          <dt className="text-[10px] text-of-muted">상태 사유</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-xs">
            {initiative.health_note ?? '기록된 상태 사유가 없습니다.'}
          </dd>
          {initiative.health_updated_at ? (
            <p className="mt-1 text-[10px] text-of-muted">
              최근 보고 {initiative.health_updated_at.slice(0, 10)}
            </p>
          ) : null}
        </div>
      </dl>

      {editing && initiative.is_mine ? (
        <div
          role="group"
          aria-label="이니셔티브 수명주기 편집"
          className="mt-3 grid min-w-0 gap-4 border-y border-of-border-subtle bg-of-surface-2 px-3 py-3"
        >
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="min-w-0 space-y-1 text-xs font-medium text-of-muted">
              실행 상태
              <Select
                aria-label="이니셔티브 실행 상태"
                className="h-8 min-w-0 bg-of-surface text-xs"
                value={state}
                disabled={stateUpdate.isPending}
                onChange={(event) => setState(event.target.value as InitiativeState)}
              >
                {STATE_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {INITIATIVE_STATE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              size="sm"
              disabled={!stateChanged || stateUpdate.isPending}
              onClick={() =>
                stateUpdate.mutate(
                  { id: initiative.id, state },
                  { onSuccess: (saved) => setState(saved.state) },
                )
              }
            >
              {stateUpdate.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              상태 저장
            </Button>
            {stateUpdate.isError ? (
              <p role="alert" className="text-xs text-of-danger sm:col-span-2">
                {stateUpdate.error instanceof Error
                  ? stateUpdate.error.message
                  : '실행 상태를 저장하지 못했습니다.'}
              </p>
            ) : null}
          </div>

          <div className="grid min-w-0 gap-2 border-t border-of-border-subtle pt-3 sm:grid-cols-[128px_minmax(0,1fr)]">
            <label className="min-w-0 space-y-1 text-xs font-medium text-of-muted">
              헬스
              <Select
                aria-label="이니셔티브 헬스"
                className="h-8 min-w-0 bg-of-surface text-xs"
                value={health}
                disabled={healthUpdate.isPending}
                onChange={(event) => {
                  const value = event.target.value as '' | NonNullable<Initiative['health']>
                  setHealth(value)
                  if (value === '') setNote('')
                }}
              >
                <option value="">미설정</option>
                {(Object.keys(HEALTH_LABELS) as Array<NonNullable<Initiative['health']>>).map(
                  (value) => (
                    <option key={value} value={value}>
                      {HEALTH_LABELS[value]}
                    </option>
                  ),
                )}
              </Select>
            </label>
            <label className="min-w-0 space-y-1 text-xs font-medium text-of-muted">
              상태 사유
              <Textarea
                aria-label="이니셔티브 상태 사유"
                className="min-h-20 bg-of-surface text-xs"
                maxLength={2_000}
                value={note}
                disabled={health === '' || healthUpdate.isPending}
                onChange={(event) => setNote(event.target.value)}
                placeholder="위험 요인, 회복 계획 또는 최신 진행 상황을 기록하세요."
              />
            </label>
            <div className="flex min-w-0 flex-wrap justify-end gap-2 sm:col-span-2">
              <Button
                size="sm"
                variant="outline"
                disabled={initiative.health === null || healthUpdate.isPending}
                onClick={() => {
                  setHealth('')
                  setNote('')
                  healthUpdate.mutate(
                    { id: initiative.id, health: null },
                    {
                      onSuccess: () => {
                        setHealth('')
                        setNote('')
                      },
                    },
                  )
                }}
              >
                헬스 초기화
              </Button>
              <Button
                size="sm"
                disabled={!healthChanged || healthUpdate.isPending}
                onClick={() =>
                  healthUpdate.mutate(
                    health === ''
                      ? { id: initiative.id, health: null }
                      : {
                          id: initiative.id,
                          health,
                          health_note: normalizedNote || null,
                        },
                    {
                      onSuccess: (saved) => {
                        setHealth(saved.health ?? '')
                        setNote(saved.health_note ?? '')
                      },
                    },
                  )
                }
              >
                {healthUpdate.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                헬스 저장
              </Button>
            </div>
            {healthUpdate.isError ? (
              <p role="alert" className="text-xs text-of-danger sm:col-span-2">
                {healthUpdate.error instanceof Error
                  ? healthUpdate.error.message
                  : '헬스 상태를 저장하지 못했습니다.'}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end border-t border-of-border-subtle pt-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={stateUpdate.isPending || healthUpdate.isPending}
              onClick={() => {
                reset()
                setEditing(false)
              }}
            >
              취소
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
