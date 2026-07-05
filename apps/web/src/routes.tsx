import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from '@/components/shell/AppShell'
import { NotFound, RouteError } from '@/components/shell/RouteError'
import { FilesPage } from '@/features/attachments/FilesPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DocumentEditorPage } from '@/features/documents/DocumentEditorPage'
import { DocumentsPage } from '@/features/documents/DocumentsPage'
import { MeetingDetailPage } from '@/features/meetings/MeetingDetailPage'
import { MeetingsPage } from '@/features/meetings/MeetingsPage'
import { SettingsPage } from '@/features/members/SettingsPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { SearchPage } from '@/features/search/SearchPage'
import { BoardPage } from '@/features/work-packages/BoardPage'
import { CalendarPage } from '@/features/work-packages/CalendarPage'
import { ListPage } from '@/features/work-packages/ListPage'
import { TimelinePage } from '@/features/work-packages/TimelinePage'
import { TreePage } from '@/features/work-packages/TreePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    // Styled Korean fallback for render errors AND unmatched URLs, instead of
    // React Router's default unstyled English error screen.
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'projects/:projectId/work-packages', element: <ListPage /> },
      { path: 'projects/:projectId/board', element: <BoardPage /> },
      { path: 'projects/:projectId/tree', element: <TreePage /> },
      { path: 'projects/:projectId/timeline', element: <TimelinePage /> },
      { path: 'projects/:projectId/calendar', element: <CalendarPage /> },
      { path: 'projects/:projectId/dashboard', element: <DashboardPage /> },
      { path: 'projects/:projectId/documents', element: <DocumentsPage /> },
      { path: 'projects/:projectId/documents/:docId', element: <DocumentEditorPage /> },
      { path: 'projects/:projectId/meetings', element: <MeetingsPage /> },
      { path: 'projects/:projectId/meetings/:meetingId', element: <MeetingDetailPage /> },
      { path: 'projects/:projectId/files', element: <FilesPage /> },
      { path: 'projects/:projectId/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
