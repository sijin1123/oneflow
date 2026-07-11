import { LockKeyhole } from 'lucide-react'

import { InlineAlert } from '@/components/ui/surface'

/* One-line read-only banner (Pass 76). Shown once per page (list/board top)
   and once per drawer — never stacked. Explains WHY write controls are gone
   so a viewer is not left guessing (no silent hiding). */
export function ReadOnlyNotice({ className = '' }: { className?: string }) {
  return (
    <InlineAlert tone="neutral" className={`flex items-center gap-2 ${className}`}>
      <span className="flex items-center gap-2">
        <LockKeyhole size={13} aria-hidden="true" />
        읽기 전용입니다. 이 프로젝트에서는 보기만 할 수 있습니다(뷰어 역할 또는 아카이브된 프로젝트).
      </span>
    </InlineAlert>
  )
}
