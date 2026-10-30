import { describe, expect, it } from 'vitest'
import { canFormat, formatCode } from '../src/lib/format-code'

describe('formatCode', () => {
  it('formats supported languages', async () => {
    expect(await formatCode('{"a":1,"b":[1,2]}', 'json')).toBe('{ "a": 1, "b": [1, 2] }')
    expect(await formatCode('const a={b:1}', 'javascript')).toBe('const a = { b: 1 };')
    expect(await formatCode('select a,b from t where a=1', 'sql')).toBe('SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  a = 1')
  })

  it('rejects invalid code and unknown languages', async () => {
    await expect(formatCode('const = ', 'javascript')).rejects.toThrow()
    expect(canFormat('go')).toBe(false)
    await expect(formatCode('x', 'go')).rejects.toThrow()
  })
})
