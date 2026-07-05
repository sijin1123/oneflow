import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from '@/components/shell/AppShell'
import { SettingsPage } from '@/features/members/SettingsPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { BoardPage } from '@/features/work-packages/BoardPage'
import { ListPage } from '@/features/work-packages/ListPage'
import { TimelinePage } from '@/features/work-packages/TimelinePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId/work-packages', element: <ListPage /> },
      { path: 'projects/:projectId/board', element: <BoardPage /> },
      { path: 'projects/:projectId/timeline', element: <TimelinePage /> },
      { path: 'projects/:projectId/settings', element: <SettingsPage /> },
    ],
  },
])
