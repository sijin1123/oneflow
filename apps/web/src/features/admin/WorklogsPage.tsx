import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { useUnsavedLocationPromptWithBypass } from '@/lib/guards'

import {
  downloadAdminWorklogs,
  type AdminWorklog,
  type AdminWorklogList,
  type WorklogFilters,
  useAdminWorklogOptions,
  useAdminWorklogs,
} from './worklogsApi'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function validCalendarDate(value: string) {
  if (!DATE_RE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function localDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultRange() {
  const today = new Date()
  return {
    from: localDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: localDate(today),
  }
}

function rangeError(from: string, to: string) {
  if (!validCalendarDate(from) || !validCalendarDate(to)) {
    return '시작일과 종료일을 입력해 주세요.'
  }
  if (from > to) return '시작일은 종료일보다 늦을 수 없습니다.'
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  if (days > 365) return '한 번에 조회할 수 있는 기간은 최대 366일입니다.'
  return null
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const hours = (value: number) =>
  value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })

export function WorklogsPage() {
  const queryClient = useQueryClient()
  const defaults = defaultRange()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(new URLSearchParams(searchParams))
  searchParamsRef.current = new URLSearchParams(searchParams)
  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')
  const candidateFrom = rawFrom && validCalendarDate(rawFrom) ? rawFrom : defaults.from
  const candidateTo = rawTo && validCalendarDate(rawTo) ? rawTo : defaults.to
  const invalidUrlRange = rangeError(candidateFrom, candidateTo)
  const from = invalidUrlRange ? defaults.from : candidateFrom
  const to = invalidUrlRange ? defaults.to : candidateTo
  const rawUserId = searchParams.get('user') ?? ''
  const rawProjectId = searchParams.get('project') ?? ''
  const rawOffset = searchParams.get('offset')
  const parsedOffset = Number(rawOffset ?? 0)
  const offset =
    Number.isInteger(parsedOffset) && parsedOffset >= 0
      ? Math.floor(parsedOffset / 50) * 50
      : 0
  const options = useAdminWorklogOptions()
  const userId =
    !options.data ||
    rawUserId === '' ||
    rawUserId === 'deleted' ||
    options.data.users.some((item) => item.id === rawUserId)
      ? rawUserId
      : ''
  const projectId =
    !options.data ||
    rawProjectId === '' ||
    options.data.projects.some((item) => item.id === rawProjectId)
      ? rawProjectId
      : ''
  const [fromDraft, setFromDraft] = useState(from)
  const [toDraft, setToDraft] = useState(to)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<unknown>(null)
  const [downloadRetryFilters, setDownloadRetryFilters] = useState<WorklogFilters | null>(null)
  const [lastSuccessfulWorklogs, setLastSuccessfulWorklogs] = useState<AdminWorklogList | null>(null)
  const navigationBypassRef = useRef(false)
  const draftRangeError = rangeError(fromDraft, toDraft)
  const draftDirty = fromDraft !== from || toDraft !== to
  const filters: WorklogFilters = { from, to, userId, projectId, offset }
  const baseCanonicalOffset = offset === 0 ? null : String(offset)
  const needsCanonicalDates = rawFrom !== from || rawTo !== to
  const needsCanonicalFilters =
    Boolean(options.data) &&
    (rawUserId !== userId ||
      rawProjectId !== projectId ||
      (searchParams.has('user') && rawUserId === '') ||
      (searchParams.has('project') && rawProjectId === ''))
  const needsCanonicalOffsetShape = rawOffset !== baseCanonicalOffset
  const canQuery =
    Boolean(options.data) &&
    !needsCanonicalDates &&
    !needsCanonicalFilters &&
    !needsCanonicalOffsetShape
  const worklogs = useAdminWorklogs(filters, canQuery)
  useEffect(() => {
    if (worklogs.data && !worklogs.isError && !worklogs.isPlaceholderData) {
      setLastSuccessfulWorklogs(worklogs.data)
    }
  }, [worklogs.data, worklogs.isError, worklogs.isPlaceholderData])
  const cachedSuccessfulWorklogs = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['admin-worklogs'] })
    .filter((query) => query.state.status === 'success' && query.state.data)
    .sort((left, right) => right.state.dataUpdatedAt - left.state.dataUpdatedAt)[0]
    ?.state.data as AdminWorklogList | undefined
  const retainedData = worklogs.data ?? lastSuccessfulWorklogs ?? cachedSuccessfulWorklogs
  const total = worklogs.isPlaceholderData ? undefined : worklogs.data?.total
  const normalizedOffset =
    total === undefined
      ? undefined
      : total === 0
        ? 0
        : offset < total
          ? offset
          : Math.floor((total - 1) / 50) * 50
  const canonicalOffset =
    normalizedOffset === undefined
      ? baseCanonicalOffset
      : normalizedOffset === 0
        ? null
        : String(normalizedOffset)
  const needsCanonicalOffset = rawOffset !== canonicalOffset

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParamsRef.current)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    searchParamsRef.current = next
    navigationBypassRef.current = true
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (!needsCanonicalDates && !needsCanonicalFilters && !needsCanonicalOffset) return
    const next = new URLSearchParams(searchParams)
    next.set('from', from)
    next.set('to', to)
    if (userId) next.set('user', userId)
    else next.delete('user')
    if (projectId) next.set('project', projectId)
    else next.delete('project')
    if (canonicalOffset) next.set('offset', canonicalOffset)
    else next.delete('offset')
    searchParamsRef.current = next
    navigationBypassRef.current = true
    setSearchParams(next, { replace: true })
  }, [
    canonicalOffset,
    from,
    needsCanonicalDates,
    needsCanonicalFilters,
    needsCanonicalOffset,
    projectId,
    searchParams,
    setSearchParams,
    to,
    userId,
  ])

  useEffect(() => {
    setFromDraft(from)
    setToDraft(to)
  }, [from, to])

  useEffect(() => {
    navigationBypassRef.current = false
  }, [searchParams])

  useUnsavedLocationPromptWithBypass(
    draftDirty,
    '적용하지 않은 Worklogs 기간 변경을 버리고 이동할까요?',
    navigationBypassRef,
  )

  const downloadCsv = async (targetFilters: WorklogFilters) => {
    setDownloading(true)
    setDownloadError(null)
    setDownloadRetryFilters(targetFilters)
    try {
      const result = await downloadAdminWorklogs(targetFilters)
      saveBlob(result.blob, result.filename)
      setDownloadRetryFilters(null)
    } catch (downloadFailure) {
      setDownloadError(downloadFailure)
    } finally {
      setDownloading(false)
    }
  }

  const optionsForbidden =
    options.error instanceof ApiError && options.error.status === 403
  const worklogsForbidden =
    worklogs.error instanceof ApiError && worklogs.error.status === 403
  if (optionsForbidden || worklogsForbidden) {
    return (
      <EmptyState
        title="접근 권한이 없습니다"
        hint="워크스페이스 전체 Worklogs는 관리자만 볼 수 있습니다."
      />
    )
  }

  const data = retainedData
  const retainingFailedResult = worklogs.isError && Boolean(data)
  const selectedUser =
    userId === 'deleted'
      ? '삭제된 사용자'
      : options.data?.users.find((item) => item.id === userId)?.display_name
  const selectedProject = options.data?.projects.find((item) => item.id === projectId)?.name
  const canonicalizing =
    needsCanonicalDates || needsCanonicalFilters || needsCanonicalOffset
  const refreshing = options.isFetching || worklogs.isFetching
  const canExport =
    Boolean(options.data) && !canonicalizing && !draftRangeError

  const refreshAll = () => {
    void Promise.all([options.refetch(), worklogs.refetch()])
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <FrameContextActions>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canExport || downloading}
          onClick={() => void downloadCsv(filters)}
        >
          {downloading ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
          CSV
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={refreshAll}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
          모두 새로고침
        </Button>
      </FrameContextActions>

      <div
        data-testid="worklogs-operations-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={refreshing || canonicalizing}
      >
        <div className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-6 sm:py-6">
          <header className="grid gap-3 border-b border-of-border pb-4 sm:gap-4 sm:pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">Workspace administration</p>
              <h1 className="mt-1 text-xl font-semibold">Worklogs</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                구성원 전체의 시간 기록을 프로젝트와 기간 기준으로 조회하고 운영 자료로 내려받습니다.
              </p>
            </div>
            <dl
              aria-label="Worklogs 요약"
              className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4 lg:min-w-[23rem]"
            >
              <Summary label="기록" value={data ? `${data.total}건` : '—'} />
              <Summary label="합계" value={data ? `${hours(data.total_hours)}h` : '—'} />
              <Summary label="시작" value={data?.from_date ?? from} />
              <Summary label="종료" value={data?.to_date ?? to} />
            </dl>
          </header>

          <section aria-labelledby="worklogs-filter-title" className="border-b border-of-border py-4 sm:py-5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="worklogs-filter-title" className="text-sm font-semibold">조회 범위</h2>
                <p className="mt-1 text-xs leading-5 text-of-muted">
                  비활성 사용자와 아카이브 프로젝트의 기록도 감사 이력으로 유지됩니다.
                </p>
              </div>
              {selectedUser || selectedProject ? (
                <div className="flex min-w-0 flex-wrap gap-1.5 text-xs text-of-muted">
                  {selectedUser ? <Badge variant="outline">사용자: {selectedUser}</Badge> : null}
                  {selectedProject ? <Badge variant="outline">프로젝트: {selectedProject}</Badge> : null}
                </div>
              ) : null}
            </div>

            {options.isError ? (
              <div className="mt-4">
                <ErrorState error={options.error} onRetry={() => options.refetch()} />
              </div>
            ) : (
              <form
                className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_10rem_10rem_auto] xl:items-end"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (draftRangeError) return
                  setParams({ from: fromDraft, to: toDraft, offset: null })
                }}
              >
                <label className="text-xs font-medium text-of-muted">
                  사용자
                  <Select
                    aria-label="Worklogs 사용자"
                    value={userId}
                    disabled={!options.data}
                    onChange={(event) => setParams({ user: event.target.value || null, offset: null })}
                    className="mt-1 min-h-10"
                  >
                    <option value="">전체 사용자</option>
                    <option value="deleted">삭제된 사용자</option>
                    {options.data?.users.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.display_name} {!item.is_active ? '(비활성)' : ''}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="text-xs font-medium text-of-muted">
                  프로젝트
                  <Select
                    aria-label="Worklogs 프로젝트"
                    value={projectId}
                    disabled={!options.data}
                    onChange={(event) => setParams({ project: event.target.value || null, offset: null })}
                    className="mt-1 min-h-10"
                  >
                    <option value="">전체 프로젝트</option>
                    {options.data?.projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.key}) {item.is_archived ? '(보관됨)' : ''}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="text-xs font-medium text-of-muted">
                  시작일
                  <Input
                    type="date"
                    aria-label="Worklogs 시작일"
                    value={fromDraft}
                    onChange={(event) => setFromDraft(event.target.value)}
                    className="mt-1 min-h-10"
                    required
                  />
                </label>
                <label className="text-xs font-medium text-of-muted">
                  종료일
                  <Input
                    type="date"
                    aria-label="Worklogs 종료일"
                    value={toDraft}
                    onChange={(event) => setToDraft(event.target.value)}
                    className="mt-1 min-h-10"
                    required
                  />
                </label>
                <Button
                  type="submit"
                  className="mr-14 min-h-10 sm:mr-0"
                  disabled={!options.data || Boolean(draftRangeError) || !draftDirty}
                >
                  적용
                </Button>
              </form>
            )}

            {options.isPending ? (
              <div role="status" aria-label="Worklogs 필터 확인 중" className="mt-4 grid gap-2 md:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null}
            {draftRangeError ? (
              <p role="alert" className="mt-3 text-xs text-of-danger">{draftRangeError}</p>
            ) : null}
            {downloadError && downloadRetryFilters ? (
              <div role="alert" className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                <p className="text-xs text-of-danger">
                  CSV를 내려받지 못했습니다. 실패한 조회 조건으로 다시 시도할 수 있습니다.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={downloading}
                  onClick={() => void downloadCsv(downloadRetryFilters)}
                >
                  CSV 다시 시도
                </Button>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="worklogs-history-title" className="py-4 sm:py-5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-of-border-subtle pb-3">
              <div className="min-w-0">
                <h2 id="worklogs-history-title" className="text-sm font-semibold">시간 기록</h2>
                <p className="mt-1 text-xs leading-5 text-of-muted">
                  기록 당시의 사용자와 프로젝트 상태를 유지하며 Work item 원문으로 이동할 수 있습니다.
                </p>
              </div>
              {data ? (
                <span className="text-xs tabular-nums text-of-muted">
                  {data.total}건 · {hours(data.total_hours)}h
                </span>
              ) : null}
            </div>

            {retainingFailedResult ? (
              <div
                role="alert"
                className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-y border-of-danger/25 bg-of-danger/5 px-3 py-2"
              >
                <p className="min-w-0 text-xs leading-5 text-of-danger">
                  요청한 조건의 Worklogs를 불러오지 못했습니다. 이전 조회 결과를 유지합니다.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={worklogs.isFetching}
                  onClick={() => void worklogs.refetch()}
                >
                  {worklogs.isFetching ? <LoaderCircle size={13} className="animate-spin" /> : null}
                  요청 다시 시도
                </Button>
              </div>
            ) : null}

            {canonicalizing || (worklogs.isPending && !worklogs.isError) ? (
              <div role="status" aria-label="Worklogs 기록 확인 중" className="grid gap-2 py-5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : worklogs.isError && !data ? (
              <div className="py-5">
                <ErrorState error={worklogs.error} onRetry={() => worklogs.refetch()} />
              </div>
            ) : data?.total === 0 ? (
              <EmptyState
                title="조회 범위에 Worklog가 없습니다"
                hint="사용자, 프로젝트 또는 기간을 바꿔 다시 조회해 보세요."
              />
            ) : data ? (
              <>
                <div className="hidden overflow-x-auto border-b border-of-border-subtle md:block">
                  <table className="w-full min-w-[52rem] text-xs">
                    <thead>
                      <tr className="border-b border-of-border-subtle text-left text-[11px] text-of-muted">
                        <th className="px-3 py-2 font-medium">날짜</th>
                        <th className="px-3 py-2 font-medium">사용자</th>
                        <th className="px-3 py-2 font-medium">프로젝트 / 작업</th>
                        <th className="px-3 py-2 font-medium">메모</th>
                        <th className="px-3 py-2 text-right font-medium">시간</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-of-border-subtle">
                      {data.items.map((item) => <WorklogTableRow key={item.id} item={item} />)}
                    </tbody>
                  </table>
                </div>
                <ul aria-label="모바일 Worklogs 목록" className="grid gap-2 py-3 md:hidden">
                  {data.items.map((item) => <WorklogCard key={item.id} item={item} />)}
                </ul>
              </>
            ) : null}

            {data && (offset > 0 || offset + data.items.length < data.total) ? (
              <nav aria-label="Worklogs 페이지" className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs tabular-nums text-of-muted">
                  {offset + 1}-{Math.min(offset + data.items.length, data.total)} / {data.total}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="이전 Worklogs 페이지"
                    disabled={offset === 0}
                    onClick={() => setParams({ offset: offset > 50 ? String(offset - 50) : null })}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="다음 Worklogs 페이지"
                    disabled={offset + data.items.length >= data.total}
                    onClick={() => setParams({ offset: String(offset + 50) })}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </nav>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-of-surface px-2 py-2 sm:px-3">
      <p className="text-[11px] text-of-muted">{label}</p>
      <p className="mt-1 text-xs font-semibold tabular-nums sm:text-sm">{value}</p>
    </div>
  )
}

function UserLabel({ item }: { item: AdminWorklog }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="truncate font-medium">{item.user_display_name || '삭제된 사용자'}</span>
        {item.user_is_active === false ? <Badge variant="outline">비활성</Badge> : null}
      </div>
      {item.user_email ? <p className="truncate text-[11px] text-of-muted">{item.user_email}</p> : null}
    </div>
  )
}

function WorklogTableRow({ item }: { item: AdminWorklog }) {
  return (
    <tr>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.spent_on}</td>
      <td className="max-w-48 px-3 py-2"><UserLabel item={item} /></td>
      <td className="max-w-80 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-medium">{item.project_key}</span>
          <span className="truncate text-of-muted">{item.project_name}</span>
          {item.project_is_archived ? <Badge variant="outline">보관됨</Badge> : null}
        </div>
        <Link
          to={`/projects/${item.project_id}/work-packages/${item.work_package_id}`}
          className="mt-1 block truncate hover:text-of-accent hover:underline"
        >
          {item.work_package_subject}
        </Link>
      </td>
      <td className="max-w-72 px-3 py-2 text-of-muted"><p className="line-clamp-2">{item.comment || '—'}</p></td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{hours(item.hours)}h</td>
    </tr>
  )
}

function WorklogCard({ item }: { item: AdminWorklog }) {
  return (
    <li className="border border-of-border bg-of-surface p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <UserLabel item={item} />
        <span className="shrink-0 font-semibold tabular-nums">{hours(item.hours)}h</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-of-muted">
        <Clock3 size={13} /> {item.spent_on}
        <Badge variant="outline">{item.project_key}</Badge>
        {item.project_is_archived ? <Badge variant="outline">보관됨</Badge> : null}
      </div>
      <Link
        to={`/projects/${item.project_id}/work-packages/${item.work_package_id}`}
        className="mt-2 block font-medium hover:text-of-accent hover:underline"
      >
        {item.work_package_subject}
      </Link>
      {item.comment ? <p className="mt-1 line-clamp-2 text-of-muted">{item.comment}</p> : null}
    </li>
  )
}
