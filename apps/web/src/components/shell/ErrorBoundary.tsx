import * as React from 'react'

import { Button } from '@/components/ui/button'

type State = { error: Error | null }

/* Top-level error boundary (PLAN §8): a render-time exception must never leave
   the user with a blank page. */
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-base font-semibold">문제가 발생했습니다</p>
          <p className="max-w-md text-sm text-of-muted">
            화면을 그리는 중 오류가 발생했어요. 새로고침해 주세요. 문제가 계속되면 관리자에게
            문의해 주세요.
          </p>
          <Button onClick={() => window.location.reload()}>새로고침</Button>
        </div>
      )
    }
    return this.props.children
  }
}
