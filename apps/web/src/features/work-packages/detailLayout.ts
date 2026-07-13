export const DETAIL_LAYOUT_STORAGE_KEY = 'oneflow:detail-layout:v1'
export const DETAIL_LAYOUT_MIN = 20
export const DETAIL_LAYOUT_MAX = 40

export type DetailLayoutPreferences = {
  panelWidth: number
  labelWidth: number
}

export const DEFAULT_DETAIL_LAYOUT: DetailLayoutPreferences = {
  panelWidth: 25,
  labelWidth: 30,
}

export function clampDetailLayoutValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(DETAIL_LAYOUT_MAX, Math.max(DETAIL_LAYOUT_MIN, Math.round(value)))
}

export function parseDetailLayout(raw: string | null): DetailLayoutPreferences {
  if (!raw) return DEFAULT_DETAIL_LAYOUT
  try {
    const value = JSON.parse(raw) as Partial<DetailLayoutPreferences>
    return {
      panelWidth: clampDetailLayoutValue(value.panelWidth, DEFAULT_DETAIL_LAYOUT.panelWidth),
      labelWidth: clampDetailLayoutValue(value.labelWidth, DEFAULT_DETAIL_LAYOUT.labelWidth),
    }
  } catch {
    return DEFAULT_DETAIL_LAYOUT
  }
}

export function serializeDetailLayout(value: DetailLayoutPreferences): string {
  return JSON.stringify({
    panelWidth: clampDetailLayoutValue(value.panelWidth, DEFAULT_DETAIL_LAYOUT.panelWidth),
    labelWidth: clampDetailLayoutValue(value.labelWidth, DEFAULT_DETAIL_LAYOUT.labelWidth),
  })
}
