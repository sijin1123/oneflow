const workspaceRouteLabels: Array<{ path: string; title: string; parent: string }> = [
  { path: '/wiki', title: 'Wiki', parent: '워크스페이스' },
  { path: '/my', title: '내 작업', parent: '워크스페이스' },
  { path: '/ai', title: '작업 요약', parent: 'AI workspace' },
  { path: '/notes', title: '개인 메모', parent: '워크스페이스' },
  { path: '/drafts', title: '작업 초안', parent: '워크스페이스' },
  { path: '/inbox', title: '인박스', parent: '워크스페이스' },
  { path: '/work-items', title: '전체 작업', parent: '워크스페이스' },
  { path: '/get-started', title: '시작하기', parent: '워크스페이스' },
  { path: '/customers', title: '고객', parent: '워크스페이스' },
  { path: '/projects', title: '프로젝트', parent: '워크스페이스' },
  { path: '/templates', title: '프로젝트 템플릿', parent: '워크스페이스' },
  { path: '/initiatives', title: '이니셔티브', parent: '워크스페이스' },
  { path: '/search', title: '검색', parent: '워크스페이스' },
  { path: '/reports', title: '리포트', parent: '워크스페이스' },
  { path: '/operations', title: '운영 허브', parent: '운영' },
  { path: '/status', title: '시스템 상태', parent: '운영' },
  { path: '/admin/general', title: '일반 설정', parent: '워크스페이스 설정' },
  { path: '/admin/users', title: '사용자 관리', parent: '워크스페이스 설정' },
  { path: '/admin/worklogs', title: 'Worklogs', parent: '워크스페이스 설정' },
  { path: '/admin/wiki', title: 'Wiki 설정', parent: '기능 설정' },
  { path: '/admin/ai', title: 'AI 설정', parent: '기능 설정' },
  { path: '/admin/initiatives', title: 'Initiatives 설정', parent: '기능 설정' },
  { path: '/admin/releases', title: 'Releases 설정', parent: '기능 설정' },
  { path: '/admin/customers', title: 'Customers 설정', parent: '기능 설정' },
  { path: '/admin/webhooks', title: 'Webhooks', parent: '개발자 설정' },
  { path: '/settings', title: '개인 설정', parent: '설정' },
]

const projectRouteLabels: Array<{ suffix: string; title: string; parent: string; parentPath: string }> = [
  { suffix: '/overview', title: 'Overview', parent: '프로젝트', parentPath: 'overview' },
  { suffix: '/work-packages', title: 'Work Packages', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/board', title: 'Board', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/backlog', title: 'Backlog', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/tree', title: 'Hierarchy', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/views', title: 'Views', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/timeline', title: 'Timeline', parent: '계획', parentPath: 'timeline' },
  { suffix: '/calendar', title: 'Calendar', parent: '계획', parentPath: 'timeline' },
  { suffix: '/cycles', title: 'Cycles', parent: '계획', parentPath: 'timeline' },
  { suffix: '/modules', title: 'Modules', parent: '계획', parentPath: 'timeline' },
  { suffix: '/intake', title: 'Intake', parent: '계획', parentPath: 'timeline' },
  { suffix: '/dashboard', title: 'Dashboard', parent: '협업', parentPath: 'dashboard' },
  { suffix: '/documents', title: 'Wiki', parent: '문서', parentPath: 'documents' },
  { suffix: '/meetings', title: 'Meetings', parent: '협업', parentPath: 'dashboard' },
  { suffix: '/files', title: 'Files', parent: '협업', parentPath: 'dashboard' },
  { suffix: '/settings', title: 'Settings', parent: '운영', parentPath: 'settings' },
]

const myWorkTabTitles: Record<string, string> = {
  assigned: '배정됨',
  created: '생성함',
  subscribed: '구독',
  activity: '활동',
}

const workspaceParentHrefs: Record<string, string> = {
  워크스페이스: '/projects',
  'AI workspace': '/ai',
  운영: '/operations',
  설정: '/settings',
  '워크스페이스 설정': '/admin/general',
  '기능 설정': '/admin/wiki',
  '개발자 설정': '/admin/webhooks',
}

export function getShellContext(
  pathname: string,
  search: string,
  workspaceName: string,
  projectId?: string,
  projectName?: string,
) {
  if (projectId && projectName) {
    const projectBase = `/projects/${projectId}`
    const projectRoute = projectRouteLabels.find((item) => pathname.endsWith(item.suffix))
    let nestedRoute: { title: string; parent: string; parentPath: string } | null = null
    if (pathname.includes('/work-packages/')) {
      nestedRoute = { title: 'Work Package', parent: '작업', parentPath: 'work-packages' }
    } else if (pathname.includes('/documents/')) {
      nestedRoute = { title: 'Wiki Page', parent: '문서', parentPath: 'documents' }
    } else if (pathname.includes('/meetings/')) {
      nestedRoute = { title: 'Meeting', parent: '협업', parentPath: 'dashboard' }
    }

    const route = nestedRoute ?? projectRoute ?? {
      title: 'Work Packages',
      parent: '작업',
      parentPath: 'work-packages',
    }
    return {
      parent: route.parent,
      parentHref: route.parentPath === 'overview' ? '/projects' : `${projectBase}/${route.parentPath}`,
      scope: projectName,
      scopeHref: `${projectBase}/overview`,
      title: route.title,
    }
  }

  if (pathname === '/my') {
    const tab = new URLSearchParams(search).get('tab')
    const title = tab ? myWorkTabTitles[tab] : undefined
    return {
      parent: title ? '내 작업' : '워크스페이스',
      parentHref: title ? '/my?tab=assigned' : '/projects',
      scope: workspaceName,
      scopeHref: '/my',
      title: title ?? '홈',
    }
  }

  const workspaceRoute = workspaceRouteLabels.find((item) => pathname === item.path)
  const parent = workspaceRoute?.parent ?? '워크스페이스'
  return {
    parent,
    parentHref: workspaceParentHrefs[parent] ?? '/projects',
    scope: workspaceName,
    scopeHref: '/my',
    title: workspaceRoute?.title ?? '프로젝트',
  }
}
