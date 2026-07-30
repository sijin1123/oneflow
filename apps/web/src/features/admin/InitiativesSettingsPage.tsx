import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowUpRight,
  CheckCircle2,
  Compass,
  Database,
  FileSearch,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type InitiativeLabel,
  useCreateInitiativeLabel,
  useDeleteInitiativeLabel,
  useInitiativeLabels,
  useUpdateInitiativeLabel,
} from '@/features/initiatives/api'
import {
  useInitiativesPolicy,
  useUpdateInitiativesPolicy,
} from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { useUnsavedLocationPrompt } from '@/lib/guards'
import { cn } from '@/lib/utils'

const DEFAULT_LABEL_COLOR = '#64748b'
const actionClassName =
  'of-touch-target inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text transition-colors hover:border-of-border-strong hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus'

type LabelAction =
  | { kind: 'create'; input: { name: string; color: string } }
  | { kind: 'update'; input: { id: string; name: string; color: string } }

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function PolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-of-surface px-3 py-3">
      <dt className="text-[10px] font-medium uppercase text-of-muted">{label}</dt>
      <dd className="mt-1 truncate text-xs font-semibold">{value}</dd>
    </div>
  )
}

function InitiativesSettingsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Initiatives 설정 불러오는 중"
      className="space-y-5 py-5"
    >
      <span className="sr-only">Initiatives 설정을 불러오는 중입니다.</span>
      <div className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-of-surface px-3 py-3">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="mt-2 h-4 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-none" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.55fr)]">
        <Skeleton className="h-72 w-full rounded-none" />
        <Skeleton className="h-72 w-full rounded-none" />
      </div>
    </div>
  )
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function InitiativesSettingsPage() {
  const policy = useInitiativesPolicy()
  const updatePolicy = useUpdateInitiativesPolicy()
  const labels = useInitiativeLabels(policy.data?.enabled === true)
  const createLabel = useCreateInitiativeLabel()
  const updateLabel = useUpdateInitiativeLabel()
  const deleteLabel = useDeleteInitiativeLabel()
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_LABEL_COLOR)
  const [editing, setEditing] = useState<InitiativeLabel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InitiativeLabel | null>(null)
  const [failedPolicyTarget, setFailedPolicyTarget] = useState<boolean | null>(null)
  const [failedLabelAction, setFailedLabelAction] = useState<LabelAction | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const createNameRef = useRef<HTMLInputElement | null>(null)
  const deleteSucceededRef = useRef(false)

  const data = policy.data
  const labelItems = labels.data?.items ?? []
  const originalEditing = editing
    ? labelItems.find((item) => item.id === editing.id)
    : undefined
  const createDirty = name.length > 0 || color !== DEFAULT_LABEL_COLOR
  const editDirty = Boolean(
    editing &&
      originalEditing &&
      (editing.name !== originalEditing.name || editing.color !== originalEditing.color),
  )
  useUnsavedLocationPrompt(
    createDirty || editDirty,
    '저장하지 않은 이니셔티브 라벨 변경을 버리고 이동할까요?',
  )

  const stale = updatePolicy.error instanceof ApiError && updatePolicy.error.status === 412
  const policyStale = Boolean(data && policy.isError)
  const labelsStale = Boolean(labels.data && labels.isError)
  const policyFresh = Boolean(data && !policy.isFetching && !policyStale)
  const labelWritesReady = Boolean(
    data?.enabled &&
      policyFresh &&
      labels.data &&
      !labels.isFetching &&
      !labelsStale,
  )
  const busy =
    updatePolicy.isPending ||
    createLabel.isPending ||
    updateLabel.isPending ||
    deleteLabel.isPending
  const refreshing = policy.isFetching || labels.isFetching

  const resetLabelMutations = () => {
    createLabel.reset()
    updateLabel.reset()
    deleteLabel.reset()
  }

  const changePolicy = (enabled: boolean) => {
    if (!data || !policyFresh) return
    updatePolicy.reset()
    setFailedPolicyTarget(null)
    setSuccessMessage(null)
    updatePolicy.mutate(
      { enabled, revision: data.revision },
      {
        onSuccess: () => {
          setSuccessMessage(
            enabled
              ? '이니셔티브를 활성화했습니다.'
              : '이니셔티브를 비활성화했습니다. 기존 전략 데이터와 라벨은 유지됩니다.',
          )
        },
        onError: () => setFailedPolicyTarget(enabled),
      },
    )
  }

  const runCreate = (input: { name: string; color: string }) => {
    if (!labelWritesReady) return
    resetLabelMutations()
    setFailedLabelAction(null)
    setSuccessMessage(null)
    createLabel.mutate(input, {
      onSuccess: () => {
        setName('')
        setColor(DEFAULT_LABEL_COLOR)
        setSuccessMessage(`'${input.name}' 라벨을 추가했습니다.`)
      },
      onError: () => setFailedLabelAction({ kind: 'create', input }),
    })
  }

  const runUpdate = (input: { id: string; name: string; color: string }) => {
    if (!labelWritesReady) return
    resetLabelMutations()
    setFailedLabelAction(null)
    setSuccessMessage(null)
    updateLabel.mutate(input, {
      onSuccess: () => {
        setEditing(null)
        setSuccessMessage(`'${input.name}' 라벨을 저장했습니다.`)
      },
      onError: () => setFailedLabelAction({ kind: 'update', input }),
    })
  }

  const runDelete = (target: InitiativeLabel) => {
    if (!labelWritesReady) return
    deleteLabel.reset()
    setSuccessMessage(null)
    deleteLabel.mutate(target.id, {
      onSuccess: () => {
        deleteSucceededRef.current = true
        setDeleteTarget(null)
        setSuccessMessage(`'${target.name}' 라벨을 삭제했습니다.`)
      },
    })
  }

  const refresh = async () => {
    setSuccessMessage(null)
    await Promise.all([
      policy.refetch(),
      data?.enabled ? labels.refetch() : Promise.resolve(null),
    ])
  }

  const retryLabelAction = () => {
    if (!failedLabelAction || !labelWritesReady) return
    if (failedLabelAction.kind === 'create') runCreate(failedLabelAction.input)
    else runUpdate(failedLabelAction.input)
  }

  const openDeleteDialog = (
    target: InitiativeLabel,
    trigger: HTMLButtonElement,
  ) => {
    deleteLabel.reset()
    setSuccessMessage(null)
    deleteSucceededRef.current = false
    deleteTriggerRef.current = trigger
    setDeleteTarget(target)
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <FrameContextActions>
        <Link to="/admin/overview" className={actionClassName}>
          <Settings2 size={13} aria-hidden="true" />
          관리 개요
        </Link>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={13}
            className={policy.isFetching || labels.isFetching ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          새로고침
        </Button>
      </FrameContextActions>

      <div
        data-testid="initiatives-settings-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={busy || refreshing}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <header className="grid gap-4 border-b border-of-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">
                Workspace administration
              </p>
              <h1 className="mt-1 text-xl font-semibold">Initiatives</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                전략 목표, 프로젝트 연결과 공통 라벨의 워크스페이스 정책을 관리합니다.
              </p>
            </div>
            {data ? (
              <Badge variant="outline" className="justify-self-start">
                정책 revision {data.revision}
              </Badge>
            ) : null}
          </header>

          {!data && policy.isPending ? <InitiativesSettingsSkeleton /> : null}

          {!data && policy.isError ? (
            <div className="py-5">
              {policy.error instanceof ApiError && policy.error.status === 403 ? (
                <EmptyState
                  title="접근 권한이 없습니다"
                  hint="워크스페이스 이니셔티브 정책은 관리자만 변경할 수 있습니다."
                />
              ) : (
                <ErrorState error={policy.error} onRetry={() => void policy.refetch()} />
              )}
            </div>
          ) : null}

          {data ? (
            <div className="space-y-5 py-5">
              <dl
                aria-label="Initiatives 정책 요약"
                className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4"
              >
                <PolicyFact label="현재 상태" value={data.enabled ? '활성' : '비활성'} />
                <PolicyFact
                  label="탐색·검색·보고"
                  value={data.enabled ? '표시됨' : '숨김'}
                />
                <PolicyFact
                  label="Initiatives API"
                  value={data.enabled ? '사용 가능' : '차단됨'}
                />
                <PolicyFact
                  label="전략 데이터"
                  value={data.enabled && labels.data ? `라벨 ${labels.data.total}개` : '보존됨'}
                />
              </dl>

              <section aria-labelledby="initiatives-policy-title">
                <div className="flex min-w-0 items-center justify-between gap-3 border-y border-of-border-subtle py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted">
                      <Compass size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 id="initiatives-policy-title" className="text-sm font-semibold">
                          전략 이니셔티브
                        </h2>
                        <Badge variant={data.enabled ? 'accent' : 'outline'}>
                          {data.enabled ? '활성' : '비활성'}
                        </Badge>
                      </div>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                        목록, 프로젝트 연결, 상태 보고, 통합 검색과 API 접근을 함께 제어합니다.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={data.enabled}
                    aria-label="이니셔티브 사용"
                    disabled={busy || !policyFresh}
                    onClick={() => changePolicy(!data.enabled)}
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
                      {updatePolicy.isPending ? (
                        <LoaderCircle className="h-3 w-3 animate-spin text-of-muted" />
                      ) : null}
                    </span>
                  </button>
                </div>

                <div className="min-h-9 py-2" aria-live="polite">
                  {successMessage ? (
                    <p role="status" className="flex items-center gap-1.5 text-xs text-of-success">
                      <CheckCircle2 size={13} aria-hidden="true" />
                      {successMessage}
                    </p>
                  ) : null}
                  {updatePolicy.isError ? (
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-xs leading-5 text-of-danger" role="alert">
                        {stale
                          ? '다른 관리자가 정책을 변경했습니다. 최신 상태를 불러왔으니 같은 변경을 다시 시도할 수 있습니다.'
                          : errorMessage(
                              updatePolicy.error,
                              '이니셔티브 정책을 변경하지 못했습니다.',
                            )}
                      </p>
                      {failedPolicyTarget !== null ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || !policyFresh}
                          onClick={() => changePolicy(failedPolicyTarget)}
                        >
                          {failedPolicyTarget
                            ? '이니셔티브 켜기 다시 시도'
                            : '이니셔티브 끄기 다시 시도'}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {policyStale ? (
                    <div
                      role="alert"
                      className="flex min-w-0 flex-col gap-2 border-y border-of-danger/15 bg-of-danger-soft px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="min-w-0 break-words text-of-danger">
                        정책을 갱신하지 못했습니다. 마지막으로 확인한 상태를 유지하며 복구
                        전까지 정책 변경과 라벨 저장은 사용할 수 없습니다.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full shrink-0 sm:w-auto"
                        disabled={policy.isFetching}
                        onClick={() => void policy.refetch()}
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                        정책 다시 시도
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>

              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.55fr)]">
                <section
                  aria-label="라벨"
                  className="min-w-0 border-y border-of-border-subtle"
                >
                  <header className="flex min-w-0 items-start justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Tag size={16} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold">라벨</h2>
                        <p className="mt-1 text-xs leading-5 text-of-muted">
                          이니셔티브를 공통 분류하고 목록에서 필터링합니다.
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {labels.data?.total ?? 0}/50
                    </Badge>
                  </header>

                  {!data.enabled ? (
                    <div className="border-t border-of-border-subtle py-4">
                      <EmptyState
                        title="이니셔티브가 비활성화되어 있습니다"
                        hint="기능을 켜면 저장된 라벨과 배정을 그대로 다시 관리할 수 있습니다."
                      />
                    </div>
                  ) : labels.isPending && !labels.data ? (
                    <div
                      className="flex items-center gap-2 border-t border-of-border-subtle py-5 text-xs text-of-muted"
                      role="status"
                    >
                      <LoaderCircle className="animate-spin" size={15} />
                      라벨 불러오는 중
                    </div>
                  ) : labels.isError && !labels.data ? (
                    <div className="border-t border-of-border-subtle py-4">
                      <ErrorState error={labels.error} onRetry={() => void labels.refetch()} />
                    </div>
                  ) : labels.data ? (
                    <div className="border-t border-of-border-subtle">
                      {labels.isError ? (
                        <div
                          role="alert"
                          className="flex min-w-0 flex-col gap-2 border-b border-of-danger/15 bg-of-danger-soft px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                        >
                          <p className="min-w-0 break-words text-of-danger">
                            라벨 목록을 갱신하지 못했습니다. 마지막으로 확인한 목록을 유지합니다.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full shrink-0 sm:w-auto"
                            disabled={labels.isFetching}
                            onClick={() => void labels.refetch()}
                          >
                            <RefreshCw size={13} aria-hidden="true" />
                            라벨 목록 다시 시도
                          </Button>
                        </div>
                      ) : null}
                      <form
                        aria-label="이니셔티브 라벨 생성"
                        className="grid min-w-0 gap-2 py-3 sm:grid-cols-[44px_minmax(0,1fr)_auto]"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const trimmedName = name.trim()
                          if (trimmedName) runCreate({ name: trimmedName, color })
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
                          ref={createNameRef}
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="라벨 이름"
                          maxLength={40}
                          aria-label="새 라벨 이름"
                        />
                        <Button
                          size="sm"
                          type="submit"
                          disabled={
                            !name.trim() ||
                            busy ||
                            !labelWritesReady ||
                            labels.data.total >= 50
                          }
                        >
                          {createLabel.isPending ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Plus />
                          )}
                          라벨 추가
                        </Button>
                      </form>

                      {labelItems.length === 0 ? (
                        <p className="border-t border-dashed border-of-border-subtle py-6 text-center text-xs text-of-muted">
                          아직 라벨이 없습니다.
                        </p>
                      ) : (
                        <ul className="divide-y divide-of-border-subtle border-t border-of-border-subtle">
                          {labelItems.map((label) => {
                            const isEditing = editing?.id === label.id
                            return (
                              <li
                                key={label.id}
                                className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center"
                              >
                                {isEditing && editing ? (
                                  <>
                                    <input
                                      type="color"
                                      value={editing.color}
                                      onChange={(event) =>
                                        setEditing({ ...editing, color: event.target.value })
                                      }
                                      className="h-8 w-11 cursor-pointer rounded-of border border-of-border bg-of-surface p-1"
                                      aria-label={`${label.name} 색상`}
                                    />
                                    <Input
                                      value={editing.name}
                                      onChange={(event) =>
                                        setEditing({ ...editing, name: event.target.value })
                                      }
                                      maxLength={40}
                                      aria-label={`${label.name} 이름`}
                                      className="min-w-0 flex-1"
                                    />
                                    <div className="flex gap-1.5">
                                      <Button
                                        size="sm"
                                        disabled={
                                          !editing.name.trim() || busy || !labelWritesReady
                                        }
                                        onClick={() =>
                                          runUpdate({
                                            id: editing.id,
                                            name: editing.name.trim(),
                                            color: editing.color,
                                          })
                                        }
                                      >
                                        {updateLabel.isPending ? (
                                          <LoaderCircle className="animate-spin" />
                                        ) : null}
                                        저장
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditing(null)
                                          updateLabel.reset()
                                          if (failedLabelAction?.kind === 'update') {
                                            setFailedLabelAction(null)
                                          }
                                        }}
                                      >
                                        <X />
                                        취소
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
                                    <span className="min-w-0 flex-1 truncate text-sm">
                                      {label.name}
                                    </span>
                                    <div className="flex shrink-0 gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => {
                                          setEditing({ ...label })
                                          updateLabel.reset()
                                          setFailedLabelAction(null)
                                        }}
                                      >
                                        <Pencil />
                                        수정
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="subtleDanger"
                                        disabled={busy}
                                        onClick={(event) =>
                                          openDeleteDialog(label, event.currentTarget)
                                        }
                                      >
                                        <Trash2 />
                                        삭제
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}

                      {failedLabelAction ? (
                        <div
                          role="alert"
                          className="flex min-w-0 flex-col gap-2 border-t border-of-danger/15 bg-of-danger-soft px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                        >
                          <p className="min-w-0 break-words text-of-danger">
                            {failedLabelAction.kind === 'create'
                              ? errorMessage(createLabel.error, '라벨을 추가하지 못했습니다.')
                              : errorMessage(updateLabel.error, '라벨을 저장하지 못했습니다.')}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full shrink-0 sm:w-auto"
                            disabled={busy || !labelWritesReady}
                            onClick={retryLabelAction}
                          >
                            <RefreshCw size={13} aria-hidden="true" />
                            같은 내용으로 다시 시도
                          </Button>
                        </div>
                      ) : null}

                      <p className="border-t border-of-border-subtle py-2 text-[11px] leading-5 text-of-muted">
                        최대 50개까지 만들 수 있습니다. 라벨 삭제는 이니셔티브와 프로젝트를
                        삭제하지 않으며 기존 배정에서만 제거됩니다.
                      </p>
                    </div>
                  ) : null}
                </section>

                <aside aria-label="정책과 보존" className="min-w-0 border-y border-of-border-subtle">
                  <div className="flex items-start gap-2.5 py-3">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                    <div>
                      <h2 className="text-sm font-semibold">정책과 보존</h2>
                      <p className="mt-1 text-xs leading-5 text-of-muted">
                        비활성화 영향과 최근 정책 변경을 확인합니다.
                      </p>
                    </div>
                  </div>
                  <dl className="divide-y divide-of-border-subtle border-t border-of-border-subtle">
                    <div className="flex items-start gap-2.5 py-3">
                      <FileSearch size={14} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium">탐색·검색·보고</dt>
                        <dd className="mt-0.5 text-[11px] leading-5 text-of-muted">
                          {data.enabled
                            ? '워크스페이스 탐색, 통합 검색과 보고서에서 결과가 표시됩니다.'
                            : '모든 진입점과 API 결과가 숨겨집니다.'}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 py-3">
                      <Database size={14} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium">전략 데이터 보존</dt>
                        <dd className="mt-0.5 text-[11px] leading-5 text-of-muted">
                          이니셔티브, 프로젝트 연결, 상태 기록과 라벨은 정책과 관계없이
                          삭제되지 않습니다.
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 py-3">
                      <History size={14} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium">최근 정책 변경</dt>
                        <dd className="mt-0.5 break-words text-[11px] leading-5 text-of-muted">
                          {data.updated_by_name ?? '초기 워크스페이스 정책'}
                          <br />
                          {formatUpdatedAt(data.updated_at)}
                        </dd>
                      </div>
                    </div>
                  </dl>
                  <Link
                    to="/initiatives"
                    className={cn(actionClassName, 'my-3 w-full justify-center')}
                  >
                    실제 이니셔티브 보기
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </aside>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog.Root
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (deleteLabel.isPending) return
          if (!open) {
            setDeleteTarget(null)
            deleteLabel.reset()
          }
        }}
      >
        <Dialog.Portal>
          <ModalOverlay className="bg-black/40" />
          <ModalContent
            className="w-[min(28rem,calc(100vw-1.5rem))] rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (deleteSucceededRef.current) createNameRef.current?.focus()
              else deleteTriggerRef.current?.focus()
              deleteSucceededRef.current = false
            }}
          >
            <header className="flex items-start gap-3 border-b border-of-border-subtle px-4 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-danger-soft text-of-danger">
                <Trash2 size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold">
                  이니셔티브 라벨을 삭제할까요?
                </Dialog.Title>
                <Dialog.Description className="mt-1 break-words text-xs leading-5 text-of-muted">
                  <span className="font-medium text-of-text">{deleteTarget?.name}</span>
                  을 모든 이니셔티브 배정에서 제거합니다. 이니셔티브와 프로젝트는
                  삭제되지 않습니다.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="라벨 삭제 확인 창 닫기"
                  disabled={deleteLabel.isPending}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </header>

            {deleteLabel.isError ? (
              <p
                role="alert"
                className="mx-4 mt-4 rounded-of border border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs leading-5 text-of-danger"
              >
                {errorMessage(deleteLabel.error, '라벨을 삭제하지 못했습니다.')}
              </p>
            ) : null}

            <footer className="flex flex-col-reverse gap-2 px-4 py-3 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deleteLabel.isPending}
                >
                  취소
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={deleteLabel.isPending || !deleteTarget || !labelWritesReady}
                onClick={() => {
                  if (deleteTarget) runDelete(deleteTarget)
                }}
              >
                {deleteLabel.isPending ? (
                  <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={14} aria-hidden="true" />
                )}
                {deleteLabel.isPending
                  ? '삭제 중…'
                  : deleteLabel.isError
                    ? '같은 라벨 삭제 다시 시도'
                    : '라벨 삭제'}
              </Button>
            </footer>
          </ModalContent>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
