import { Upload } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'

import { useImportCsv } from './csv'
import type { CsvImportResult } from './types'

const SAMPLE = 'subject,type,status,priority,start_date,due_date,estimated_hours'

export function ImportDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const importCsv = useImportCsv(projectId)

  const reset = () => {
    setContent('')
    setResult(null)
    importCsv.reset()
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const run = (dry_run: boolean) => {
    importCsv.mutate({ content, dry_run }, { onSuccess: setResult })
  }

  // Safe flow: a dry-run preview must succeed before the commit button unlocks.
  const previewed = result !== null && result.dry_run
  const committed = result !== null && !result.dry_run
  const err = importCsv.error instanceof ApiError ? importCsv.error.message : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload size={14} /> 가져오기
        </Button>
      </SheetTrigger>
      <SheetContent title="CSV 가져오기">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="csv-content" className="text-xs font-medium text-of-muted">
              CSV 붙여넣기
            </label>
            <p className="text-xs text-of-muted">
              첫 줄은 헤더입니다. <code className="rounded bg-of-surface-2 px-1">subject</code> 열은
              필수이며, 인식하는 열: <code className="rounded bg-of-surface-2 px-1">{SAMPLE}</code>
            </p>
            <Textarea
              id="csv-content"
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setResult(null) // editing invalidates a prior preview
              }}
              rows={8}
              className="font-mono text-xs"
              placeholder={`${SAMPLE}\n로그인 버그 수정,bug,todo,high,,,4`}
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
              disabled={!previewed || result.valid === 0 || importCsv.isPending}
              onClick={() => run(false)}
            >
              가져오기 실행{previewed ? ` (${result.valid}건)` : ''}
            </Button>
            {importCsv.isPending ? <span className="text-xs text-of-muted">처리 중…</span> : null}
          </div>

          {err ? <p className="text-xs text-of-danger">{err}</p> : null}

          {result ? <ImportSummary result={result} committed={committed} /> : null}
        </div>
      </SheetContent>
    </Sheet>
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
