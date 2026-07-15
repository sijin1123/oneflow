import { ArrowDown, ArrowUp, LoaderCircle, Workflow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import {
  type ProjectPhaseColor,
  type WorkspaceProjectPhaseDefinition,
  useUpdateWorkspaceProjectPhaseDefinitions,
  useWorkspaceProjectPhaseDefinitions,
} from '@/features/workspace-profile/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

const COLORS: Array<{
  value: ProjectPhaseColor
  label: string
  className: string
}> = [
  { value: 'sky', label: '하늘', className: 'bg-sky-500' },
  { value: 'indigo', label: '인디고', className: 'bg-indigo-500' },
  { value: 'emerald', label: '에메랄드', className: 'bg-emerald-500' },
  { value: 'amber', label: '앰버', className: 'bg-amber-500' },
]

type EditableDefinition = Omit<WorkspaceProjectPhaseDefinition, 'position'>

function normalized(items: EditableDefinition[]) {
  return items.map((item) => ({ ...item, name: item.name.trim() }))
}

function sameDefinitions(
  local: EditableDefinition[],
  saved: WorkspaceProjectPhaseDefinition[],
) {
  return JSON.stringify(normalized(local)) === JSON.stringify(
    saved.map(({ position: _position, ...item }) => item),
  )
}

export function WorkspacePhaseDefinitionsSettingsPage() {
  const definitions = useWorkspaceProjectPhaseDefinitions()
  const update = useUpdateWorkspaceProjectPhaseDefinitions()
  const [items, setItems] = useState<EditableDefinition[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!definitions.data || dirty) return
    setItems(definitions.data.items.map(({ position: _position, ...item }) => item))
  }, [definitions.data, dirty])

  const validation = useMemo(() => {
    const names = items.map((item) => item.name.trim())
    if (names.some((name) => !name)) return '모든 단계 이름을 입력하세요.'
    if (names.some((name) => name.length > 40)) return '단계 이름은 40자 이하여야 합니다.'
    if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) {
      return '단계 이름은 서로 달라야 합니다.'
    }
    return null
  }, [items])

  if (definitions.isPending) return <ListSkeleton />
  if (definitions.isError) {
    if (definitions.error instanceof ApiError && definitions.error.status === 403) {
      return <EmptyState title="접근 권한이 없습니다" hint="프로젝트 단계는 워크스페이스 관리자만 변경할 수 있습니다." />
    }
    return <ErrorState error={definitions.error} onRetry={() => definitions.refetch()} />
  }

  const stale = update.error instanceof ApiError && update.error.status === 412
  const changed = dirty && !sameDefinitions(items, definitions.data.items)

  const replaceItems = (next: EditableDefinition[]) => {
    setItems(next)
    setDirty(!sameDefinitions(next, definitions.data.items))
    update.reset()
  }

  const reset = () => {
    setItems(definitions.data.items.map(({ position: _position, ...item }) => item))
    setDirty(false)
    update.reset()
  }

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="프로젝트 단계"
      description="모든 프로젝트가 공유할 수명주기 이름, 색상과 진행 순서를 관리합니다."
      meta={`revision ${definitions.data.revision}`}
    >
      <SettingsSection
        title="단계 정의"
        description="단계의 내부 키는 유지되므로 기존 프로젝트의 활성화, 일정, 게이트와 버전은 보존됩니다."
        ariaLabel="워크스페이스 프로젝트 단계 정의"
      >
        <ol className="divide-y divide-of-border border-y border-of-border">
          {items.map((item, index) => (
            <li
              key={item.key}
              className="grid min-w-0 gap-3 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(15rem,1fr)] sm:items-center"
            >
              <div className="flex items-center gap-1">
                <span className="w-5 text-center text-[11px] tabular-nums text-of-muted">
                  {index + 1}
                </span>
                <button
                  type="button"
                  className="of-icon-button"
                  aria-label={`${item.name || index + 1} 단계 위로 이동`}
                  title="위로 이동"
                  disabled={index === 0 || update.isPending}
                  onClick={() => {
                    const next = [...items]
                    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                    replaceItems(next)
                  }}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="of-icon-button"
                  aria-label={`${item.name || index + 1} 단계 아래로 이동`}
                  title="아래로 이동"
                  disabled={index === items.length - 1 || update.isPending}
                  onClick={() => {
                    const next = [...items]
                    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
                    replaceItems(next)
                  }}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </div>

              <label className="min-w-0 text-[11px] font-medium text-of-muted">
                단계 이름
                <Input
                  className="mt-1"
                  value={item.name}
                  maxLength={40}
                  aria-label={`${index + 1}번째 단계 이름`}
                  disabled={update.isPending}
                  onChange={(event) => {
                    const next = items.map((current) =>
                      current.key === item.key
                        ? { ...current, name: event.target.value }
                        : current,
                    )
                    replaceItems(next)
                  }}
                />
              </label>

              <fieldset className="min-w-0">
                <legend className="text-[11px] font-medium text-of-muted">단계 색상</legend>
                <div className="mt-1 grid grid-cols-4 gap-1" role="radiogroup">
                  {COLORS.map((color) => (
                    <label
                      key={color.value}
                      className={cn(
                        'flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-of border px-2 py-2 text-[11px] transition-colors focus-within:ring-2 focus-within:ring-of-focus',
                        item.color === color.value
                          ? 'border-of-accent bg-of-surface-selected text-of-text'
                          : 'border-of-border bg-of-surface text-of-muted hover:bg-of-surface-hover',
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={`phase-color-${item.key}`}
                        value={color.value}
                        checked={item.color === color.value}
                        disabled={update.isPending}
                        onChange={() =>
                          replaceItems(
                            items.map((current) =>
                              current.key === item.key
                                ? { ...current, color: color.value }
                                : current,
                            ),
                          )
                        }
                      />
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', color.className)} />
                      <span className="truncate">{color.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>

        {validation ? (
          <p className="mt-3 text-xs text-of-danger" role="alert">{validation}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!changed || Boolean(validation) || update.isPending}
            onClick={() =>
              update.mutate(
                { items: normalized(items), revision: definitions.data.revision },
                { onSuccess: () => setDirty(false) },
              )
            }
          >
            {update.isPending ? <LoaderCircle size={13} className="animate-spin" /> : null}
            단계 저장
          </Button>
          {changed ? (
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={reset}>
              되돌리기
            </Button>
          ) : null}
        </div>

        {update.isError ? (
          <p className="mt-3 text-xs text-of-danger" role="alert">
            {stale
              ? '다른 관리자가 먼저 변경했습니다. 현재 편집은 유지했으며 최신 revision으로 다시 저장할 수 있습니다.'
              : '프로젝트 단계 정의를 저장하지 못했습니다.'}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="적용 범위"
        description="저장 즉시 모든 프로젝트 설정과 Overview가 같은 단계 정의를 사용합니다."
      >
        <div className="flex min-w-0 items-start gap-2 border-l-2 border-of-accent px-3 py-1.5">
          <Workflow size={15} className="mt-0.5 shrink-0 text-of-accent" />
          <p className="min-w-0 text-xs leading-5 text-of-muted">
            순서를 변경하면 단계 겹침 검증과 후속 근무일 자동 일정도 새 순서를 따릅니다. 프로젝트별 저장값은
            변경하지 않습니다.
          </p>
        </div>
        {!dirty && !update.isError ? (
          <p className="mt-3 text-[11px] text-of-muted">
            최근 변경: {definitions.data.updated_by_name ?? '초기 설정'} · {formatDateTime(definitions.data.updated_at)}
          </p>
        ) : null}
      </SettingsSection>
    </SettingsFrame>
  )
}
