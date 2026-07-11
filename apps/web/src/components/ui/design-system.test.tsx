import { fireEvent, render, screen } from '@testing-library/react'
import { LayoutGrid } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox, SegmentedControl, Switch } from './controls'
import { DataGrid, DataGridFrame } from './data-grid'
import { IconButton } from './icon-button'

describe('OneFlow interaction primitives', () => {
  it('exposes icon-only actions with a stable accessible name', () => {
    render(<IconButton label="보기 전환"><LayoutGrid /></IconButton>)
    expect(screen.getByRole('button', { name: '보기 전환' })).toBeTruthy()
  })

  it('uses a controlled switch contract', () => {
    const onCheckedChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} label="알림 받기" />)
    const control = screen.getByRole('switch', { name: '알림 받기' })
    expect(control.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(control)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('announces segmented view options as one radiogroup', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="보기 방식"
        value="list"
        onChange={onChange}
        options={[
          { value: 'list', label: '목록' },
          { value: 'board', label: '보드' },
        ]}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: '보기 방식' })).toBeTruthy()
    const listOption = screen.getByRole('radio', { name: '목록' })
    const boardOption = screen.getByRole('radio', { name: '보드' })
    fireEvent.keyDown(listOption, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('board')
    expect(document.activeElement).toBe(boardOption)
  })

  it('keeps checkbox and data-grid semantics native', () => {
    render(
      <>
        <Checkbox label="현재 페이지 선택" />
        <DataGridFrame density="compact" aria-label="작업 표 스크롤 영역">
          <DataGrid>
            <thead><tr><th>작업</th></tr></thead>
            <tbody><tr><td>검토</td></tr></tbody>
          </DataGrid>
        </DataGridFrame>
      </>,
    )
    expect(screen.getByRole('checkbox', { name: '현재 페이지 선택' })).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
    const region = screen.getByRole('region', { name: '작업 표 스크롤 영역' })
    expect(region.dataset.density).toBe('compact')
    expect(region.tabIndex).toBe(0)
  })
})
