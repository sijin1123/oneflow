/* 409 conflict decision logic (PLAN §8) — framework-free pure function so it can
   run under `node --test` with Node type stripping. Erasable syntax only
   (tsconfig `erasableSyntaxOnly`): no enums, no namespaces. */

export type ConflictDecision = {
  /** show a user-facing notice */
  notify: boolean
  /** invalidate the related queries and reload fresh data */
  invalidate: boolean
  message: string | null
}

export function decideOnPatchError(status: number): ConflictDecision {
  if (status === 409) {
    return {
      notify: true,
      invalidate: true,
      message: '다른 사용자가 이 작업을 먼저 수정했습니다. 최신 내용으로 새로고침했어요.',
    }
  }
  return { notify: false, invalidate: false, message: null }
}
