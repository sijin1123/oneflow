import {
  Archive,
  Blocks,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Copy,
  Eye,
  FileStack,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from "@/components/shell/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

import {
  type ProjectTemplate,
  useApplyProjectTemplate,
  useArchiveProjectTemplate,
  useCreateProjectTemplate,
  useDeleteProjectTemplate,
  useProjectTemplates,
  useProjectTemplateSources,
  useRefreshProjectTemplate,
} from "./api";

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="mt-2 text-xs text-of-danger" role="alert">
      {error instanceof Error ? error.message : "요청을 완료하지 못했습니다."}
    </p>
  );
}

function SnapshotStats({
  template,
  compact = false,
}: {
  template: ProjectTemplate;
  compact?: boolean;
}) {
  const revision = template.latest_revision;
  const stats = [
    { label: "상태", value: revision?.statuses ?? 0 },
    { label: "작업 유형", value: revision?.types ?? 0 },
    { label: "사용자 필드", value: revision?.custom_fields ?? 0 },
    { label: "자동화", value: revision?.automation_rules ?? 0 },
  ];
  return (
    <dl
      className={`grid grid-cols-4 divide-x divide-of-border-subtle ${compact ? "border-t border-of-border-subtle pt-3" : "border-y border-of-border-subtle py-3"}`}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 px-2 first:pl-0 last:pr-0">
          <dt className="truncate text-[10px] text-of-muted">{stat.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-of-text">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CreateTemplateForm({ onClose }: { onClose: () => void }) {
  const sources = useProjectTemplateSources();
  const create = useCreateProjectTemplate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [publish, setPublish] = useState(true);
  const activeProjects = sources.data?.items ?? [];
  const canSubmit = Boolean(
    name.trim() && sourceProjectId && !create.isPending,
  );

  return (
    <form
      className="border-y border-of-border bg-of-surface-2 px-3 py-4 sm:px-4"
      aria-label="새 템플릿 생성"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        create.mutate(
          {
            name: name.trim(),
            description: description.trim() || null,
            source_project_id: sourceProjectId,
            publish,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            프로젝트 구성으로 템플릿 만들기
          </h2>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            상태, 작업 유형, 사용자 필드와 자동화 규칙을 버전 스냅샷으로
            저장합니다.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="생성 닫기"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-of-muted">
          템플릿 이름
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 min-h-10"
            maxLength={120}
            required
          />
        </label>
        <label className="text-xs font-medium text-of-muted">
          원본 프로젝트
          <Select
            value={sourceProjectId}
            onChange={(event) => setSourceProjectId(event.target.value)}
            className="mt-1 min-h-10"
            required
          >
            <option value="">프로젝트 선택</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.key})
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium text-of-muted">
        설명
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1 min-h-20"
          maxLength={20000}
          placeholder="팀이 이 템플릿을 언제 사용해야 하는지 적으세요."
        />
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Checkbox
          checked={publish}
          onChange={(event) => setPublish(event.target.checked)}
          label="만든 후 바로 게시"
          aria-label="만든 후 바로 게시"
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {create.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Plus />
            )}{" "}
            만들기
          </Button>
        </div>
      </div>
      {activeProjects.length === 0 && !sources.isPending ? (
        <p className="mt-2 text-xs text-of-danger">
          소유한 활성 프로젝트가 있어야 템플릿을 만들 수 있습니다.
        </p>
      ) : null}
      <ErrorText error={create.error} />
    </form>
  );
}

function ApplyForm({
  template,
  onClose,
}: {
  template: ProjectTemplate;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const apply = useApplyProjectTemplate(template.id);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const keyValid = KEY_RE.test(key);
  const canSubmit = Boolean(name.trim() && keyValid && !apply.isPending);

  return (
    <form
      className="mt-4 border-t border-of-border pt-4"
      aria-label={`${template.name} 적용`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        apply.mutate(
          { name: name.trim(), key, description: description.trim() || null },
          {
            onSuccess: (project) =>
              navigate(`/projects/${project.id}/work-packages`),
          },
        );
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">새 프로젝트로 적용</h3>
          <p className="mt-1 text-xs text-of-muted">
            현재 게시 버전의 구성을 새 프로젝트에 복제합니다.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="적용 닫기"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <label className="text-xs font-medium text-of-muted">
          새 프로젝트 이름
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 min-h-10"
            maxLength={120}
            required
          />
        </label>
        <label className="text-xs font-medium text-of-muted">
          키
          <Input
            value={key}
            onChange={(event) => setKey(event.target.value.toUpperCase())}
            className="mt-1 min-h-10 font-mono"
            aria-invalid={Boolean(key && !keyValid)}
            aria-describedby={`template-${template.id}-key-help`}
            placeholder="ONE"
            maxLength={10}
            required
          />
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium text-of-muted">
        설명
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1 min-h-10"
        />
      </label>
      <p
        id={`template-${template.id}-key-help`}
        className={`mt-2 text-xs ${key && !keyValid ? "text-of-danger" : "text-of-muted"}`}
      >
        키는 대문자로 시작하는 2-10자여야 합니다.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {apply.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Copy />
          )}{" "}
          프로젝트 만들기
        </Button>
      </div>
      <ErrorText error={apply.error} />
    </form>
  );
}

function DeleteTemplateDialog({
  template,
  onClose,
  onDeleted,
}: {
  template: ProjectTemplate;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const remove = useDeleteProjectTemplate(template.id);

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-of-overlay backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          data-template-delete-dialog
          aria-label={`${template.name} 삭제 확인`}
          className="fixed left-1/2 top-1/2 z-[70] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface p-4 text-of-text shadow-[var(--of-shadow-popover)] outline-none"
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {template.name} 삭제 확인
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div>
              <p className="text-sm font-semibold">
                게시 해제된 템플릿을 삭제할까요?
              </p>
              <p className="mt-1 text-xs leading-5 text-of-muted">
                스냅샷과 버전 기록이 함께 삭제되며 되돌릴 수 없습니다.
              </p>
            </div>
          </DialogPrimitive.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              onClick={onClose}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: onDeleted })}
            >
              {remove.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Trash2 />
              )}{" "}
              삭제
            </Button>
          </div>
          <ErrorText error={remove.error} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TemplateCard({
  template,
  onOpen,
}: {
  template: ProjectTemplate;
  onOpen: () => void;
}) {
  const revision = template.latest_revision;
  const updated = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
  }).format(new Date(template.updated_at));

  return (
    <li className="min-w-0">
      <button
        type="button"
        className="group flex min-h-[14rem] w-full flex-col rounded-of border border-of-border bg-of-surface p-4 text-left shadow-[var(--of-shadow-xs)] transition-[border-color,box-shadow,transform] duration-[var(--of-duration-fast)] hover:-translate-y-px hover:border-of-border-strong hover:shadow-[var(--of-shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        onClick={onOpen}
        aria-label={`${template.name} 상세 보기`}
      >
        <div className="flex w-full items-start justify-between gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-accent">
            <FileStack size={18} />
          </span>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge variant={template.archived_at ? "outline" : "success"}>
              {template.archived_at ? <LockKeyhole /> : <CircleCheck />}
              {template.archived_at ? "게시 해제" : "게시 중"}
            </Badge>
            <Badge variant="neutral">v{revision?.version ?? 0}</Badge>
          </div>
        </div>
        <h2 className="mt-4 line-clamp-2 text-sm font-semibold text-of-text">
          {template.name}
        </h2>
        <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-of-muted">
          {template.description || "설명이 없습니다."}
        </p>
        <div className="mt-4 w-full">
          <SnapshotStats template={template} compact />
        </div>
        <div className="mt-auto flex w-full items-end justify-between gap-3 pt-4 text-[11px] text-of-muted">
          <span className="min-w-0 truncate">
            {template.source_project_name || "원본 프로젝트 없음"}
          </span>
          <span className="shrink-0">{updated}</span>
        </div>
        <span className="mt-3 inline-flex items-center gap-1 self-end text-xs font-medium text-of-accent">
          구성 보기 <Eye size={13} />
        </span>
      </button>
    </li>
  );
}

