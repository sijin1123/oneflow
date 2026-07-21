import { Suspense, lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from '@/components/shell/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { InvitationAcceptPage } from '@/features/auth/InvitationAcceptPage'
import { NotFound, RouteError } from '@/components/shell/RouteError'
import { FilesPage } from '@/features/attachments/FilesPage'
import { InitiativesPage } from '@/features/initiatives/InitiativesPage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { IntakePage } from '@/features/intake/IntakePage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DocumentEditorPage } from '@/features/documents/DocumentEditorPage'
import { DocumentsPage } from '@/features/documents/DocumentsPage'
import { WikiHomePage } from '@/features/documents/WikiHomePage'
import { MeetingDetailPage } from '@/features/meetings/MeetingDetailPage'
import { MeetingsPage } from '@/features/meetings/MeetingsPage'
import { ModulesPage } from '@/features/modules/ModulesPage'
import { MyWorkPage } from '@/features/my-work/MyWorkPage'
import { PersonalNotesPage } from '@/features/personal-notes/PersonalNotesPage'
import { GetStartedPage } from '@/features/onboarding/GetStartedPage'
import { InboxPage } from '@/features/notifications/InboxPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ProjectOverviewPage } from '@/features/projects/ProjectOverviewPage'
import { PublicProjectPage } from '@/features/projects/PublicProjectPage'
import { SearchPage } from '@/features/search/SearchPage'
import { TemplatesPage } from '@/features/project-templates/TemplatesPage'
import { OperationsPage } from '@/features/ops/OperationsPage'
import { StatusPage } from '@/features/ops/StatusPage'
import { UsersPage } from '@/features/admin/UsersPage'
import { AuthAssistancePage } from '@/features/admin/AuthAssistancePage'
import { WebhooksPage } from '@/features/admin/WebhooksPage'
import { IntegrationsSettingsPage } from '@/features/admin/IntegrationsSettingsPage'
import { WorklogsPage } from '@/features/admin/WorklogsPage'
import { WikiSettingsPage } from '@/features/admin/WikiSettingsPage'
import { AiSettingsPage } from '@/features/admin/AiSettingsPage'
import { AiWorkspacePage } from '@/features/ai/AiWorkspacePage'
import { InitiativesSettingsPage } from '@/features/admin/InitiativesSettingsPage'
import { ReleasesSettingsPage } from '@/features/admin/ReleasesSettingsPage'
import { CustomersSettingsPage } from '@/features/admin/CustomersSettingsPage'
import { WorkspaceSettingsShell } from '@/features/admin/WorkspaceSettingsShell'
import { WorkspaceSettingsOverviewPage } from '@/features/admin/WorkspaceSettingsOverviewPage'
import { WorkspaceGeneralSettingsPage } from '@/features/admin/WorkspaceGeneralSettingsPage'
import { WorkspaceCalendarSettingsPage } from '@/features/admin/WorkspaceCalendarSettingsPage'
import { WorkspacePhaseDefinitionsSettingsPage } from '@/features/admin/WorkspacePhaseDefinitionsSettingsPage'
import { WorkspaceProjectRolesSettingsPage } from '@/features/admin/WorkspaceProjectRolesSettingsPage'
import { PersonalSettingsPage } from '@/features/settings/PersonalSettingsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AllWorkPage } from '@/features/work-items/AllWorkPage'
import { WorkItemDraftsPage } from '@/features/work-item-drafts/WorkItemDraftsPage'
import { WikiRoute } from '@/features/workspace-features/WikiRoute'
import { InitiativesRoute } from '@/features/workspace-features/InitiativesRoute'
import { CustomersRoute } from '@/features/workspace-features/CustomersRoute'
import { BacklogPage } from '@/features/work-packages/BacklogPage'
import { BoardPage } from '@/features/work-packages/BoardPage'
import { CyclesPage } from '@/features/cycles/CyclesPage'
import { CalendarPage } from '@/features/work-packages/CalendarPage'
import { WorkPackageDetailPage } from '@/features/work-packages/DetailPage'
import { ListPage } from '@/features/work-packages/ListPage'
import { ViewsPage } from '@/features/work-packages/ViewsPage'
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
  { path: '/invite/:token', element: <InvitationAcceptPage /> },
  { path: '/public/projects/:publicId', element: <PublicProjectPage /> },
  {
    path: '/',
    element: <AppShell />,
    // Styled Korean fallback for render errors AND unmatched URLs, instead of
    // React Router's default unstyled English error screen.
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'my', element: <MyWorkPage /> },
      { path: 'ai', element: <AiWorkspacePage /> },
      { path: 'notes', element: <PersonalNotesPage /> },
      { path: 'drafts', element: <WorkItemDraftsPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'work-items', element: <AllWorkPage /> },
      { path: 'get-started', element: <GetStartedPage /> },
      {
        path: 'customers',
        element: <CustomersRoute><CustomersPage /></CustomersRoute>,
      },
      {
        path: 'initiatives',
        element: <InitiativesRoute><InitiativesPage /></InitiativesRoute>,
      },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'wiki', element: <WikiRoute><WikiHomePage /></WikiRoute> },
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
      {
        path: 'admin',
        element: <WorkspaceSettingsShell />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: 'overview', element: <WorkspaceSettingsOverviewPage /> },
          { path: 'general', element: <WorkspaceGeneralSettingsPage /> },
          { path: 'calendar', element: <WorkspaceCalendarSettingsPage /> },
          { path: 'project-phases', element: <WorkspacePhaseDefinitionsSettingsPage /> },
          { path: 'project-roles', element: <WorkspaceProjectRolesSettingsPage /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'auth-assistance', element: <AuthAssistancePage /> },
          { path: 'integrations', element: <IntegrationsSettingsPage /> },
          { path: 'webhooks', element: <WebhooksPage /> },
          { path: 'worklogs', element: <WorklogsPage /> },
          { path: 'wiki', element: <WikiSettingsPage /> },
          { path: 'ai', element: <AiSettingsPage /> },
          { path: 'initiatives', element: <InitiativesSettingsPage /> },
          { path: 'releases', element: <ReleasesSettingsPage /> },
          { path: 'customers', element: <CustomersSettingsPage /> },
        ],
      },
      { path: 'settings', element: <PersonalSettingsPage /> },
      { path: 'projects/:projectId/overview', element: <ProjectOverviewPage /> },
      { path: 'projects/:projectId/work-packages', element: <ListPage /> },
      { path: 'projects/:projectId/work-packages/:wpId', element: <WorkPackageDetailPage /> },
      { path: 'projects/:projectId/board', element: <BoardPage /> },
      { path: 'projects/:projectId/backlog', element: <BacklogPage /> },
      { path: 'projects/:projectId/tree', element: <TreePage /> },
      { path: 'projects/:projectId/views', element: <ViewsPage /> },
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
