export function validateScheduleDates(startDate: string | null, dueDate: string | null) {
  if (startDate && dueDate && startDate > dueDate) {
    return '시작일은 기한보다 늦을 수 없습니다.'
  }
  return null
}

export function formatScheduleDate(value: string | null) {
  if (!value) return '미설정'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${match[1]}. ${Number(match[2])}. ${Number(match[3])}.`
}
