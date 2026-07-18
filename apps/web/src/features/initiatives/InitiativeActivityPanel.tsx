import {
  Activity,
  CalendarDays,
  ChevronDown,
  CircleDot,
  FolderKanban,
  HeartPulse,
  History,
  Link2,
  ListChecks,
  Loader2,
  RefreshCw,
  Tags,
  UserRoundCog,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/datetime'

import {
  type InitiativeActivity,
  type InitiativeActivityKind,
  useInitiativeActivities,
} from './api'

const EVENT_META: Record<
  InitiativeActivityKind,
  { label: string; icon: typeof Activity }
> = {
  initiative_created: { label: '이니셔티브를 만들었습니다.', icon: CircleDot },
  properties_updated: { label: '기본 정보를 수정했습니다.', icon: CalendarDays },
  lifecycle_updated: { label: '수명주기 상태를 변경했습니다.', icon: Activity },
  health_updated: { label: '상태 보고를 갱신했습니다.', icon: HeartPulse },
  owner_transferred: { label: '소유권을 이전했습니다.', icon: UserRoundCog },
  owner_claimed: { label: '비어 있는 소유권을 인계받았습니다.', icon: UserRoundCog },
  labels_updated: { label: '전략 라벨을 변경했습니다.', icon: Tags },
  project_connected: { label: '프로젝트 범위를 추가했습니다.', icon: FolderKanban },
  project_disconnected: { label: '프로젝트 범위를 제거했습니다.', icon: FolderKanban },
  work_item_connected: { label: '전략 작업을 연결했습니다.', icon: Link2 },
  work_item_disconnected: { label: '전략 작업 연결을 해제했습니다.', icon: ListChecks },
}

const FIELD_LABELS: Record<string, string> = {
  name: '이름',
  description: '설명',
  state: '상태',
  start_date: '시작일',
  target_date: '목표일',
  health: '헬스',
  health_note: '상태 사유',
  owner: '소유자',
  labels: '라벨',
  projects: '프로젝트',
  work_items: '작업 범위',
}

function ActivityRow({ item }: { item: InitiativeActivity }) {
  const meta = EVENT_META[item.kind]
  const Icon = meta.icon
  return (
    <li className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-2.5 py-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-of-border-subtle bg-of-surface-2 text-of-muted">
        <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="break-words text-xs leading-5 text-of-text">
          <span className="font-medium">{item.actor_name ?? '이전 구성원'}</span>{' '}
          <span className="text-of-muted">{meta.label}</span>
        </p>
        {item.changed_fields.length > 0 ? (
          <div className="mt-1 flex min-w-0 flex-wrap gap-1" aria-label="변경 필드">
            {item.changed_fields.map((field) => (
              <span
                key={field}
                className="rounded-of border border-of-border-subtle bg-of-surface px-1.5 py-0.5 text-[10px] text-of-muted"
              >
                {FIELD_LABELS[field] ?? field}
              </span>
            ))}
          </div>
        ) : null}
        <time
          dateTime={item.created_at}
          className="mt-1 block text-[10px] tabular-nums text-of-muted"
        >
          {formatDateTime(item.created_at)}
        </time>
      </div>
    </li>
  )
}

function ActivitySkeleton() {
  return (
    <div role="status" aria-label="이니셔티브 활동 불러오는 중" className="space-y-3 py-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="grid animate-pulse grid-cols-[28px_minmax(0,1fr)] gap-2.5">
          <span className="h-7 w-7 rounded-full bg-of-surface-hover" />
          <span className="mt-1 block h-4 w-3/4 rounded bg-of-surface-hover" />
        </div>
      ))}
    </div>
  )
}

export function InitiativeActivityPanel({ initiativeId }: { initiativeId: string }) {
  const activity = useInitiativeActivities(initiativeId)
  const items = activity.data?.pages.flatMap((page) => page.items) ?? []
  const total = activity.data?.pages[0]?.total ?? 0

  return (
    <section className="pt-4" aria-labelledby="initiative-activity-heading">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="initiative-activity-heading" className="flex items-center gap-1.5 text-sm font-semibold">
            <History size={14} aria-hidden="true" /> 활동
          </h3>
          <p className="mt-0.5 text-[11px] text-of-muted">
            이니셔티브의 실제 변경만 시간순으로 기록합니다.
          </p>
        </div>
        {!activity.isPending && !activity.isError ? (
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted">{total}건</span>
        ) : null}
      </div>

      {activity.isPending ? <ActivitySkeleton /> : null}

      {activity.isError && items.length === 0 ? (
        <div
          role="alert"
          className="mt-3 flex min-h-24 flex-col items-center justify-center gap-2 border-y border-of-border-subtle px-4 py-5 text-center"
        >
          <p className="text-xs text-of-danger">활동을 불러오지 못했습니다.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void activity.refetch()}>
            <RefreshCw size={13} /> 재시도
          </Button>
        </div>
      ) : null}

      {!activity.isError && !activity.isPending && items.length === 0 ? (
        <div className="mt-3 border-y border-of-border-subtle py-7 text-center">
          <History size={18} className="mx-auto text-of-muted" aria-hidden="true" />
          <p className="mt-2 text-xs font-medium">아직 기록된 활동이 없습니다</p>
          <p className="mt-1 text-[11px] text-of-muted">
            이력 기능 도입 전 변경은 현재 속성으로만 확인할 수 있습니다.
          </p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ol className="mt-3 divide-y divide-of-border-subtle border-y border-of-border-subtle">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ol>
      ) : null}

      {activity.isFetchNextPageError ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <span className="text-[11px] text-of-danger">다음 활동을 불러오지 못했습니다.</span>
          <Button size="sm" variant="outline" onClick={() => void activity.fetchNextPage()}>
            <RefreshCw size={13} /> 재시도
          </Button>
        </div>
      ) : null}

      {activity.hasNextPage && !activity.isFetchNextPageError ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 w-full"
          disabled={activity.isFetchingNextPage}
          onClick={() => void activity.fetchNextPage()}
        >
          {activity.isFetchingNextPage ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ChevronDown />
          )}
          활동 더 보기
        </Button>
      ) : null}
    </section>
  )
}
