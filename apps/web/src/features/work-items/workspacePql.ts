export type WorkspacePqlSuggestion = {
  label: string
  insert: string
  description: string
}

const FIELDS: WorkspacePqlSuggestion[] = [
  { label: 'Title', insert: 'title ', description: '작업 제목' },
  { label: 'State', insert: 'state ', description: '상태 또는 open/completed' },
  { label: 'Priority', insert: 'priority ', description: '작업 우선순위' },
  { label: 'Project', insert: 'project ', description: '프로젝트 키 또는 이름' },
  { label: 'Assignee', insert: 'assignee ', description: '담당자, me 또는 none' },
]

const OPERATORS: WorkspacePqlSuggestion[] = [
  { label: '=', insert: '= ', description: '값과 같음' },
  { label: '!=', insert: '!= ', description: '값과 다름' },
  { label: 'IN', insert: 'IN (', description: '목록 중 하나' },
  { label: 'NOT IN', insert: 'NOT IN (', description: '목록에 포함되지 않음' },
]

const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low', 'None']
const STATES = ['Open', 'Completed', 'Backlog', 'Todo', 'In_progress', 'In_review', 'Done', 'Cancelled']
const KEYWORDS: WorkspacePqlSuggestion[] = [
  { label: 'AND', insert: 'AND ', description: '두 조건이 모두 참' },
  { label: 'OR', insert: 'OR ', description: '두 조건 중 하나가 참' },
  { label: 'ORDER BY', insert: 'ORDER BY ', description: '필드로 결과 정렬' },
  { label: 'LIMIT', insert: 'LIMIT ', description: '결과 수 제한' },
]

export function getWorkspacePqlSuggestions(input: string): WorkspacePqlSuggestion[] {
  const value = input.trim()
  if (!value || /\b(?:AND|OR)\s*$/i.test(value)) return FIELDS
  if (/(?:^|\s)(?:title|state|priority|project|assignee)\s*$/i.test(value)) return OPERATORS

  const pendingValue = value.match(
    /(?:^|\s)(title|state|priority|project|assignee)\s+(?:=|!=|IN\s*\(|NOT\s+IN\s*\()\s*$/i,
  )
  if (pendingValue) {
    const field = pendingValue[1].toLowerCase()
    if (field === 'priority') return valueSuggestions(PRIORITIES)
    if (field === 'state') return valueSuggestions(STATES)
    if (field === 'assignee') return valueSuggestions(['me', 'none'])
  }

  return isWorkspacePqlRunnable(value) ? KEYWORDS : []
}

export function appendWorkspacePqlSuggestion(
  input: string,
  suggestion: WorkspacePqlSuggestion,
) {
  const leading = input.trimEnd()
  const separator = leading ? ' ' : ''
  return `${leading}${separator}${suggestion.insert}`
}

export function isWorkspacePqlRunnable(input: string) {
  const value = input.trim()
  if (!value || value.length > 1000) return false
  if ((value.match(/"/g)?.length ?? 0) % 2 !== 0) return false
  if (/\b(?:AND|OR|ORDER\s+BY|LIMIT|IN|NOT\s+IN)\s*$/i.test(value)) return false
  if (/(?:=|!=)\s*$/i.test(value) || /\(\s*$/.test(value)) return false
  if ((value.match(/\(/g)?.length ?? 0) !== (value.match(/\)/g)?.length ?? 0)) return false
  return /(?:^|\s)(?:title|state|priority|project|assignee)\s+(?:=|!=|IN\s*\(|NOT\s+IN\s*\()/i.test(value)
}

function valueSuggestions(values: string[]): WorkspacePqlSuggestion[] {
  return values.map((value) => ({
    label: value,
    insert: value,
    description: '조건 값',
  }))
}
