import { Compass, LoaderCircle, Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type InitiativeLabel,
  useCreateInitiativeLabel,
  useDeleteInitiativeLabel,
  useInitiativeLabels,
  useUpdateInitiativeLabel,
} from '@/features/initiatives/api'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import {
  useInitiativesPolicy,
  useUpdateInitiativesPolicy,
} from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function InitiativesSettingsPage() {
  const policy = useInitiativesPolicy()
  const update = useUpdateInitiativesPolicy()
  const labels = useInitiativeLabels(policy.data?.enabled === true)
  const createLabel = useCreateInitiativeLabel()
  const updateLabel = useUpdateInitiativeLabel()
  const deleteLabel = useDeleteInitiativeLabel()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#64748b')
  const [editing, setEditing] = useState<InitiativeLabel | null>(null)

  if (policy.isPending) return <ListSkeleton />
  if (policy.isError) {
    if (policy.error instanceof ApiError && policy.error.status === 403) {
      return (
        <EmptyState
          title="접근 권한이 없습니다"
          hint="워크스페이스 이니셔티브 정책은 관리자만 변경할 수 있습니다."
        />
      )
    }
    return <ErrorState error={policy.error} onRetry={() => policy.refetch()} />
  }

  const data = policy.data
  const stale = update.error instanceof ApiError && update.error.status === 412

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="Initiatives"
      description="프로젝트를 전략 목표로 묶는 이니셔티브 기능을 워크스페이스 전체에서 관리합니다."
      meta={`정책 revision ${data.revision}`}
    >
      <SettingsSection
        title="이니셔티브 사용"
        description="끄면 이니셔티브 API와 탐색·검색·프로젝트 요약에서 결과가 숨겨집니다. 저장된 이니셔티브와 프로젝트 연결은 삭제되지 않습니다."
      >
        <div className="flex min-w-0 flex-col gap-4 py-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted">
              <Compass size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">전략 이니셔티브</p>
                <Badge variant={data.enabled ? 'accent' : 'outline'}>
                  {data.enabled ? '활성' : '비활성'}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                이니셔티브 목록, 프로젝트 연결, 헬스 상태와 통합 검색을 함께 제어합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.enabled}
            aria-label="이니셔티브 사용"
            disabled={update.isPending}
            onClick={() => update.mutate({ enabled: !data.enabled, revision: data.revision })}
            className={cn(
              'relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-accent/50 disabled:cursor-not-allowed disabled:opacity-60',
              data.enabled
                ? 'border-of-accent bg-of-accent'
                : 'border-of-border bg-of-surface-2',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform',
                data.enabled ? 'translate-x-6' : 'translate-x-0.5',
              )}
            >
              {update.isPending ? <LoaderCircle className="h-3 w-3 animate-spin text-of-muted" /> : null}
            </span>
          </button>
        </div>
        {update.isError ? (
          <p className="mt-3 text-xs leading-5 text-of-danger" role="alert">
            {stale
              ? '다른 관리자가 정책을 변경했습니다. 최신 상태를 불러왔으니 다시 시도해 주세요.'
              : update.error instanceof Error
                ? update.error.message
                : '이니셔티브 정책을 변경하지 못했습니다.'}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="라벨"
        description="이니셔티브를 공통 분류하고 목록에서 정확히 필터링할 워크스페이스 라벨입니다. 최대 50개를 만들 수 있습니다."
      >
        {!data.enabled ? (
          <EmptyState
            title="이니셔티브가 비활성화되어 있습니다"
            hint="기능을 켜면 기존 라벨을 유지한 채 다시 관리할 수 있습니다."
          />
        ) : labels.isPending ? (
          <div className="flex items-center gap-2 py-4 text-xs text-of-muted" role="status">
            <LoaderCircle className="animate-spin" /> 라벨 불러오는 중
          </div>
        ) : labels.isError ? (
          <ErrorState error={labels.error} onRetry={() => labels.refetch()} />
        ) : (
          <div className="space-y-4">
            <form
              aria-label="이니셔티브 라벨 생성"
              className="grid min-w-0 gap-2 sm:grid-cols-[44px_minmax(0,1fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault()
                if (!name.trim()) return
                createLabel.mutate(
                  { name: name.trim(), color },
                  { onSuccess: () => { setName(''); setColor('#64748b') } },
                )
              }}
            >
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-8 w-11 cursor-pointer rounded-of border border-of-border bg-of-surface p-1"
                aria-label="새 라벨 색상"
              />
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="라벨 이름"
                maxLength={40}
                aria-label="새 라벨 이름"
              />
              <Button
                size="sm"
                type="submit"
                disabled={!name.trim() || createLabel.isPending || labels.data.total >= 50}
              >
                {createLabel.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
                라벨 추가
              </Button>
            </form>
            {labels.data.items.length === 0 ? (
              <p className="rounded-of border border-dashed border-of-border px-3 py-5 text-center text-xs text-of-muted">
                아직 라벨이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-of-border-subtle rounded-of border border-of-border">
                {labels.data.items.map((label) => {
                  const isEditing = editing?.id === label.id
                  return (
                    <li key={label.id} className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center">
                      {isEditing ? (
                        <>
                          <input
                            type="color"
                            value={editing.color}
                            onChange={(event) => setEditing({ ...editing, color: event.target.value })}
                            className="h-8 w-11 cursor-pointer rounded-of border border-of-border bg-of-surface p-1"
                            aria-label={`${label.name} 색상`}
                          />
                          <Input
                            value={editing.name}
                            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                            maxLength={40}
                            aria-label={`${label.name} 이름`}
                            className="min-w-0 flex-1"
                          />
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              disabled={!editing.name.trim() || updateLabel.isPending}
                              onClick={() => updateLabel.mutate(
                                { id: editing.id, name: editing.name.trim(), color: editing.color },
                                { onSuccess: () => setEditing(null) },
                              )}
                            >
                              {updateLabel.isPending ? <LoaderCircle className="animate-spin" /> : null}
                              저장
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              <X /> 취소
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span
                            className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                            style={{ backgroundColor: label.color }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">{label.name}</span>
                          <div className="flex shrink-0 gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(label); updateLabel.reset() }}>
                              <Pencil /> 수정
                            </Button>
                            <Button
                              size="sm"
                              variant="subtleDanger"
                              disabled={deleteLabel.isPending}
                              onClick={() => {
                                if (window.confirm(`'${label.name}' 라벨을 삭제할까요?\n이니셔티브 배정에서도 제거됩니다.`)) {
                                  deleteLabel.mutate(label.id)
                                }
                              }}
                            >
                              <Trash2 /> 삭제
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex items-center justify-between gap-2 text-[11px] text-of-muted">
              <span className="inline-flex items-center gap-1"><Tag size={12} />{labels.data.total}/50</span>
              <span>라벨 삭제는 이니셔티브나 프로젝트를 삭제하지 않습니다.</span>
            </div>
            {createLabel.isError || updateLabel.isError || deleteLabel.isError ? (
              <p role="alert" className="text-xs text-of-danger">
                {(createLabel.error ?? updateLabel.error ?? deleteLabel.error) instanceof Error
                  ? (createLabel.error ?? updateLabel.error ?? deleteLabel.error as Error).message
                  : '라벨을 변경하지 못했습니다.'}
              </p>
            ) : null}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="변경 이력" description="최근 정책 변경 주체와 시간을 확인합니다.">
        <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-of-muted">최근 변경자</dt>
            <dd className="mt-1 break-words font-medium">
              {data.updated_by_name ?? '초기 워크스페이스 정책'}
            </dd>
          </div>
          <div>
            <dt className="text-of-muted">최근 변경 시각</dt>
            <dd className="mt-1 font-medium">{formatUpdatedAt(data.updated_at)}</dd>
          </div>
        </dl>
      </SettingsSection>
    </SettingsFrame>
  )
}
