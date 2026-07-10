import type { Notification } from './api'

export function getNotificationMessage(n: Notification): string {
  const who = n.actor_name ?? '누군가'
  const subject = n.work_package_subject ?? '삭제된 작업'
  if (n.kind === 'assigned') return `${who}님이 '${subject}' 작업에 회원님을 배정했습니다.`
  if (n.kind === 'watch_status') return `${who}님이 워치 중인 '${subject}' 상태를 변경했습니다.`
  if (n.kind === 'watch_comment') return `${who}님이 워치 중인 '${subject}'에 댓글을 남겼습니다.`
  if (n.kind === 'watch_assigned') return `${who}님이 워치 중인 '${subject}' 담당자를 변경했습니다.`
  if (n.kind === 'mention') return `${who}님이 '${subject}' 댓글에서 회원님을 멘션했습니다.`
  if (n.kind === 'due_soon') return `'${subject}' 작업 기한이 내일입니다.`
  if (n.kind === 'overdue') return `'${subject}' 작업 기한이 지났습니다.`
  if (n.kind === 'intake_accepted') return `접수 항목이 '${subject}' 작업으로 전환되었습니다.`
  if (n.kind === 'intake_declined') return '접수 항목이 반영되지 않았습니다 — 인테이크에서 사유를 확인하세요.'
  return `${who}: ${subject}`
}

export function getNotificationKindLabel(n: Notification): string {
  if (n.kind === 'assigned') return '배정'
  if (n.kind.startsWith('watch_')) return '워치'
  if (n.kind === 'mention') return '멘션'
  if (n.kind === 'due_soon' || n.kind === 'overdue') return '기한'
  if (n.kind.startsWith('intake_')) return '인테이크'
  return '알림'
}

export function getNotificationTargetPath(n: Notification): string | null {
  if (n.work_package_id) {
    return `/projects/${n.project_id}/work-packages?wp=${n.work_package_id}`
  }
  if (n.kind === 'intake_declined') {
    const anchor = n.intake_item_id ? `?item=${n.intake_item_id}` : ''
    return `/projects/${n.project_id}/intake${anchor}`
  }
  return null
}
