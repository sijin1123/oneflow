import { CalendarRange } from 'lucide-react'

/* Navigation placeholder: the real Gantt/timeline is a Phase 2 spike with a
   library decision gated on license (MIT/commercial only — PLAN §12). */
export function TimelinePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <CalendarRange size={28} strokeWidth={1.5} className="text-of-muted" />
      <p className="text-sm font-medium">타임라인은 준비 중입니다</p>
      <p className="max-w-md text-xs text-of-muted">
        간트/타임라인 뷰는 Phase 2에서 전용 라이브러리 평가(라이선스 게이트 포함)와 함께
        도입됩니다. 지금은 목록과 보드 뷰를 사용해 주세요.
      </p>
    </div>
  )
}
