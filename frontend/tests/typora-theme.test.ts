import { describe, expect, it } from 'vitest'
import { compileTyporaTheme, joinThemePath, loadThemeSource, mapSelector, parseColor } from '../src/lib/typora-theme'

const DOC = '.mk-typora .prose-editor'

describe('mapSelector', () => {
  it('把 #write 与普通元素限定在写作区', () => {
    expect(mapSelector('#write')).toEqual({ page: false, selector: DOC, write: true })
    expect(mapSelector('#write > h3:before')).toMatchObject({ selector: `${DOC} > h3:before`, write: false })
    expect(mapSelector('blockquote p')).toMatchObject({ selector: `${DOC} blockquote p` })
    expect(mapSelector('body #write h1')).toMatchObject({ selector: `${DOC} h1` })
  })
  it('html / body / :root 视为页面级规则', () => {
    expect(mapSelector('html')).toEqual({ page: true })
    expect(mapSelector(':root')).toEqual({ page: true })
    expect(mapSelector('body')).toEqual({ page: true })
  })
  it('丢弃 Typora 自身界面与特定环境的规则', () => {
    for (const s of ['#typora-sidebar', '.megamenu-content', 'footer.ty-footer', '.context-menu', 'body.typora-export #write', '.on-focus-mode .md-focus', 'header', '.md-toc-item', 'button', '.CodeMirror-gutters', 'html.os-windows h1'])
      expect(mapSelector(s), s).toBeNull()
  })
  it('代码高亮类名映射为 highlight.js', () => {
    expect(mapSelector('.cm-s-inner .cm-keyword')).toMatchObject({ selector: `${DOC} .md-fences .hljs-keyword` })
    expect(mapSelector('pre.md-fences')).toMatchObject({ selector: `${DOC} .md-fences` })
    expect(mapSelector('.cm-s-inner .cm-unknown-thing')).toBeNull()
  })
})

describe('compileTyporaTheme', () => {
  const night = `
    @import "night/mermaid.dark.css";
    @charset "UTF-8";
    :root { --bg-color: #363B40; --side-bar-bg-color: #2E3033; --text-color: #b8bfc6; --primary-color: #6dc1e7; }
    html, body { background: var(--bg-color); line-height: 1.625rem; -webkit-text-size-adjust: 100%; }
    html, body, button, input { color: #b8bfc6; }
    #write { max-width: 914px; padding: 30px; color: #ccc; }
    @media only screen and (min-width: 1400px) { #write { max-width: 1024px } }
    @media print { h1 { color: black } }
    h1 { font-size: 2.5rem }
    #typora-sidebar { box-shadow: none }
    .cm-s-inner .cm-string { color: #D26B6B }
    @font-face { font-family: X; src: url("/mg-theme/night/x.woff") }
  `
  const { css, dark } = compileTyporaTheme(night)

  it('按背景色判断深色主题，并推导界面色变量', () => {
    expect(dark).toBe(true)
    expect(css).toMatch(/:root\[data-typora\]\[data-theme\] \{ --bg: #363b40; --surface: #2e3033;/)
    expect(css).toContain('--primary: #6dc1e7')
    expect(css).toContain('--primary-fg: #111111')
  })
  it('页面级规则拆分到编辑区与写作区，保留主题变量', () => {
    expect(css).toContain(':root[data-typora] { --bg-color: #363B40;')
    expect(css).toContain('.mk-typora { background: var(--bg-color) }')
    expect(css).toContain(`${DOC} { line-height: 1.625rem }`)
    expect(css).toContain(`${DOC} { color: #b8bfc6 }`)
    expect(css).not.toContain('text-size-adjust')
  })
  it('#write 的宽度与边距由 MarkGo 管理', () => {
    expect(css).toContain(`${DOC} { color: #ccc }`)
    expect(css).not.toMatch(/max-width: 9|max-width: 1024/)
    expect(css).not.toContain('@media only screen')
  })
  it('丢弃打印样式、Typora 界面与 @import / @charset，保留字体与高亮', () => {
    expect(css).not.toContain('@media print')
    expect(css).not.toContain('box-shadow: none }')
    expect(css).not.toMatch(/@import|@charset/)
    expect(css).toContain(`${DOC} h1 { font-size: 2.5rem }`)
    expect(css).toContain(`${DOC} .md-fences .hljs-string { color: #D26B6B }`)
    expect(css).toContain('@font-face { font-family: X;')
  })
  it('浅色主题没有变量时由 body 推导', () => {
    const r = compileTyporaTheme('body { background: #fffdf8; color: rgb(51, 51, 51) }')
    expect(r.dark).toBe(false)
    expect(r.css).toContain('--bg: #fffdf8')
    expect(r.css).toContain('--text: #333333')
  })
})

describe('loadThemeSource', () => {
  it('内联同目录 @import，改写相对 url，跳过远程与图表样式', async () => {
    const files: Record<string, string> = {
      '/mg-theme/my%20theme.css': `@import url("my theme/code.css"); @import "night/mermaid.dark.css"; @import url(https://fonts.example/x.css);
        @font-face { src: url('./my theme/a.woff2') } body { background: url(data:image/png;base64,AA) }`,
      '/mg-theme/my%20theme/code.css': `.cm-s-inner .cm-keyword { color: red } .x { background: url(../img/bg.png) }`
    }
    const src = await loadThemeSource('my theme.css', async (u) => {
      if (!(u in files)) throw new Error('missing ' + u)
      return files[u]
    })
    expect(src).toContain('.cm-keyword { color: red }')
    expect(src).toContain('url("/mg-theme/img/bg.png")')
    expect(src).toContain(`url("/mg-theme/my%20theme/a.woff2")`)
    expect(src).toContain('url(data:image/png;base64,AA)')
    expect(src).not.toMatch(/@import|mermaid|fonts\.example/)
  })
  it('路径不越出主题目录', () => {
    expect(joinThemePath('a', '../../../etc/x.css')).toBe('etc/x.css')
    expect(joinThemePath('', './night/a.css')).toBe('night/a.css')
  })
})

it('parseColor', () => {
  expect(parseColor('#abc')).toEqual([170, 187, 204])
  expect(parseColor('rgba(34, 34, 34, 0.5)')).toEqual([34, 34, 34])
  expect(parseColor('transparent')).toBeNull()
  expect(parseColor('#0000')).toBeNull()
  expect(parseColor('hsl(0, 0%, 100%)')).toEqual([255, 255, 255])
})
