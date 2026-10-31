import { useEffect, useState } from 'react'
import { loadTyporaTheme, type CompiledTheme } from './typora-theme'
import { toast } from './toast'

const STYLE_ID = 'mk-typora-theme'

/** 加载并应用 Typora 主题；id 为空时移除。返回编译结果（加载中或失败时为 null） */
export function useTyporaTheme(id: string | undefined): CompiledTheme | null {
  const [theme, setTheme] = useState<CompiledTheme | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => window.markgo.themes.onChange(() => setReload((n) => n + 1)), [])

  useEffect(() => {
    if (!id) {
      setTheme(null)
      return
    }
    let alive = true
    loadTyporaTheme(id)
      .then((t) => alive && setTheme(t))
      .catch((err) => {
        if (!alive) return
        setTheme(null)
        toast(`无法加载 Typora 主题「${id}」：${(err as Error).message}`, 'error')
      })
    return () => {
      alive = false
    }
  }, [id, reload])

  useEffect(() => {
    const root = document.documentElement
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!theme) {
      el?.remove()
      delete root.dataset.typora
      return
    }
    if (!el) {
      el = document.createElement('style')
      el.id = STYLE_ID
      document.head.appendChild(el)
    }
    el.textContent = theme.css
    root.dataset.typora = id
  }, [theme, id])

  return id ? theme : null
}
