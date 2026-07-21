import { CircleCheck, CircleDashed, Gauge, LockKeyhole } from 'lucide-react'
import { useParams } from 'react-router-dom'

import oneflowMark from '@/assets/brand/oneflow-ribbon-mark.svg'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import { usePublicProject } from './api'

function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value))
}

export function PublicProjectPage() {
  const { publicId = '' } = useParams()
  const project = usePublicProject(publicId)

  return (
    <main className="min-h-screen bg-[#f4f7f8] text-[#17232b]">
      <header className="border-b border-[#dfe6e9] bg-white/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-5">
          <img src={oneflowMark} alt="" className="h-6 w-7" />
          <span className="text-sm font-semibold">oneflow</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#69777e]">
            <LockKeyhole size={12} aria-hidden="true" /> 읽기 전용 공개 보기
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
        {project.isPending ? (
          <div role="status" className="animate-pulse" aria-label="공개 프로젝트 로딩 중">
            <div className="h-3 w-24 rounded bg-[#dce5e8]" />
            <div className="mt-5 h-8 w-2/3 rounded bg-[#dce5e8]" />
            <div className="mt-4 h-4 w-full max-w-2xl rounded bg-[#e5ecee]" />
            <div className="mt-12 h-24 border-y border-[#dfe6e9] bg-white/30" />
          </div>
        ) : project.isError ? (
          <section className="mx-auto max-w-lg py-20 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#d8e1e4] bg-white text-[#66757c]">
              <LockKeyhole size={18} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-xl font-semibold">공개 링크를 사용할 수 없습니다</h1>
            <p className="mt-2 text-sm leading-6 text-[#68777e]">
              {(project.error instanceof ApiError && project.error.status === 404)
                ? '공개가 중지되었거나 프로젝트가 보관되었습니다.'
                : '프로젝트 요약을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'}
            </p>
            {!(project.error instanceof ApiError && project.error.status === 404) ? (
              <Button type="button" variant="outline" className="mt-5" onClick={() => void project.refetch()}>
                다시 시도
              </Button>
            ) : null}
          </section>
        ) : project.data ? (
          <article aria-labelledby="public-project-title">
            <p className="text-xs font-medium text-[#62727a]">공개 프로젝트 요약</p>
            <h1 id="public-project-title" className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
              {project.data.name}
            </h1>
            <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-[#5f6f77]">
              {project.data.description || '프로젝트 설명이 없습니다.'}
            </p>
            <p className="mt-4 text-[11px] text-[#7a888e]">
              {formatPublishedAt(project.data.published_at)} 공개
            </p>

            <section aria-label="프로젝트 진행 요약" className="mt-10 border-y border-[#d8e1e4]">
              <div className="grid grid-cols-1 divide-y divide-[#d8e1e4] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="flex items-center gap-3 py-5 sm:px-5 sm:first:pl-0">
                  <Gauge size={17} className="text-[#06775f]" aria-hidden="true" />
                  <div><p className="text-2xl font-semibold tabular-nums">{project.data.completion_percent}%</p><p className="mt-0.5 text-xs text-[#68777e]">완료 흐름</p></div>
                </div>
                <div className="flex items-center gap-3 py-5 sm:px-5">
                  <CircleDashed size={17} className="text-[#a46b14]" aria-hidden="true" />
                  <div><p className="text-2xl font-semibold tabular-nums">{project.data.open_work_package_count}</p><p className="mt-0.5 text-xs text-[#68777e]">진행 중</p></div>
                </div>
                <div className="flex items-center gap-3 py-5 sm:px-5">
                  <CircleCheck size={17} className="text-[#23875d]" aria-hidden="true" />
                  <div><p className="text-2xl font-semibold tabular-nums">{project.data.completed_work_package_count}</p><p className="mt-0.5 text-xs text-[#68777e]">완료 / 전체 {project.data.work_package_count}</p></div>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden bg-[#e0e8e9]" aria-hidden="true">
                <div className="h-full bg-[#087b63]" style={{ width: `${project.data.completion_percent}%` }} />
              </div>
            </section>

            <section className="mt-8 max-w-2xl text-xs leading-6 text-[#66757c]">
              이 페이지에는 개별 작업, 문서, 파일, 댓글, 회원, 예산과 내부 상태 메모가 표시되지 않습니다.
            </section>
          </article>
        ) : null}
      </div>
    </main>
  )
}
