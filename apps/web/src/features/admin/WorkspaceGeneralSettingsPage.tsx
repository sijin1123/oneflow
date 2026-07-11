import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import {
  useAdminWorkspaceProfile,
  useUpdateWorkspaceProfile,
} from '@/features/workspace-profile/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'

export function WorkspaceGeneralSettingsPage() {
  const profile = useAdminWorkspaceProfile()
  const update = useUpdateWorkspaceProfile()
  const [name, setName] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (profile.data && !dirty) setName(profile.data.name)
  }, [dirty, profile.data])

  if (profile.isPending) return <ListSkeleton />
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.status === 403) {
      return <EmptyState title="접근 권한이 없습니다" hint="워크스페이스 설정은 관리자만 변경할 수 있습니다." />
    }
    return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
  }

  const trimmed = name.trim()
  const changed = trimmed !== profile.data.name
  const stale = update.error instanceof ApiError && update.error.status === 412

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="일반"
      description="OneFlow에서 표시할 워크스페이스 이름을 관리합니다."
      meta={`revision ${profile.data.revision}`}
    >
      <SettingsSection title="워크스페이스 identity" description="앱 탐색과 관리 화면에 같은 이름이 표시됩니다.">
        <form
          className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]"
          onSubmit={(event) => {
            event.preventDefault()
            if (!changed || !trimmed || trimmed.length > 80) return
            update.mutate(
              { name: trimmed, revision: profile.data.revision },
              { onSuccess: () => setDirty(false) },
            )
          }}
        >
          <div className="min-w-0">
            <label className="text-xs font-medium" htmlFor="workspace-name">워크스페이스 이름</label>
            <Input
              id="workspace-name"
              className="mt-1"
              value={name}
              maxLength={80}
              autoComplete="organization"
              onChange={(event) => {
                const next = event.target.value
                setName(next)
                setDirty(next.trim() !== profile.data.name)
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!changed || !trimmed || update.isPending}>
                {update.isPending ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : null}
                변경 저장
              </Button>
              {changed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() => {
                    setName(profile.data.name)
                    setDirty(false)
                    update.reset()
                  }}
                >
                  되돌리기
                </Button>
              ) : null}
            </div>
            {update.isError ? (
              <p className="mt-3 text-xs text-of-danger" role="alert">
                {stale
                  ? '다른 관리자가 먼저 변경했습니다. 입력값은 유지했으며 최신 revision으로 다시 저장할 수 있습니다.'
                  : '워크스페이스 이름을 저장하지 못했습니다.'}
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-subtle p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-of bg-of-accent text-sm font-bold text-white">
              {trimmed.slice(0, 2).toUpperCase() || 'OF'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{trimmed || profile.data.name}</p>
              <p className="text-[11px] text-of-muted">OneFlow workspace</p>
            </div>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection title="변경 기록" description="현재 identity revision과 최근 변경자를 확인합니다.">
        <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-of-muted">상태</dt>
            <dd className="mt-1"><Badge variant="accent">활성</Badge></dd>
          </div>
          <div>
            <dt className="text-of-muted">최근 변경자</dt>
            <dd className="mt-1 break-words font-medium">{profile.data.updated_by_name ?? '초기 설정'}</dd>
          </div>
          <div>
            <dt className="text-of-muted">최근 변경 시각</dt>
            <dd className="mt-1 font-medium">{formatDateTime(profile.data.updated_at)}</dd>
          </div>
        </dl>
      </SettingsSection>
    </SettingsFrame>
  )
}
