import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'

import { Button } from '@/components/ui/button'

/* React Router intercepts render-time exceptions and unmatched URLs with its own
   boundary before the top-level AppErrorBoundary can see them, so without an
   errorElement the user hits RR's unstyled English default. This renders the
   Korean fallback with a way back to the app. */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const status = isRouteErrorResponse(error) ? error.status : null
  const detail = isRouteErrorResponse(error)
    ? error.statusText || `HTTP ${error.status}`
    : error instanceof Error
      ? error.message
      : null

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-base font-semibold">
        {status === 404 ? '페이지를 찾을 수 없습니다' : '문제가 발생했습니다'}
      </p>
      <p className="max-w-md text-sm text-of-muted">
        {status === 404
          ? '요청하신 주소를 찾을 수 없어요. 주소를 확인하거나 프로젝트 목록으로 돌아가 주세요.'
          : '화면을 표시하는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'}
      </p>
      {detail ? <p className="max-w-md text-xs text-of-muted">{detail}</p> : null}
      <Button onClick={() => navigate('/projects')}>프로젝트 목록으로</Button>
    </div>
  )
}

/* Catch-all for unmatched routes (path: '*'). Reuses the same surface as a 404. */
export function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="text-base font-semibold">페이지를 찾을 수 없습니다</p>
      <p className="max-w-md text-sm text-of-muted">
        요청하신 주소를 찾을 수 없어요. 주소를 확인하거나 프로젝트 목록으로 돌아가 주세요.
      </p>
      <Button onClick={() => navigate('/projects')}>프로젝트 목록으로</Button>
    </div>
  )
}
