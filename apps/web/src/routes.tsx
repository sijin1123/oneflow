import { Suspense, lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from '@/components/shell/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { NotFound, RouteError } from '@/components/shell/RouteError'
import { FilesPage } from '@/features/attachments/FilesPage'
import { InitiativesPage } from '@/features/initiatives/InitiativesPage'
import { IntakePage } from '@/features/intake/IntakePage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DocumentEditorPage } from '@/features/documents/DocumentEditorPage'
import { DocumentsPage } from '@/features/documents/DocumentsPage'
import { MeetingDetailPage } from '@/features/meetings/MeetingDetailPage'
import { MeetingsPage } from '@/features/meetings/MeetingsPage'
import { ModulesPage } from '@/features/modules/ModulesPage'
import { MyWorkPage } from '@/features/my-work/MyWorkPage'
import { PersonalNotesPage } from '@/features/personal-notes/PersonalNotesPage'
import { InboxPage } from '@/features/notifications/InboxPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { SearchPage } from '@/features/search/SearchPage'
import { TemplatesPage } from '@/features/project-templates/TemplatesPage'
import { OperationsPage } from '@/features/ops/OperationsPage'
import { StatusPage } from '@/features/ops/StatusPage'
import { UsersPage } from '@/features/admin/UsersPage'
import { WebhooksPage } from '@/features/admin/WebhooksPage'
import { WorklogsPage } from '@/features/admin/WorklogsPage'
import { WikiSettingsPage } from '@/features/admin/WikiSettingsPage'
import { AiSettingsPage } from '@/features/admin/AiSettingsPage'
import { PersonalSettingsPage } from '@/features/settings/PersonalSettingsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AllWorkPage } from '@/features/work-items/AllWorkPage'
import { WorkItemDraftsPage } from '@/features/work-item-drafts/WorkItemDraftsPage'
import { WikiRoute } from '@/features/workspace-features/WikiRoute'
import { BacklogPage } from '@/features/work-packages/BacklogPage'
import { BoardPage } from '@/features/work-packages/BoardPage'
import { CyclesPage } from '@/features/cycles/CyclesPage'
import { CalendarPage } from '@/features/work-packages/CalendarPage'
import { WorkPackageDetailPage } from '@/features/work-packages/DetailPage'
import { ListPage } from '@/features/work-packages/ListPage'
// DHTMLX Gantt is heavy — routes that pull it in are code-split (v73.1 R1-⑥).
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const TimelinePage = lazy(() =>
  import('@/features/work-packages/TimelinePage').then((m) => ({ default: m.TimelinePage })),
)
import { TreePage } from '@/features/work-packages/TreePage'

export const router = createBrowserRouter([
  // Outside the shell: must render with no session (Pass 72).
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    // Styled Korean fallback for render errors AND unmatched URLs, instead of
    // React Router's default unstyled English error screen.
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'my', element: <MyWorkPage /> },
      { path: 'notes', element: <PersonalNotesPage /> },
      { path: 'drafts', element: <WorkItemDraftsPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'work-items', element: <AllWorkPage /> },
      { path: 'initiatives', element: <InitiativesPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'templates', element: <TemplatesPage /> },
      {
        path: 'reports',
        element: (
          <Suspense fallback={<div className="p-6 text-xs text-of-muted">리포트 로딩 중…</div>}>
            <ReportsPage />
          </Suspense>
        ),
      },
      { path: 'operations', element: <OperationsPage /> },
      { path: 'status', element: <StatusPage /> },
      { path: 'admin/users', element: <UsersPage /> },
      { path: 'admin/webhooks', element: <WebhooksPage /> },
      { path: 'admin/worklogs', element: <WorklogsPage /> },
      { path: 'admin/wiki', element: <WikiSettingsPage /> },
      { path: 'admin/ai', element: <AiSettingsPage /> },
      { path: 'settings', element: <PersonalSettingsPage /> },
      { path: 'projects/:projectId/work-packages', element: <ListPage /> },
      { path: 'projects/:projectId/work-packages/:wpId', element: <WorkPackageDetailPage /> },
      { path: 'projects/:projectId/board', element: <BoardPage /> },
      { path: 'projects/:projectId/backlog', element: <BacklogPage /> },
      { path: 'projects/:projectId/tree', element: <TreePage /> },
      {
        path: 'projects/:projectId/timeline',
        element: (
          <Suspense fallback={<div className="p-6 text-xs text-of-muted">타임라인 로딩 중…</div>}>
            <TimelinePage />
          </Suspense>
        ),
      },
      { path: 'projects/:projectId/calendar', element: <CalendarPage /> },
      { path: 'projects/:projectId/cycles', element: <CyclesPage /> },
      { path: 'projects/:projectId/modules', element: <ModulesPage /> },
      { path: 'projects/:projectId/intake', element: <IntakePage /> },
      { path: 'projects/:projectId/dashboard', element: <DashboardPage /> },
      {
        path: 'projects/:projectId/documents',
        element: <WikiRoute><DocumentsPage /></WikiRoute>,
      },
      {
        path: 'projects/:projectId/documents/:docId',
        element: <WikiRoute><DocumentEditorPage /></WikiRoute>,
      },
      { path: 'projects/:projectId/meetings', element: <MeetingsPage /> },
      { path: 'projects/:projectId/meetings/:meetingId', element: <MeetingDetailPage /> },
      { path: 'projects/:projectId/files', element: <FilesPage /> },
      { path: 'projects/:projectId/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
