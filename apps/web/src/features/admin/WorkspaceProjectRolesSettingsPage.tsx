import {
  Archive,
  ArchiveRestore,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  useAdminProjectRoles,
  useCreateProjectRole,
  useProjectRoleCapabilities,
  useProjectRoleEvents,
  useSetProjectRoleArchived,
  useUpdateProjectRole,
} from '@/features/project-roles/api'
import type { ProjectRole, ProjectRoleEvent } from '@/features/project-roles/contract'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { confirmDestructive, useUnsavedChangesPrompt } from '@/lib/guards'
import { cn } from '@/lib/utils'

type RoleDraft = {
  name: string
  description: string
  permissions: string[]
}

const EMPTY_DRAFT: RoleDraft = { name: '', description: '', permissions: [] }

function draftFromRole(role: ProjectRole): RoleDraft {
  return {
    name: role.name,
    description: role.description ?? '',
    permissions: [...role.permissions],
  }
}

function normalizedDraft(draft: RoleDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    permissions: [...draft.permissions].sort(),
  }
}

function sameDraft(draft: RoleDraft, role: ProjectRole) {
  return JSON.stringify(normalizedDraft(draft)) === JSON.stringify({
    name: role.name,
    description: role.description ?? '',
    permissions: [...role.permissions].sort(),
  })
}

function roleErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '역할 변경을 저장하지 못했습니다.'
  if (error.status === 412) {
    return '다른 관리자가 먼저 변경했습니다. 편집 내용은 유지되며 최신 revision을 확인한 뒤 다시 저장할 수 있습니다.'
  }
  if (error.status === 409) return error.message
  if (error.status === 422) return '역할 이름, 설명과 권한 선택을 다시 확인하세요.'
  return error.message
}

function eventLabel(eventType: string) {
  if (eventType === 'created') return '생성'
  if (eventType === 'updated') return '수정'
  if (eventType === 'archived') return '보관'
  if (eventType === 'restored') return '복원'
  return eventType
}

function EventSummary({ event }: { event: ProjectRoleEvent }) {
  const snapshot = event.snapshot as {
    name?: unknown
    permissions?: unknown
    archived?: unknown
  }
  const roleName = typeof snapshot.name === 'string' ? snapshot.name : '역할'
  const permissionCount = Array.isArray(snapshot.permissions) ? snapshot.permissions.length : 0
  return (
    <li className="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">
          {eventLabel(event.event_type)} · {roleName}
        </p>
        <p className="mt-1 text-[11px] text-of-muted">
          {event.actor_name} · revision {event.revision} · capability {permissionCount}개
          {snapshot.archived === true ? ' · 보관됨' : ''}
        </p>
      </div>
      <time className="text-[11px] text-of-muted" dateTime={event.created_at}>
        {formatDateTime(event.created_at)}
      </time>
    </li>
  )
}

