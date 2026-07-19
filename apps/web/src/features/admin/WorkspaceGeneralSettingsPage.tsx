import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LoaderCircle, Trash2, Upload } from 'lucide-react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import {
  useAdminWorkspaceProfile,
  useRemoveWorkspaceLogo,
  useReplaceWorkspaceLogo,
  useUpdateWorkspaceProfile,
} from '@/features/workspace-profile/api'
import { WorkspaceLogo } from '@/features/workspace-profile/WorkspaceLogo'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { confirmDestructive } from '@/lib/guards'

const WORKSPACE_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const WORKSPACE_LOGO_MAX_BYTES = 2 * 1024 * 1024

export function WorkspaceGeneralSettingsPage() {
  const profile = useAdminWorkspaceProfile()
  const update = useUpdateWorkspaceProfile()
  const replaceLogo = useReplaceWorkspaceLogo()
  const removeLogo = useRemoveWorkspaceLogo()
  const [name, setName] = useState('')
  const [dirty, setDirty] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoFileError, setLogoFileError] = useState<string | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile.data && !dirty) setName(profile.data.name)
  }, [dirty, profile.data])

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null)
      return
    }
    const next = URL.createObjectURL(logoFile)
    setLogoPreviewUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [logoFile])

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
  const logoMutation = replaceLogo.isPending || removeLogo.isPending
  const logoError = replaceLogo.error ?? removeLogo.error
  const logoStale = logoError instanceof ApiError && logoError.status === 412

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

      <SettingsSection
        title="워크스페이스 로고"
        description="저장한 로고는 상단 바, 사이드바와 워크스페이스 메뉴에 즉시 반영됩니다."
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0">
            <input
              ref={logoInputRef}
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp"
              aria-label="워크스페이스 로고 파일"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                event.target.value = ''
                replaceLogo.reset()
                removeLogo.reset()
                if (!file) return
                if (!WORKSPACE_LOGO_TYPES.has(file.type)) {
                  setLogoFile(null)
                  setLogoFileError('PNG, JPEG 또는 WebP 파일을 선택하세요.')
                  return
                }
                if (file.size > WORKSPACE_LOGO_MAX_BYTES) {
                  setLogoFile(null)
                  setLogoFileError('로고 파일은 2 MiB 이하여야 합니다.')
                  return
                }
                setLogoFileError(null)
                setLogoFile(file)
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={logoMutation}
                onClick={() => logoInputRef.current?.click()}
              >
                <ImagePlus size={13} aria-hidden="true" />
                {profile.data.logo_url ? '로고 교체' : '로고 선택'}
              </Button>
              {logoFile ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={logoMutation}
                  onClick={() =>
                    replaceLogo.mutate(
                      { file: logoFile, revision: profile.data.revision },
                      {
                        onSuccess: () => {
                          setLogoFile(null)
                          setLogoFileError(null)
                        },
                      },
                    )
                  }
                >
                  {replaceLogo.isPending ? (
                    <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload size={13} aria-hidden="true" />
                  )}
                  로고 저장
                </Button>
              ) : null}
              {profile.data.logo_url ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={logoMutation}
                  className="text-of-danger"
                  onClick={() => {
                    if (!confirmDestructive('워크스페이스 로고를 삭제할까요?')) return
                    removeLogo.mutate(
                      { revision: profile.data.revision },
                      { onSuccess: () => setLogoFile(null) },
                    )
                  }}
                >
                  {removeLogo.isPending ? (
                    <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={13} aria-hidden="true" />
                  )}
                  로고 삭제
                </Button>
              ) : null}
              {logoFile ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={logoMutation}
                  onClick={() => {
                    setLogoFile(null)
                    setLogoFileError(null)
                    replaceLogo.reset()
                  }}
                >
                  선택 취소
                </Button>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-of-muted">
              PNG, JPEG, WebP · 최대 2 MiB · 최대 4096×4096 px · 정적 이미지
            </p>
            {logoFile ? (
              <p className="mt-2 break-all text-xs font-medium">
                선택됨: {logoFile.name} · {Math.max(1, Math.round(logoFile.size / 1024))} KiB
              </p>
            ) : profile.data.logo_filename ? (
              <p className="mt-2 break-all text-xs font-medium">
                {profile.data.logo_filename} · {profile.data.logo_width}×{profile.data.logo_height} px ·{' '}
                {Math.max(1, Math.round((profile.data.logo_byte_size ?? 0) / 1024))} KiB
              </p>
            ) : null}
            {logoFileError ? <p className="mt-3 text-xs text-of-danger" role="alert">{logoFileError}</p> : null}
            {logoError ? (
              <p className="mt-3 text-xs text-of-danger" role="alert">
                {logoStale
                  ? '다른 관리자가 먼저 변경했습니다. 선택한 파일은 유지했으므로 최신 revision에 다시 저장하세요.'
                  : logoError instanceof ApiError
                    ? logoError.message
                    : '워크스페이스 로고를 변경하지 못했습니다.'}
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-subtle p-3">
            {logoPreviewUrl ? (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-of border border-of-border-subtle bg-white">
                <img src={logoPreviewUrl} alt="선택한 로고 미리보기" className="h-full w-full object-contain" />
              </span>
            ) : (
              <WorkspaceLogo profile={profile.data} size="lg" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profile.data.name}</p>
              <p className="text-[11px] text-of-muted">
                {logoPreviewUrl ? '저장 전 미리보기' : profile.data.logo_url ? '현재 로고' : '기본 로고'}
              </p>
            </div>
          </div>
        </div>
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
