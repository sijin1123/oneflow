import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  Plus,
  Workflow,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import {
  type ProjectPhaseColor,
  type WorkspaceProjectPhaseDefinition,
  useCreateWorkspaceProjectPhaseDefinition,
  useSetWorkspaceProjectPhaseRetired,
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

type EditableDefinition = WorkspaceProjectPhaseDefinition

function normalized(items: EditableDefinition[]) {
  return items.map(({ key, name, color }) => ({ key, name: name.trim(), color }))
}

function sameDefinitions(
  local: EditableDefinition[],
  saved: WorkspaceProjectPhaseDefinition[],
) {
  return JSON.stringify(normalized(local)) === JSON.stringify(
    saved.map(({ key, name, color }) => ({ key, name, color })),
  )
}

export function WorkspacePhaseDefinitionsSettingsPage() {
  const definitions = useWorkspaceProjectPhaseDefinitions()
  const update = useUpdateWorkspaceProjectPhaseDefinitions()
  const create = useCreateWorkspaceProjectPhaseDefinition()
  const retirement = useSetWorkspaceProjectPhaseRetired()
  const [items, setItems] = useState<EditableDefinition[]>([])
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<ProjectPhaseColor>('sky')

  useEffect(() => {
    if (!definitions.data || dirty) return
    setItems(definitions.data.items)
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
    || create.error instanceof ApiError && create.error.status === 412
    || retirement.error instanceof ApiError && retirement.error.status === 412
  const changed = dirty && !sameDefinitions(items, definitions.data.items)
  const busy = update.isPending || create.isPending || retirement.isPending
  const activeItems = items.filter((item) => !item.retired)
  const retiredItems = items.filter((item) => item.retired)
  const newNameError = !newName.trim()
    ? null
    : newName.trim().length > 40
      ? '단계 이름은 40자 이하여야 합니다.'
      : items.some((item) => item.name.trim().toLocaleLowerCase() === newName.trim().toLocaleLowerCase())
        ? '이미 사용 중인 단계 이름입니다.'
        : null

  const replaceItems = (next: EditableDefinition[]) => {
    setItems(next)
    setDirty(!sameDefinitions(next, definitions.data.items))
    update.reset()
  }

  const reset = () => {
    setItems(definitions.data.items)
    setDirty(false)
    update.reset()
  }

  const moveActive = (key: string, direction: -1 | 1) => {
    const activeIndex = activeItems.findIndex((item) => item.key === key)
    const target = activeItems[activeIndex + direction]
    if (!target) return
    const currentIndex = items.findIndex((item) => item.key === key)
    const targetIndex = items.findIndex((item) => item.key === target.key)
    const next = [...items]
    ;[next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]]
    replaceItems(next)
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
        description="Built-in 단계는 항상 유지됩니다. Custom 단계를 은퇴해도 프로젝트의 활성화, 일정, 게이트와 버전은 삭제되지 않습니다."
        ariaLabel="워크스페이스 프로젝트 단계 정의"
      >
        <ol className="divide-y divide-of-border border-y border-of-border">
          {activeItems.map((item, index) => (
            <li
              key={item.key}
              className="grid min-w-0 gap-3 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(15rem,1fr)_2rem] sm:items-center"
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
                  disabled={index === 0 || busy}
                  onClick={() => moveActive(item.key, -1)}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="of-icon-button"
                  aria-label={`${item.name || index + 1} 단계 아래로 이동`}
                  title="아래로 이동"
                  disabled={index === activeItems.length - 1 || busy}
                  onClick={() => moveActive(item.key, 1)}
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
                  disabled={busy}
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
                        disabled={busy}
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
              {!item.built_in ? (
                <button
                  type="button"
                  className="of-icon-button sm:col-start-4 sm:justify-self-end"
                  title="단계 은퇴"
                  aria-label={`${item.name} 단계 은퇴`}
                  disabled={busy || changed}
                  onClick={() => {
                    if (!window.confirm(`${item.name} 단계를 은퇴할까요? 프로젝트별 저장 데이터는 보존됩니다.`)) return
                    retirement.mutate(
                      { phaseKey: item.key, retired: true, revision: definitions.data.revision },
                      { onSuccess: () => setDirty(false) },
                    )
                  }}
                >
                  <Archive size={14} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ol>

        {validation ? (
          <p className="mt-3 text-xs text-of-danger" role="alert">{validation}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!changed || Boolean(validation) || busy}
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
            <Button size="sm" variant="outline" disabled={busy} onClick={reset}>
              되돌리기
            </Button>
          ) : null}
        </div>

        {update.isError || create.isError || retirement.isError ? (
          <p className="mt-3 text-xs text-of-danger" role="alert">
            {stale
              ? '다른 관리자가 먼저 변경했습니다. 현재 편집은 유지했으며 최신 revision으로 다시 저장할 수 있습니다.'
              : '프로젝트 단계 변경을 저장하지 못했습니다.'}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Custom 단계"
        description={`현재 활성 ${activeItems.length}/12 · 전체 ${items.length}/32. 새 단계는 모든 프로젝트에서 비활성 상태로 제공되며 프로젝트 소유자가 필요한 곳에서 활성화합니다.`}
        ariaLabel="Custom 프로젝트 단계"
      >
        <div className="grid min-w-0 gap-2 border-y border-of-border py-3 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,1fr)_auto] sm:items-end">
          <label className="min-w-0 text-[11px] font-medium text-of-muted">
            새 단계 이름
            <Input
              className="mt-1"
              value={newName}
              maxLength={40}
              placeholder="예: 검증"
              disabled={busy || changed || activeItems.length >= 12 || items.length >= 32}
              onChange={(event) => {
                create.reset()
                setNewName(event.target.value)
              }}
            />
          </label>
          <fieldset className="min-w-0">
            <legend className="text-[11px] font-medium text-of-muted">새 단계 색상</legend>
            <div className="mt-1 grid grid-cols-4 gap-1" role="radiogroup">
              {COLORS.map((color) => (
                <label
                  key={color.value}
                  className={cn(
                    'flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-of border px-2 py-2 text-[11px] transition-colors focus-within:ring-2 focus-within:ring-of-focus',
                    newColor === color.value
                      ? 'border-of-accent bg-of-surface-selected text-of-text'
                      : 'border-of-border bg-of-surface text-of-muted hover:bg-of-surface-hover',
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="new-phase-color"
                    value={color.value}
                    checked={newColor === color.value}
                    disabled={busy || changed}
                    onChange={() => setNewColor(color.value)}
                  />
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', color.className)} />
                  <span className="truncate">{color.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            size="sm"
            disabled={!newName.trim() || Boolean(newNameError) || busy || changed || activeItems.length >= 12 || items.length >= 32}
            onClick={() =>
              create.mutate(
                { name: newName.trim(), color: newColor, revision: definitions.data.revision },
                { onSuccess: () => setNewName('') },
              )
            }
          >
            {create.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Plus size={13} />}
            단계 추가
          </Button>
        </div>
        {newNameError ? <p className="mt-2 text-xs text-of-danger" role="alert">{newNameError}</p> : null}

        {retiredItems.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold">은퇴한 단계</h3>
            <p className="mt-1 text-[11px] leading-5 text-of-muted">
              프로젝트별 기존 일정과 게이트는 읽기 전용으로 보존되며, 복원하면 같은 내부 키와 데이터를 다시 사용합니다.
            </p>
            <ul className="mt-2 divide-y divide-of-border border-y border-of-border">
              {retiredItems.map((item) => (
                <li key={item.key} className="flex min-w-0 items-center gap-3 py-3">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', COLORS.find((color) => color.value === item.color)?.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{item.name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-of-muted">{item.key}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || changed || activeItems.length >= 12}
                    onClick={() =>
                      retirement.mutate(
                        { phaseKey: item.key, retired: false, revision: definitions.data.revision },
                        { onSuccess: () => setDirty(false) },
                      )
                    }
                  >
                    <ArchiveRestore size={13} /> 복원
                  </Button>
                </li>
              ))}
            </ul>
          </div>
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
        {!dirty && !update.isError && !create.isError && !retirement.isError ? (
          <p className="mt-3 text-[11px] text-of-muted">
            최근 변경: {definitions.data.updated_by_name ?? '초기 설정'} · {formatDateTime(definitions.data.updated_at)}
          </p>
        ) : null}
      </SettingsSection>
    </SettingsFrame>
  )
}