export function WorkspaceProjectRolesSettingsPage() {
  const [includeArchived, setIncludeArchived] = useState(false)
  const roles = useAdminProjectRoles(includeArchived)
  const capabilities = useProjectRoleCapabilities()
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<RoleDraft>(EMPTY_DRAFT)
  const [dirty, setDirty] = useState(false)

  const items = useMemo(() => roles.data?.items ?? [], [roles.data?.items])
  const selectedRole = items.find((role) => role.id === selectedRoleId) ?? null
  const events = useProjectRoleEvents(creating ? null : selectedRole?.id ?? null)
  const createRole = useCreateProjectRole()
  const updateRole = useUpdateProjectRole(selectedRole?.id ?? null)
  const setArchived = useSetProjectRoleArchived(selectedRole?.id ?? null)

  useUnsavedChangesPrompt(dirty, '저장하지 않은 역할 변경을 버리고 이동할까요?')

  useEffect(() => {
    if (creating || roles.isPending) return
    if (selectedRoleId && items.some((role) => role.id === selectedRoleId)) return
    setSelectedRoleId(items[0]?.id ?? null)
  }, [creating, items, roles.isPending, selectedRoleId])

  useEffect(() => {
    if (!selectedRole || creating || dirty) return
    setDraft(draftFromRole(selectedRole))
  }, [creating, dirty, selectedRole])

  if (roles.isPending || capabilities.isPending) return <ListSkeleton />
  if (roles.isError || capabilities.isError) {
    const error = roles.error ?? capabilities.error
    if (error instanceof ApiError && error.status === 403) {
      return (
        <EmptyState
          title="접근 권한이 없습니다"
          hint="사용자 지정 역할은 워크스페이스 관리자만 관리할 수 있습니다."
        />
      )
    }
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void roles.refetch()
          void capabilities.refetch()
        }}
      />
    )
  }

  const activeRoles = items.filter((role) => role.archived_at === null)
  const archivedRoles = items.filter((role) => role.archived_at !== null)
  const busy = createRole.isPending || updateRole.isPending || setArchived.isPending
  const validation = !draft.name.trim()
    ? '역할 이름을 입력하세요.'
    : draft.name.trim().length > 50
      ? '역할 이름은 50자 이하여야 합니다.'
      : draft.description.trim().length > 200
        ? '설명은 200자 이하여야 합니다.'
        : null
  const changed = creating ? dirty : Boolean(selectedRole && !sameDraft(draft, selectedRole))
  const mutationError = createRole.error ?? updateRole.error ?? setArchived.error

  const replaceDraft = (next: RoleDraft) => {
    setDraft(next)
    setDirty(creating ? true : selectedRole ? !sameDraft(next, selectedRole) : true)
    createRole.reset()
    updateRole.reset()
    setArchived.reset()
  }

  const confirmDiscard = () =>
    !dirty || window.confirm('저장하지 않은 역할 변경을 버릴까요?')

  const selectRole = (role: ProjectRole) => {
    if (!confirmDiscard()) return
    setCreating(false)
    setSelectedRoleId(role.id)
    setDraft(draftFromRole(role))
    setDirty(false)
  }

  const beginCreate = () => {
    if (!confirmDiscard()) return
    setCreating(true)
    setSelectedRoleId(null)
    setDraft(EMPTY_DRAFT)
    setDirty(false)
    createRole.reset()
    updateRole.reset()
    setArchived.reset()
  }

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="프로젝트 역할"
      description="프로젝트 멤버에게 추가로 위임할 수 있는 작업 관리 권한을 역할로 묶어 관리합니다."
      meta={`${activeRoles.length}개 활성 · 최대 50개`}
      className="max-w-6xl"
      actions={(
        <Button
          size="sm"
          variant="outline"
          disabled={roles.isFetching}
          onClick={() => void roles.refetch()}
        >
          <RefreshCw size={13} className={roles.isFetching ? 'animate-spin' : undefined} />
          새로고침
        </Button>
      )}
    >
      <SettingsSection
        title="기본 역할 경계"
        description="사용자 지정 역할은 멤버의 협업 권한 위에만 추가되며 소유자·멤버·뷰어의 시스템 경계를 바꾸지 않습니다."
        actions={<ShieldCheck size={16} className="text-of-muted" aria-hidden="true" />}
      >
        <dl className="divide-y divide-of-border-subtle border-y border-of-border-subtle text-xs">
          <div className="grid gap-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="font-medium">소유자</dt>
            <dd className="text-of-muted">프로젝트 설정과 멤버십을 관리하며 마지막 소유자는 보호됩니다.</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="font-medium">멤버</dt>
            <dd className="text-of-muted">기본 협업 권한에 아래에서 선택한 7개 관리 capability만 추가할 수 있습니다.</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="font-medium">뷰어</dt>
            <dd className="text-of-muted">읽기 전용이며 사용자 지정 역할을 배정할 수 없습니다.</dd>
          </div>
        </dl>
      </SettingsSection>

      <SettingsSection
        title="사용자 지정 프로젝트 역할"
        description="보관한 역할은 새 배정 목록에서 제외되지만 기존 멤버의 역할과 유효 권한은 명시적으로 재배정할 때까지 유지됩니다."
        ariaLabel="사용자 지정 프로젝트 역할 관리"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-7 cursor-pointer items-center gap-2 text-xs text-of-muted">
              <input
                type="checkbox"
                checked={includeArchived}
                disabled={busy}
                onChange={(event) => {
                  if (!confirmDiscard()) return
                  setIncludeArchived(event.target.checked)
                  setDirty(false)
                }}
              />
              보관 역할 포함
            </label>
            <Button size="sm" onClick={beginCreate} disabled={busy || activeRoles.length >= 50}>
              <Plus size={13} aria-hidden="true" /> 새 역할
            </Button>
          </div>
        )}
      >
        <div className="grid min-w-0 border-y border-of-border lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-of-border lg:border-b-0 lg:border-r" aria-label="역할 목록">
            <div className="flex items-center justify-between border-b border-of-border-subtle px-3 py-2 text-[11px] text-of-muted">
              <span>활성 {activeRoles.length}</span>
              {includeArchived ? <span>보관 {archivedRoles.length}</span> : null}
            </div>
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-of-muted">
                아직 사용자 지정 역할이 없습니다.
              </div>
            ) : (
              <nav className="max-h-[34rem] overflow-y-auto" aria-label="사용자 지정 역할">
                {items.map((role) => {
                  const selected = !creating && role.id === selectedRole?.id
                  return (
                    <button
                      key={role.id}
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      className={cn(
                        'flex w-full min-w-0 items-start gap-2 border-b border-of-border-subtle px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus',
                        selected ? 'bg-of-surface-selected' : 'hover:bg-of-surface-hover',
                      )}
                      onClick={() => selectRole(role)}
                    >
                      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs font-medium">{role.name}</span>
                          {role.archived_at ? <Badge variant="outline">보관</Badge> : null}
                        </span>
                        <span className="mt-1 block text-[11px] text-of-muted">
                          capability {role.permissions.length}개 · 배정 {role.assigned_member_count}명
                        </span>
                      </span>
                    </button>
                  )
                })}
              </nav>
            )}
          </aside>

          <form
            className="min-w-0 p-4 sm:p-5"
            aria-label={creating ? '새 프로젝트 역할' : '프로젝트 역할 편집'}
            onSubmit={(event) => {
              event.preventDefault()
              if (validation || !changed || busy) return
              const input = {
                name: draft.name.trim(),
                description: draft.description.trim() || null,
                permissions: draft.permissions,
              }
              if (creating) {
                createRole.mutate(input, {
                  onSuccess: (role) => {
                    setCreating(false)
                    setSelectedRoleId(role.id)
                    setDraft(draftFromRole(role))
                    setDirty(false)
                  },
                })
                return
              }
              if (!selectedRole) return
              updateRole.mutate(
                { ...input, expected_revision: selectedRole.revision },
                {
                  onSuccess: (role) => {
                    setDraft(draftFromRole(role))
                    setDirty(false)
                  },
                },
              )
            }}
          >
            {creating || selectedRole ? (
              <>
                <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">
                      {creating ? '새 역할' : selectedRole?.name}
                    </h3>
                    <p className="mt-1 text-[11px] text-of-muted">
                      {creating
                        ? '활성 역할로 생성되며 즉시 프로젝트 멤버 배정에 사용할 수 있습니다.'
                        : `revision ${selectedRole?.revision} · ${selectedRole?.updated_by_name} · ${selectedRole ? formatDateTime(selectedRole.updated_at) : ''}`}
                    </p>
                  </div>
                  {!creating && selectedRole ? (
                    <Badge variant={selectedRole.archived_at ? 'warning' : 'success'} className="self-start">
                      <UsersRound size={12} aria-hidden="true" /> 배정 {selectedRole.assigned_member_count}명
                    </Badge>
                  ) : null}
                </div>

                <div className="grid min-w-0 gap-4">
                  <label className="min-w-0 text-[11px] font-medium text-of-muted">
                    역할 이름
                    <Input
                      className="mt-1"
                      value={draft.name}
                      maxLength={50}
                      disabled={busy || Boolean(selectedRole?.archived_at)}
                      onChange={(event) => replaceDraft({ ...draft, name: event.target.value })}
                    />
                  </label>
                  <label className="min-w-0 text-[11px] font-medium text-of-muted">
                    설명
                    <Textarea
                      className="mt-1 min-h-20 resize-y text-xs"
                      value={draft.description}
                      maxLength={200}
                      disabled={busy || Boolean(selectedRole?.archived_at)}
                      onChange={(event) => replaceDraft({ ...draft, description: event.target.value })}
                    />
                    <span className="mt-1 block text-right font-normal tabular-nums">
                      {draft.description.length}/200
                    </span>
                  </label>

                  <fieldset disabled={busy || Boolean(selectedRole?.archived_at)}>
                    <legend className="text-xs font-semibold">위임 capability</legend>
                    <p className="mt-1 text-[11px] leading-5 text-of-muted">
                      선택한 권한은 해당 역할이 배정된 프로젝트에서만 실제 API 동작에 적용됩니다.
                    </p>
                    <div className="mt-2 divide-y divide-of-border-subtle border-y border-of-border-subtle">
                      {capabilities.data.items.map((capability) => {
                        const checked = draft.permissions.includes(capability.key)
                        return (
                          <label
                            key={capability.key}
                            className="grid min-w-0 cursor-pointer grid-cols-[1rem_minmax(0,1fr)] gap-2 py-3 text-xs"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              onChange={() =>
                                replaceDraft({
                                  ...draft,
                                  permissions: checked
                                    ? draft.permissions.filter((key) => key !== capability.key)
                                    : [...draft.permissions, capability.key],
                                })
                              }
                            />
                            <span className="min-w-0">
                              <span className="block font-medium">{capability.label}</span>
                              <span className="mt-1 block text-[11px] leading-4 text-of-muted">
                                {capability.note ?? capability.key}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                </div>

                {validation && dirty ? <p className="mt-3 text-xs text-of-danger" role="alert">{validation}</p> : null}
                {mutationError ? <p className="mt-3 text-xs text-of-danger" role="alert">{roleErrorMessage(mutationError)}</p> : null}
                {selectedRole?.archived_at ? (
                  <p className="mt-3 text-xs leading-5 text-of-muted">
                    보관된 역할은 읽기 전용입니다. 복원한 뒤 수정하거나 새 멤버에게 배정할 수 있습니다.
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {!selectedRole?.archived_at ? (
                    <Button type="submit" size="sm" disabled={!changed || Boolean(validation) || busy}>
                      {createRole.isPending || updateRole.isPending ? <LoaderCircle size={13} className="animate-spin" /> : null}
                      {creating ? '역할 생성' : '변경 저장'}
                    </Button>
                  ) : null}
                  {dirty ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setDraft(selectedRole ? draftFromRole(selectedRole) : EMPTY_DRAFT)
                        setDirty(false)
                        createRole.reset()
                        updateRole.reset()
                      }}
                    >
                      되돌리기
                    </Button>
                  ) : null}
                  {!creating && selectedRole ? (
                    selectedRole.archived_at ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          setArchived.mutate(
                            { archived: false, revision: selectedRole.revision },
                            {
                              onSuccess: (role) => {
                                setDraft(draftFromRole(role))
                                setDirty(false)
                              },
                            },
                          )
                        }
                      >
                        <ArchiveRestore size={13} aria-hidden="true" /> 역할 복원
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="subtleDanger"
                        disabled={busy || dirty}
                        onClick={() => {
                          if (!confirmDestructive(
                            `${selectedRole.name} 역할을 보관할까요? 기존 ${selectedRole.assigned_member_count}명의 배정과 유효 권한은 유지됩니다.`,
                          )) return
                          setArchived.mutate({ archived: true, revision: selectedRole.revision })
                        }}
                      >
                        <Archive size={13} aria-hidden="true" /> 역할 보관
                      </Button>
                    )
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex min-h-72 items-center justify-center text-center">
                <div>
                  <ShieldCheck className="mx-auto text-of-muted" size={24} aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium">관리할 역할을 선택하세요</p>
                  <p className="mt-1 text-xs text-of-muted">또는 새 역할을 만들어 capability를 구성할 수 있습니다.</p>
                </div>
              </div>
            )}
          </form>
        </div>
      </SettingsSection>

      {!creating && selectedRole ? (
        <SettingsSection
          title="변경 이력"
          description="역할 상태는 actor, revision과 당시 권한 snapshot으로 append-only 기록됩니다."
          actions={<History size={16} className="text-of-muted" aria-hidden="true" />}
          ariaLabel="프로젝트 역할 변경 이력"
        >
          {events.isPending ? (
            <div className="py-8 text-center text-xs text-of-muted" role="status">변경 이력을 불러오는 중입니다.</div>
          ) : events.isError ? (
            <div className="flex flex-wrap items-center gap-2 py-3" role="alert">
              <p className="text-xs text-of-danger">변경 이력을 불러오지 못했습니다.</p>
              <Button size="sm" variant="outline" onClick={() => void events.refetch()}>
                다시 시도
              </Button>
            </div>
          ) : events.data.items.length === 0 ? (
            <div className="py-8 text-center text-xs text-of-muted">기록된 변경 이력이 없습니다.</div>
          ) : (
            <>
              <ul className="divide-y divide-of-border-subtle border-y border-of-border-subtle">
                {events.data.items.map((event) => <EventSummary key={event.id} event={event} />)}
              </ul>
              <p className="mt-2 text-[11px] text-of-muted">
                최근 {events.data.items.length}건 / 전체 {events.data.total}건
              </p>
            </>
          )}
        </SettingsSection>
      ) : null}
    </SettingsFrame>
  )
}
