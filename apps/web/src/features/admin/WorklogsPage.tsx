import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { ApiError } from '@/lib/api'

import {
  downloadAdminWorklogs,
  type AdminWorklog,
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
  const draftRangeError = rangeError(fromDraft, toDraft)
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
  const total = worklogs.data?.total
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

  if (options.isPending) return <ListSkeleton />
  if (options.isError) {
    const error = options.error
    if (error instanceof ApiError && error.status === 403) {
      return (
        <EmptyState
          title="접근 권한이 없습니다"
          hint="워크스페이스 전체 Worklogs는 관리자만 볼 수 있습니다."
        />
      )
    }
    return (
      <ErrorState
        error={error}
        onRetry={() => options.refetch()}
      />
    )
  }
  if (needsCanonicalDates || needsCanonicalFilters || needsCanonicalOffset) {
    return <ListSkeleton />
  }
  if (worklogs.isPending) return <ListSkeleton />
  if (worklogs.isError) {
    if (worklogs.error instanceof ApiError && worklogs.error.status === 403) {
      return (
        <EmptyState
          title="접근 권한이 없습니다"
          hint="워크스페이스 전체 Worklogs는 관리자만 볼 수 있습니다."
        />
      )
    }
    return <ErrorState error={worklogs.error} onRetry={() => worklogs.refetch()} />
  }

  const data = worklogs.data
  const selectedUser =
    userId === 'deleted'
      ? '삭제된 사용자'
      : options.data.users.find((item) => item.id === userId)?.display_name
  const selectedProject = options.data.projects.find((item) => item.id === projectId)?.name

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="Worklogs"
      description="구성원 전체의 시간 기록을 프로젝트와 기간 기준으로 조회하고 운영 자료로 내려받습니다."
      meta={`${data.total}건 · ${hours(data.total_hours)}h`}
      actions={
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true)
            setDownloadError(null)
            try {
              const result = await downloadAdminWorklogs(filters)
              saveBlob(result.blob, result.filename)
            } catch (downloadFailure) {
              setDownloadError(downloadFailure)
            } finally {
              setDownloading(false)
            }
          }}
        >
          {downloading ? <LoaderCircle className="animate-spin" /> : <Download />} CSV
        </Button>
      }
    >
      <SettingsSection
        title="조회 범위"
        description="비활성 사용자와 아카이브 프로젝트의 기록도 감사 이력으로 유지됩니다."
      >
        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_10rem_10rem_auto] xl:items-end"
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
              onChange={(event) => setParams({ user: event.target.value || null, offset: null })}
              className="mt-1 min-h-11"
            >
              <option value="">전체 사용자</option>
              <option value="deleted">삭제된 사용자</option>
              {options.data.users.map((item) => (
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
              onChange={(event) => setParams({ project: event.target.value || null, offset: null })}
              className="mt-1 min-h-11"
            >
              <option value="">전체 프로젝트</option>
              {options.data.projects.map((item) => (
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
              className="mt-1 min-h-11"
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
              className="mt-1 min-h-11"
              required
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" className="min-h-11" disabled={Boolean(draftRangeError)}>
              적용
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="min-h-11 min-w-11"
              aria-label="Worklogs 새로고침"
              onClick={() => {
                void worklogs.refetch()
                void options.refetch()
              }}
            >
              <RefreshCw className={worklogs.isFetching ? 'animate-spin' : undefined} />
            </Button>
          </div>
        </form>
        {selectedUser || selectedProject ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-of-muted">
            {selectedUser ? <Badge variant="outline">사용자: {selectedUser}</Badge> : null}
            {selectedProject ? <Badge variant="outline">프로젝트: {selectedProject}</Badge> : null}
          </div>
        ) : null}
        {draftRangeError ? (
          <p role="alert" className="mt-3 text-xs text-of-danger">{draftRangeError}</p>
        ) : null}
        {downloadError ? (
          <p role="alert" className="mt-3 text-xs text-of-danger">
            CSV를 내려받지 못했습니다. 조회 범위를 줄이거나 다시 시도해 주세요.
          </p>
        ) : null}
      </SettingsSection>

      <section aria-label="Worklogs 요약" className="grid grid-cols-2 border border-of-border bg-of-surface sm:grid-cols-4">
        <Summary label="기록" value={`${data.total}건`} />
        <Summary label="합계" value={`${hours(data.total_hours)}h`} />
        <Summary label="시작" value={data.from_date} />
        <Summary label="종료" value={data.to_date} />
      </section>

      {data.total === 0 ? (
        <EmptyState
          title="조회 범위에 Worklog가 없습니다"
          hint="사용자, 프로젝트 또는 기간을 바꿔 다시 조회해 보세요."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto border border-of-border bg-of-surface md:block">
            <table className="w-full min-w-[52rem] text-xs">
              <thead>
                <tr className="border-b border-of-border text-left text-[11px] text-of-muted">
                  <th className="px-3 py-2 font-medium">날짜</th>
                  <th className="px-3 py-2 font-medium">사용자</th>
                  <th className="px-3 py-2 font-medium">프로젝트 / 작업</th>
                  <th className="px-3 py-2 font-medium">메모</th>
                  <th className="px-3 py-2 text-right font-medium">시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-of-border">
                {data.items.map((item) => <WorklogTableRow key={item.id} item={item} />)}
              </tbody>
            </table>
          </div>
          <ul aria-label="모바일 Worklogs 목록" className="grid gap-2 md:hidden">
            {data.items.map((item) => <WorklogCard key={item.id} item={item} />)}
          </ul>
        </>
      )}

      {offset > 0 || offset + data.items.length < data.total ? (
        <nav aria-label="Worklogs 페이지" className="flex items-center justify-between gap-3">
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
    </SettingsFrame>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-of-border px-3 py-3 last:border-r-0 sm:border-b-0">
      <p className="text-[11px] text-of-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</p>
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
