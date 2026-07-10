/* One-line read-only banner (Pass 76). Shown once per page (list/board top)
   and once per drawer — never stacked. Explains WHY write controls are gone
   so a viewer is not left guessing (no silent hiding). */
export function ReadOnlyNotice({ className = '' }: { className?: string }) {
  return (
    <p
      role="status"
      className={`rounded-of bg-of-surface-2/60 px-3 py-1.5 text-[11px] text-of-muted ${className}`}
    >
      읽기 전용입니다 — 이 프로젝트에서는 보기만 할 수 있습니다(뷰어 역할 또는 아카이브된
      프로젝트).
    </p>
  )
}
