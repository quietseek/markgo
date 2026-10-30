import { describe, expect, it } from 'vitest'
import { isInside } from '../src/lib/assets'

describe('isInside', () => {
  it('判断文件是否位于文件夹内', () => {
    expect(isInside('/notes/a.md', '/notes')).toBe(true)
    expect(isInside('/notes/sub/a.md', '/notes/')).toBe(true)
    expect(isInside('/notes-old/a.md', '/notes')).toBe(false)
    expect(isInside('/Users/me/Desktop/a.md', '/notes')).toBe(false)
    expect(isInside('C:\\notes\\a.md', 'C:\\notes')).toBe(true)
  })
})