function TemplatePreview({
  template,
  onClose,
  onDeleteDialogChange,
}: {
  template: ProjectTemplate;
  onClose: () => void;
  onDeleteDialogChange: (open: boolean) => void;
}) {
  const [applying, setApplying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const refresh = useRefreshProjectTemplate(template.id);
  const archive = useArchiveProjectTemplate(template.id, true);
  const restore = useArchiveProjectTemplate(template.id, false);
  const archiveAction = template.archived_at ? restore : archive;
  const revision = template.latest_revision;
  const snapshotCount = revision
    ? revision.statuses +
      revision.types +
      revision.custom_fields +
      revision.automation_rules
    : 0;
  const updated = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(template.updated_at));

  return (
    <>
      <div className="flex min-h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-of-border-subtle pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={template.archived_at ? "outline" : "success"}>
                {template.archived_at ? "게시 해제" : "게시 중"}
              </Badge>
              <Badge variant="neutral">버전 {revision?.version ?? 0}</Badge>
            </div>
            <h2 className="mt-3 break-words text-lg font-semibold">
              {template.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-of-muted">
              {template.description || "설명이 없습니다."}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-accent">
            <Sparkles size={18} />
          </span>
        </div>

        <section aria-labelledby="template-snapshot-heading" className="py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3
                id="template-snapshot-heading"
                className="text-sm font-semibold"
              >
                포함된 구성
              </h3>
              <p className="mt-1 text-xs text-of-muted">
                총 {snapshotCount}개 설정 항목이 스냅샷에 포함됩니다.
              </p>
            </div>
            <Blocks className="text-of-muted" size={17} />
          </div>
          <SnapshotStats template={template} />
        </section>

        <dl className="grid gap-3 border-b border-of-border-subtle pb-4 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-of-muted">원본 프로젝트</dt>
            <dd className="mt-1 font-medium">
              {template.source_project_name || "삭제되었거나 연결되지 않음"}
            </dd>
          </div>
          <div>
            <dt className="text-of-muted">게시자</dt>
            <dd className="mt-1 font-medium">
              {template.creator_name || "알 수 없음"}
            </dd>
          </div>
          <div>
            <dt className="text-of-muted">마지막 업데이트</dt>
            <dd className="mt-1 font-medium">{updated}</dd>
          </div>
          <div>
            <dt className="text-of-muted">사용 가능 범위</dt>
            <dd className="mt-1 font-medium">
              {template.archived_at ? "관리자에게만 표시" : "워크스페이스 전체"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {!template.archived_at ? (
            <Button type="button" onClick={() => setApplying(true)}>
              <Copy /> 프로젝트에 적용
            </Button>
          ) : null}
          {template.can_manage &&
          !template.archived_at &&
          template.source_project_id ? (
            <Button
              type="button"
              variant="outline"
              disabled={refresh.isPending}
              onClick={() =>
                refresh.mutate({
                  source_project_id: template.source_project_id!,
                })
              }
            >
              <RefreshCw
                className={refresh.isPending ? "animate-spin" : undefined}
              />{" "}
              스냅샷 갱신
            </Button>
          ) : null}
          {template.can_manage ? (
            <Button
              type="button"
              variant="outline"
              disabled={archiveAction.isPending}
              onClick={() =>
                archiveAction.mutate(undefined, {
                  onSuccess: () => {
                    if (!template.archived_at) onClose();
                  },
                })
              }
            >
              {archiveAction.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : template.archived_at ? (
                <CircleCheck />
              ) : (
                <Archive />
              )}
              {template.archived_at ? "다시 게시" : "게시 해제"}
            </Button>
          ) : null}
          {template.can_manage && template.archived_at ? (
            <Button
              type="button"
              variant="subtleDanger"
              onClick={() => {
                setConfirmingDelete(true);
                onDeleteDialogChange(true);
              }}
            >
              <Trash2 /> 삭제
            </Button>
          ) : null}
        </div>
        <ErrorText error={refresh.error || archive.error || restore.error} />
        {applying ? (
          <ApplyForm template={template} onClose={() => setApplying(false)} />
        ) : null}
        {template.archived_at ? (
          <p className="mt-4 flex items-start gap-2 border-t border-of-border pt-4 text-xs leading-5 text-of-muted">
            <LockKeyhole className="mt-0.5 shrink-0" size={14} />
            게시 해제 상태에서는 새 프로젝트에 적용할 수 없습니다. 다시 게시하면
            워크스페이스 구성원이 사용할 수 있습니다.
          </p>
        ) : null}
      </div>
      {confirmingDelete ? (
        <DeleteTemplateDialog
          template={template}
          onClose={() => {
            setConfirmingDelete(false);
            onDeleteDialogChange(false);
          }}
          onDeleted={() => {
            onDeleteDialogChange(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

export function TemplatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const query = searchParams.get("q") ?? "";
  const includeArchived = searchParams.get("include_archived") === "true";
  const rawOffset = searchParams.get("offset");
  const parsedOffset = Number(rawOffset ?? 0);
  const offset =
    Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const [searchDraft, setSearchDraft] = useState(query);
  const templates = useProjectTemplates(query, includeArchived, offset);
  const total = templates.data?.total;
  const normalizedOffset =
    total === undefined
      ? undefined
      : total === 0
        ? 0
        : offset < total
          ? offset
          : Math.floor((total - 1) / 50) * 50;
  const canonicalOffset =
    normalizedOffset === undefined || normalizedOffset === 0
      ? null
      : String(normalizedOffset);
  const offsetNeedsNormalization =
    total !== undefined && (rawOffset || null) !== canonicalOffset;
  const selected =
    templates.data?.items.find((template) => template.id === selectedId) ??
    null;

  useEffect(() => setSearchDraft(query), [query]);
  useEffect(() => {
    if (!offsetNeedsNormalization) return;
    const next = new URLSearchParams(searchParams);
    if (canonicalOffset) next.set("offset", canonicalOffset);
    else next.delete("offset");
    setSearchParams(next, { replace: true });
  }, [
    canonicalOffset,
    offsetNeedsNormalization,
    searchParams,
    setSearchParams,
  ]);

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  if (templates.isPending) return <ListSkeleton />;
  if (templates.isError)
    return (
      <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
    );
  if (offsetNeedsNormalization) return <ListSkeleton />;

  const publishedOnPage = templates.data.items.filter(
    (template) => !template.archived_at,
  ).length;
  const unpublishedOnPage = templates.data.items.length - publishedOnPage;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-of-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold">프로젝트 템플릿</h1>
            <Badge variant="neutral">{templates.data.total}개</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            검증된 프로젝트 구성을 게시하고 새 프로젝트의 시작점으로 사용합니다.
          </p>
        </div>
        <Button type="button" onClick={() => setCreating((value) => !value)}>
          {creating ? <X /> : <Plus />} {creating ? "닫기" : "새 템플릿"}
        </Button>
      </header>

      {creating ? (
        <CreateTemplateForm onClose={() => setCreating(false)} />
      ) : null}

      <section
        aria-label="템플릿 보기 제어"
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-of-muted"
          />
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter")
                setParams({
                  q: event.currentTarget.value.trim() || null,
                  offset: null,
                });
            }}
            placeholder="이름으로 템플릿 검색"
            aria-label="템플릿 검색어"
            className="min-h-9 pl-9 pr-9"
          />
          {searchDraft ? (
            <button
              type="button"
              aria-label="검색어 지우기"
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text"
              onClick={() => {
                setSearchDraft("");
                setParams({ q: null, offset: null });
              }}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
        <Checkbox
          checked={includeArchived}
          onChange={(event) =>
            setParams({
              include_archived: event.target.checked ? "true" : null,
              offset: null,
            })
          }
          label="게시 해제 포함"
          aria-label="게시 해제 포함"
          className="min-h-9 rounded-of border border-of-border px-3"
        />
        <Button
          type="button"
          variant="outline"
          aria-label="템플릿 새로고침"
          onClick={() => templates.refetch()}
        >
          <RefreshCw
            className={templates.isFetching ? "animate-spin" : undefined}
          />{" "}
          새로고침
        </Button>
      </section>

      {templates.data.items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-of-muted">
          <span className="inline-flex items-center gap-1">
            <CircleCheck size={13} className="text-of-success" /> 게시 중{" "}
            {publishedOnPage}
          </span>
          {includeArchived ? (
            <span className="inline-flex items-center gap-1">
              <LockKeyhole size={13} /> 게시 해제 {unpublishedOnPage}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1">
            <Settings2 size={13} /> 카드를 선택해 구성과 관리 작업을 확인하세요.
          </span>
        </div>
      ) : null}

      {templates.data.total === 0 ? (
        <EmptyState
          title={
            query
              ? "조건에 맞는 템플릿이 없습니다"
              : "아직 프로젝트 템플릿이 없습니다"
          }
          hint="소유한 활성 프로젝트의 구성을 템플릿으로 게시할 수 있습니다."
        >
          {query ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setParams({ q: null })}
            >
              검색 지우기
            </Button>
          ) : (
            <Button type="button" onClick={() => setCreating(true)}>
              <Plus /> 새 템플릿
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul
          aria-label="프로젝트 템플릿 목록"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {templates.data.items.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onOpen={() => setSelectedId(template.id)}
            />
          ))}
        </ul>
      )}

      {offset > 0 ||
      offset + templates.data.items.length < templates.data.total ? (
        <nav
          aria-label="템플릿 페이지"
          className="flex items-center justify-between gap-3 border-t border-of-border pt-3"
        >
          <span className="text-xs tabular-nums text-of-muted">
            {offset + 1}-
            {Math.min(
              offset + templates.data.items.length,
              templates.data.total,
            )}{" "}
            / {templates.data.total}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="이전 페이지"
              disabled={offset === 0}
              onClick={() =>
                setParams({ offset: offset > 50 ? String(offset - 50) : null })
              }
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="다음 페이지"
              disabled={
                offset + templates.data.items.length >= templates.data.total
              }
              onClick={() => setParams({ offset: String(offset + 50) })}
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !deleteDialogOpen) setSelectedId(null);
        }}
      >
        {selected ? (
          <SheetContent title="템플릿 상세" className="max-w-2xl">
            <TemplatePreview
              template={selected}
              onClose={() => {
                setDeleteDialogOpen(false);
                setSelectedId(null);
              }}
              onDeleteDialogChange={setDeleteDialogOpen}
            />
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  );
}
