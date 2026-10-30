import { InputRule } from '@tiptap/core'
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import { askOnce } from './ai'
import { INLINE_MATH_RE } from './math-re'

export const StrictInlineMath = InlineMath.extend({
  // 与 Typora 一致：输入 $公式$ 后即转为行内公式
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|[^$\\])(\$(?!\s)([^$\n]+?)(?<!\s)\$)$/,
        handler: ({ state, range, match }) => {
          // 匹配可能带一个前导字符（用于排除 $$），公式从它之后开始
          const start = range.from + match[0].length - match[1].length
          state.tr.replaceWith(start, range.to, this.type.create({ latex: match[2].trim() }))
        }
      })
    ]
  },
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const m = src.match(INLINE_MATH_RE)
      if (!m) return undefined
      return { type: 'inlineMath', raw: m[0], latex: m[1].trim() }
    }
  }
})

/** 块级公式允许多行与单个 $（如 \$），只以 $$ 结束 */
export const MultilineBlockMath = BlockMath.extend({
  markdownTokenizer: {
    name: 'blockMath',
    level: 'block',
    start: (src: string) => src.indexOf('$$'),
    tokenize: (src: string) => {
      const m = src.match(/^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/)
      if (!m) return undefined
      return { type: 'blockMath', raw: m[0], latex: m[1].trim() }
    }
  }
})

const FORMULA_INSTRUCTION = (display: boolean) =>
  `把下面的自然语言描述转换为 LaTeX 数学公式（KaTeX 可渲染）。只输出公式本身：不要 $ 或 $$ 定界符，不要代码块，不要任何解释。${
    display ? '这是独立成行的公式，多行时可用 aligned 环境。' : '这是嵌在句子中的行内公式，保持简短。'
  }`

/** 去掉 Agent 可能附带的定界符或代码块 */
export function cleanLatex(text: string): string {
  let t = text.trim()
  const fence = t.match(/^```(?:latex|tex|math)?\n([\s\S]*?)\n```$/)
  if (fence) t = fence[1].trim()
  const delim = t.match(/^\$\$([\s\S]*)\$\$$/) || t.match(/^\\\[([\s\S]*)\\\]$/) || t.match(/^\$([\s\S]*)\$$/) || t.match(/^\\\(([\s\S]*)\\\)$/)
  if (delim) t = delim[1].trim()
  return t
}

/** AI 公式：自然语言 → LaTeX */
export async function generateLatex(description: string, display: boolean): Promise<string> {
  return cleanLatex(await askOnce(FORMULA_INSTRUCTION(display), description))
}

/** 选中的文字本身像 LaTeX 时直接转成公式，否则当作描述交给 AI */
export const looksLikeLatex = (text: string) => /\\[a-zA-Z]+|[_^]\{|[_^][a-zA-Z0-9]/.test(text) && !/[一-龥]/.test(text)
