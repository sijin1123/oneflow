import type { ProjectListItem } from '@/features/projects/types'

const RISK_LIMIT = 5

function riskTier(project: ProjectListItem): number | null {
  if (project.archived_at) return null
  if (project.health === 'off_track') return 0
  if (project.health === 'at_risk') return 1
  if (project.overdue_count > 0) return 2
  return null
}

export function rankWorkspaceRiskProjects(
  projects: ProjectListItem[],
  limit = RISK_LIMIT,
): ProjectListItem[] {
  if (!Number.isFinite(limit) || limit <= 0) return []

  return projects
    .map((project) => ({ project, tier: riskTier(project) }))
    .filter(
      (entry): entry is { project: ProjectListItem; tier: number } => entry.tier !== null,
    )
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      if (a.project.overdue_count !== b.project.overdue_count) {
        return b.project.overdue_count - a.project.overdue_count
      }
      if (a.project.open_work_package_count !== b.project.open_work_package_count) {
        return b.project.open_work_package_count - a.project.open_work_package_count
      }
      const byName = a.project.name.localeCompare(b.project.name, 'ko')
      return byName !== 0 ? byName : a.project.id.localeCompare(b.project.id)
    })
    .slice(0, Math.floor(limit))
    .map(({ project }) => project)
}

export function countWorkspaceRiskProjects(projects: ProjectListItem[]): number {
  return projects.reduce((count, project) => count + (riskTier(project) === null ? 0 : 1), 0)
}
