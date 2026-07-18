import {
  Archive,
  ChevronDown,
  FilePlus2,
  History,
  Loader2,
  PencilLine,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";

import {
  type DocumentActivity,
  type DocumentActivityKind,
  useDocumentActivities,
} from "./api";

const EVENT_META: Record<
  DocumentActivityKind,
  { label: string; icon: typeof History }
> = {
  document_created: { label: "문서를 만들었습니다.", icon: FilePlus2 },
  document_updated: { label: "문서 정보를 수정했습니다.", icon: PencilLine },
  document_archived: { label: "문서를 보관했습니다.", icon: Archive },
  document_restored: { label: "문서를 복원했습니다.", icon: RotateCcw },
};

const FIELD_LABELS: Record<string, string> = {
  title: "제목",
  body: "본문",
  parent: "상위 페이지",
  visibility: "공개 범위",
  archive_state: "보관 상태",
};

function ActivityRow({ item }: { item: DocumentActivity }) {
  const meta = EVENT_META[item.kind];
  const Icon = meta.icon;

  return (
    <li className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-2.5 py-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-of-border-subtle bg-of-surface-2 text-of-muted">
        <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="break-words text-xs leading-5 text-of-text">
          <span className="font-medium">
            {item.actor_name ?? "이전 구성원"}
          </span>{" "}
          <span className="text-of-muted">{meta.label}</span>
        </p>
        {item.changed_fields.length > 0 ? (
          <div
            className="mt-1 flex min-w-0 flex-wrap gap-1"
            aria-label="변경 필드"
          >
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
  );
}

function ActivitySkeleton() {
  return (
    <div
      role="status"
      aria-label="문서 활동 불러오는 중"
      className="space-y-3 py-3"
    >
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="grid animate-pulse grid-cols-[28px_minmax(0,1fr)] gap-2.5"
        >
          <span className="h-7 w-7 rounded-full bg-of-surface-hover" />
          <span className="mt-1 block h-4 w-3/4 rounded bg-of-surface-hover" />
        </div>
      ))}
    </div>
  );
}

export function DocumentActivityPanel({ docId }: { docId: string }) {
  const activity = useDocumentActivities(docId);
  const items = activity.data?.pages.flatMap((page) => page.items) ?? [];
  const total = activity.data?.pages[0]?.total ?? 0;

  return (
    <section
      className="border-t border-of-border pb-16 pt-4 lg:pb-0"
      aria-labelledby="document-activity-heading"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="document-activity-heading"
            className="flex items-center gap-1.5 text-sm font-semibold"
          >
            <History size={15} className="text-of-muted" aria-hidden="true" />{" "}
            활동
          </h2>
          <p className="mt-0.5 text-[11px] text-of-muted">
            문서의 실제 변경만 최신순으로 기록합니다.
          </p>
        </div>
        {!activity.isPending && !activity.isError ? (
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted">
            {total}건
          </span>
        ) : null}
      </div>

      {activity.isPending ? <ActivitySkeleton /> : null}

      {activity.isError && items.length === 0 ? (
        <div
          role="alert"
          className="mt-3 flex min-h-24 flex-col items-center justify-center gap-2 border-y border-of-border-subtle px-4 py-5 text-center"
        >
          <p className="text-xs text-of-danger">활동을 불러오지 못했습니다.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void activity.refetch()}
          >
            <RefreshCw size={13} /> 재시도
          </Button>
        </div>
      ) : null}

      {!activity.isError && !activity.isPending && items.length === 0 ? (
        <div className="mt-3 border-y border-of-border-subtle py-7 text-center">
          <History
            size={18}
            className="mx-auto text-of-muted"
            aria-hidden="true"
          />
          <p className="mt-2 text-xs font-medium">
            아직 기록된 활동이 없습니다
          </p>
          <p className="mt-1 text-[11px] text-of-muted">
            이력 기능 도입 전 변경은 현재 문서 내용으로만 확인할 수 있습니다.
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
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center justify-end gap-2"
        >
          <span className="text-[11px] text-of-danger">
            다음 활동을 불러오지 못했습니다.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void activity.fetchNextPage()}
          >
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
  );
}
