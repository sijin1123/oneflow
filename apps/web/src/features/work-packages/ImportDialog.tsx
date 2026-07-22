import { Check, Lightbulb, Upload, UserRound } from 'lucide-react'
import type * as React from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { InlineAlert } from '@/components/ui/surface'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'

import { useImportCsv } from './csv'
import type { ImportSource } from './csv'
import type { CsvImportResult } from './types'

const SAMPLE = 'subject,type,status,priority,start_date,due_date,estimated_hours'
const JIRA_SAMPLE = 'Issue key,Summary,Issue Type,Status,Priority,Due date,Assignee'
const LINEAR_SAMPLE = 'ID,Title,Status,Priority,Due Date,Assignee'
const PENDING_MAPPING = '__pending__'
const UNASSIGNED = '__unassigned__'

export function ImportDialog({
  projectId,
  open,
  onOpenChange: onControlledOpenChange,
  trigger,
}: {
  projectId: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>('oneflow')
  const [content, setContent] = useState('')
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [assigneeMappings, setAssigneeMappings] = useState<Record<string, string | null>>({})
  const importCsv = useImportCsv(projectId)
  const actualOpen = open ?? internalOpen
  const setOpen = onControlledOpenChange ?? setInternalOpen

  const reset = () => {
    setSource('oneflow')
    setContent('')
    setResult(null)
    setAssigneeMappings({})
    importCsv.reset()
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const run = (dry_run: boolean) => {
    importCsv.mutate(
      {
        content,
        dry_run,
        source,
        ...(dry_run || !result
          ? {}
          : {
              preview_checksum: result.preview_checksum,
              assignee_mappings: result.assignee_identities.map((identity) => ({
                source_value: identity.source_value,
                user_id: assigneeMappings[identity.source_value] ?? null,
              })),
            }),
      },
      {
        onSuccess: (nextResult) => {
          setResult(nextResult)
          if (nextResult.dry_run) setAssigneeMappings({})
        },
      },
    )
  }

  // Safe flow: a dry-run preview must succeed before the commit button unlocks.
  const previewed = result !== null && result.dry_run
  const committed = result !== null && !result.dry_run
  const mappingComplete =
    !previewed ||
    result.assignee_identities.every((identity) =>
      Object.prototype.hasOwnProperty.call(assigneeMappings, identity.source_value),
    )
  const err = importCsv.error instanceof ApiError ? importCsv.error.message : null

  return (
    <Sheet open={actualOpen} onOpenChange={onOpenChange}>
      {trigger === false ? null : (
        <SheetTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="sm">
              <Upload size={14} /> 가져오기
            </Button>
          )}
        </SheetTrigger>
      )}
      <SheetContent title="CSV 가져오기">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="import-source" className="text-xs font-medium text-of-muted">
              가져오기 소스
            </label>
            <Select
              id="import-source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value as ImportSource)
                setResult(null) // a preview from one adapter must not unlock the other
                setAssigneeMappings({})
              }}
            >
              <option value="oneflow">OneFlow CSV</option>
              <option value="jira">Jira CSV</option>
              <option value="linear">Linear CSV</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="csv-content" className="text-xs font-medium text-of-muted">
              CSV 붙여넣기
            </label>
            {source === 'oneflow' ? (
              <p className="text-xs text-of-muted">
                첫 줄은 헤더입니다. <code className="rounded bg-of-surface-2 px-1">subject</code>{' '}
                열은 필수이며, 인식하는 열:{' '}
                <code className="rounded bg-of-surface-2 px-1">{SAMPLE}</code>
              </p>
            ) : source === 'jira' ? (
              <p className="text-xs text-of-muted">
                Jira에서 내보낸 CSV를 붙여넣으세요.{' '}
                <code className="rounded bg-of-surface-2 px-1">Summary</code> 열은 필수이며, 인식하는
                열: <code className="rounded bg-of-surface-2 px-1">{JIRA_SAMPLE}</code>. 나머지 열은
                무시되고 결과에 표시됩니다.
              </p>
            ) : (
              <p className="text-xs text-of-muted">
                Linear에서 내보낸 CSV를 붙여넣으세요.{' '}
                <code className="rounded bg-of-surface-2 px-1">Title</code> 열은 필수이며, 인식하는
                열: <code className="rounded bg-of-surface-2 px-1">{LINEAR_SAMPLE}</code>. Estimate는
                포인트 단위라 시간으로 넣지 않습니다.
              </p>
            )}
            <Textarea
              id="csv-content"
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setResult(null) // editing invalidates a prior preview
                setAssigneeMappings({})
              }}
              rows={8}
              className="font-mono text-xs"
              placeholder={
                source === 'oneflow'
                  ? `${SAMPLE}\n로그인 버그 수정,bug,todo,high,,,4`
                  : source === 'jira'
                    ? `${JIRA_SAMPLE}\nPROJ-1,로그인 버그,Bug,In Progress,High,1/Jul/26`
                    : `${LINEAR_SAMPLE}\nABC-1,로그인 버그,In Progress,Urgent,2026-07-10`
              }
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!content.trim() || importCsv.isPending}
              onClick={() => run(true)}
            >
              미리보기 (dry-run)
            </Button>
            <Button
              size="sm"
              disabled={!previewed || result.valid === 0 || !mappingComplete || importCsv.isPending}
              onClick={() => run(false)}
            >
              가져오기 실행{previewed ? ` (${result.valid}건)` : ''}
            </Button>
            {importCsv.isPending ? <span className="text-xs text-of-muted">처리 중…</span> : null}
          </div>

          {err ? <p className="text-xs text-of-danger">{err}</p> : null}

          {previewed && result.assignee_identities.length > 0 ? (
            <AssigneeMappingPanel
              result={result}
              mappings={assigneeMappings}
              onChange={(sourceValue, userId) =>
                setAssigneeMappings((current) => ({ ...current, [sourceValue]: userId }))
              }
            />
          ) : null}

          {result ? <ImportSummary result={result} committed={committed} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AssigneeMappingPanel({
  result,
  mappings,
  onChange,
}: {
  result: CsvImportResult
  mappings: Record<string, string | null>
  onChange: (sourceValue: string, userId: string | null) => void
}) {
  const decided = result.assignee_identities.filter((identity) =>
    Object.prototype.hasOwnProperty.call(mappings, identity.source_value),
  ).length

  return (
    <section
      aria-labelledby="assignee-mapping-title"
      className="space-y-3 rounded-of border border-of-border bg-of-surface-2 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="assignee-mapping-title" className="flex items-center gap-1.5 text-sm font-semibold">
            <UserRound size={14} aria-hidden />
            담당자 계정 매핑
          </h3>
          <p className="mt-0.5 text-xs text-of-muted">
            원본 값을 현재 프로젝트의 활성 소유자·멤버에 연결하거나 미배정으로 결정하세요.
          </p>
        </div>
        <span className="rounded bg-of-surface px-2 py-1 text-[11px] font-medium text-of-muted">
          {decided}/{result.assignee_identities.length} 결정
        </span>
      </div>

      <InlineAlert tone="neutral">
        이메일이 정확히 일치하는 멤버는 제안만 표시됩니다. 실행 전 각 값을 직접 결정해야 합니다.
      </InlineAlert>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
        {result.assignee_identities.map((identity) => {
          const hasDecision = Object.prototype.hasOwnProperty.call(mappings, identity.source_value)
          const value = hasDecision
            ? (mappings[identity.source_value] ?? UNASSIGNED)
            : PENDING_MAPPING
          return (
            <div
              key={identity.source_value}
              className="grid gap-2 rounded-of border border-of-border bg-of-surface p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.9fr)] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  {hasDecision ? (
                    <Check size={13} className="shrink-0 text-of-success" aria-hidden />
                  ) : (
                    <UserRound size={13} className="shrink-0 text-of-muted" aria-hidden />
                  )}
                  <span className="truncate text-xs font-medium" title={identity.source_value}>
                    {identity.source_value}
                  </span>
                  <span className="shrink-0 text-[10px] text-of-muted">
                    {identity.row_count}건
                  </span>
                </div>
                {identity.suggested_user_id ? (
                  <button
                    type="button"
                    className="mt-1 flex max-w-full items-center gap-1 text-left text-[11px] text-of-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                    onClick={() => onChange(identity.source_value, identity.suggested_user_id)}
                  >
                    <Lightbulb size={11} className="shrink-0" aria-hidden />
                    <span className="truncate">
                      제안: {identity.suggested_display_name} · {identity.suggested_email}
                    </span>
                  </button>
                ) : (
                  <p className="mt-1 text-[11px] text-of-muted">정확히 일치하는 이메일 없음</p>
                )}
              </div>
              <label className="space-y-1">
                <span className="sr-only">{identity.source_value} 담당자 결정</span>
                <Select
                  aria-label={`${identity.source_value} 담당자 결정`}
                  value={value}
                  onChange={(event) =>
                    onChange(
                      identity.source_value,
                      event.target.value === UNASSIGNED ? null : event.target.value,
                    )
                  }
                  className={!hasDecision ? 'border-of-warning' : undefined}
                >
                  <option value={PENDING_MAPPING} disabled>
                    결정 필요
                  </option>
                  <option value={UNASSIGNED}>미배정으로 가져오기</option>
                  {result.assignable_members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name} · {member.email}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ImportSummary({
  result,
  committed,
}: {
  result: CsvImportResult
  committed: boolean
}) {
  return (
    <div className="space-y-2 rounded-of border border-of-border bg-of-surface-2 p-3 text-xs">
      <div className="flex items-center gap-2">
        {committed ? (
          <span className="rounded bg-of-accent-soft px-1.5 py-0.5 font-medium text-of-accent">
            가져오기 완료 · {result.inserted}건 생성
          </span>
        ) : (
          <span className="rounded bg-of-surface px-1.5 py-0.5 font-medium text-of-muted">
            미리보기 (저장 안 됨)
          </span>
        )}
      </div>
      <dl className="grid grid-cols-4 gap-2">
        <Stat label="전체" value={result.total_rows} />
        <Stat label="유효" value={result.valid} />
        <Stat label="오류" value={result.invalid} danger={result.invalid > 0} />
        <Stat label="생성" value={result.inserted} />
      </dl>
      <p className="truncate text-[11px] text-of-muted" title={result.checksum}>
        체크섬: <code>{result.checksum.slice(0, 16)}…</code>
      </p>

      {result.notes.length > 0 ? (
        <ul className="space-y-0.5 rounded border border-of-border bg-of-surface p-1.5">
          {result.notes.map((note) => (
            <li key={note} className="text-[11px] text-of-muted">
              ⓘ {note}
            </li>
          ))}
        </ul>
      ) : null}

      {result.errors.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-of-danger">실패 행 ({result.errors.length}) — 수정 후 재처리</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {result.errors.map((e) => (
              <li key={e.row} className="rounded border border-of-border bg-of-surface p-1.5">
                <span className="font-medium">{e.row}행</span>: {e.message}
                <div className="mt-0.5 truncate font-mono text-[10px] text-of-muted" title={e.raw}>
                  {e.raw}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-of bg-of-surface p-1.5 text-center">
      <dt className="text-[10px] text-of-muted">{label}</dt>
      <dd className={`text-sm font-semibold ${danger ? 'text-of-danger' : ''}`}>{value}</dd>
    </div>
  )
}
