import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ComboBox } from '../src/components/Select'

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(() => vi.unstubAllGlobals())

it('searches localized font aliases, saves the family value, and keeps a cleared input empty', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Picker() {
    const [value, setValue] = useState('')
    return createElement('div', { 'data-family': value }, createElement(ComboBox, {
      value, onChange: setValue, placeholder: '跟随主题', options: [
        { value: '', label: '跟随主题' },
        { value: 'KaiTi', label: '楷体', searchText: '楷體' }
      ]
    }))
  }
  try {
    await act(async () => root.render(createElement(Picker)))
    const input = host.querySelector('input')!
    expect(input.value).toBe('')
    const type = async (text: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    for (const query of ['楷', 'Kai', '楷體']) {
      await type(query)
      expect(document.querySelector('[role="option"]')?.textContent).toBe('楷体')
    }
    await act(async () => (document.querySelector('[role="option"]') as HTMLElement).click())
    expect(host.firstElementChild?.getAttribute('data-family')).toBe('KaiTi')
    expect(input.value).toBe('楷体')
    await type('')
    expect(input.value).toBe('')
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
