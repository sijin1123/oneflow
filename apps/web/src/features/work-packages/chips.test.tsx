import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PriorityChip, StatusChip, TypeChip } from './chips'

describe('StatusChip', () => {
  it('renders the Korean status label', () => {
    render(<StatusChip status="in_progress" />)
    expect(screen.getByText('진행 중')).toBeTruthy()
  })
})

describe('PriorityChip', () => {
  it('renders a dash for none', () => {
    render(<PriorityChip priority="none" />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('renders the label for a real priority', () => {
    render(<PriorityChip priority="urgent" />)
    expect(screen.getByText('긴급')).toBeTruthy()
  })
})

describe('TypeChip', () => {
  it('renders the Korean type label', () => {
    render(<TypeChip type="bug" />)
    expect(screen.getByText('버그')).toBeTruthy()
  })
})
