import { describe, expect, it } from 'vitest'
import { pageCss } from '../src/lib/print'

describe('pageCss', () => {
  it('uses paper size and margin', () => {
    expect(pageCss({ paperSize: 'a4', margin: '2.5cm' })).toBe('@page { size: A4; margin: 2.5cm; }')
    expect(pageCss({ paperSize: 'letter', margin: ' 1in ' })).toBe('@page { size: letter; margin: 1in; }')
  })
  it('falls back on invalid margin', () => {
    expect(pageCss({ paperSize: 'a4', margin: '2cm; } body { display:none' })).toContain('margin: 2cm;')
    expect(pageCss({ paperSize: 'a4', margin: '' })).toContain('margin: 2cm;')
  })
})

describe('pageCss sizes', () => {
  it('supports common sizes and landscape', () => {
    expect(pageCss({ paperSize: 'b5', margin: '2cm' })).toBe('@page { size: B5; margin: 2cm; }')
    expect(pageCss({ paperSize: 'a3', landscape: true, margin: '2cm' })).toBe('@page { size: A3 landscape; margin: 2cm; }')
    expect(pageCss({ paperSize: 'legal', margin: '1in' })).toContain('size: legal;')
  })
})
