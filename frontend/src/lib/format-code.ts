import type { Plugin } from 'prettier'

/** 用 Prettier 格式化的语言：解析器与所需插件（插件按需加载，不进入首屏包） */
const PRETTIER: Record<string, { parser: string; plugins: () => Promise<Plugin>[] }> = {
  javascript: { parser: 'babel', plugins: () => [import('prettier/plugins/babel'), import('prettier/plugins/estree')] },
  typescript: { parser: 'typescript', plugins: () => [import('prettier/plugins/typescript'), import('prettier/plugins/estree')] },
  json: { parser: 'json', plugins: () => [import('prettier/plugins/babel'), import('prettier/plugins/estree')] },
  css: { parser: 'css', plugins: () => [import('prettier/plugins/postcss')] },
  scss: { parser: 'scss', plugins: () => [import('prettier/plugins/postcss')] },
  less: { parser: 'less', plugins: () => [import('prettier/plugins/postcss')] },
  html: { parser: 'html', plugins: () => [import('prettier/plugins/html')] },
  markdown: { parser: 'markdown', plugins: () => [import('prettier/plugins/markdown')] },
  yaml: { parser: 'yaml', plugins: () => [import('prettier/plugins/yaml')] },
  graphql: { parser: 'graphql', plugins: () => [import('prettier/plugins/graphql')] }
}

export const canFormat = (lang: string) => lang in PRETTIER || lang === 'sql'

/** 格式化代码块内容；语法有误时抛出错误 */
export async function formatCode(code: string, lang: string): Promise<string> {
  if (lang === 'sql') {
    const { format } = await import('sql-formatter')
    return format(code, { keywordCase: 'upper' })
  }
  const conf = PRETTIER[lang]
  if (!conf) throw new Error('暂不支持格式化该语言')
  const [{ format }, plugins] = await Promise.all([import('prettier/standalone'), Promise.all(conf.plugins())])
  const out = await format(code, { parser: conf.parser, plugins, printWidth: 100 })
  return out.replace(/\n+$/, '')
}
