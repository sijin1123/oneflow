import { gantt } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import '@/features/work-packages/gantt-theme.css'

import { nextDay } from '@/features/work-packages/ganttDates'
import { api } from '@/lib/api'

export type PortfolioTimelineItem = {
  project_id: string
  key: string
  name: string
  archived: boolean
  start_date: string | null
  end_date: string | null
  open_work_package_count: number
  milestones: Array<{ id: string; name: string; due_date: string }>
}

export function usePortfolioTimeline(includeArchived: boolean) {
  return useQuery({
    queryKey: ['portfolio-timeline', includeArchived],
    queryFn: () =>
      api<{ items: PortfolioTimelineItem[]; total: number }>(
        `/api/v1/reports/portfolio/timeline?include_archived=${includeArchived}`,
      ),
  })
}

/* Cross-project lanes (Pass 75): read-only always — the lane span is a
   DERIVED value (min/max of dated WPs), so dragging it would be meaningless.
   Text goes through the same escaped templates as the project timeline
   (v75.1 R1-② — no new template surface). Clicking a project lane deep-links
   into that project's own timeline. */
export function PortfolioTimelineChart({ items }: { items: PortfolioTimelineItem[] }) {
  const container = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const navRef = useRef(navigate)
  navRef.current = navigate

  useEffect(() => {
    if (!container.current) return
    gantt.config.readonly = true
    gantt.config.drag_move = false
    gantt.config.drag_resize = false
    gantt.config.drag_progress = false
    gantt.config.drag_links = false
    gantt.config.details_on_dblclick = false
    gantt.config.date_format = '%Y-%m-%d'
    gantt.config.row_height = 32
    gantt.config.bar_height = 18
    gantt.config.open_tree_initially = true
    gantt.config.columns = [{ name: 'text', label: '프로젝트', tree: true, width: 240 }]
    gantt.config.scales = [
      { unit: 'month', step: 1, format: '%Y.%m' },
      { unit: 'week', step: 1, format: '%d' },
    ]
    const esc = (v: string) =>
      v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    gantt.templates.task_text = (_s, _e, task) => esc(String(task.text ?? ''))
    gantt.templates.grid_row_class = () => 'of-gantt-row'
    gantt.templates.tooltip_text = () => ''
    const clickId = gantt.attachEvent('onTaskClick', (id: string) => {
      const task = gantt.isTaskExists(id) ? gantt.getTask(id) : null
      if (task?.of_kind === 'project') navRef.current(`/projects/${task.of_project_id}/timeline`)
      return false
    })
    const dblId = gantt.attachEvent('onTaskDblClick', () => false)
    gantt.init(container.current)
    return () => {
      gantt.detachEvent(clickId)
      gantt.detachEvent(dblId)
      gantt.clearAll()
    }
  }, [])

  useEffect(() => {
    // id namespaces (v75.1 R1-⑤): p-{uuid} lanes, pm-{uuid} milestone children.
    const tasks = items
      .filter((p) => p.start_date && p.end_date)
      .flatMap((p) => [
        {
          id: `p-${p.project_id}`,
          text: p.archived ? `${p.name} (아카이브)` : p.name,
          start_date: p.start_date!,
          end_date: nextDay(p.end_date!),
          of_kind: 'project',
          of_project_id: p.project_id,
          open: true,
          css: 'of-bar-in_progress',
        },
        ...p.milestones.map((m) => ({
          id: `pm-${m.id}`,
          text: m.name,
          start_date: m.due_date,
          type: 'milestone',
          duration: 0,
          parent: `p-${p.project_id}`,
          of_kind: 'portfolio-milestone',
        })),
      ])
    gantt.clearAll()
    gantt.parse({ data: tasks, links: [] })
    gantt.render()
  }, [items])

  return <div ref={container} data-testid="portfolio-gantt" className="h-[32rem] w-full" />
}
