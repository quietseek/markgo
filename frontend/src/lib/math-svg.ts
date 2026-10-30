// 发布用：公众号不支持 KaTeX 的字体与样式，公式统一转为自带图形的 SVG（与常见公众号排版工具一致）
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'

let convert: ((tex: string, display: boolean) => string) | null = null

export function texToSvg(tex: string, display: boolean): string {
  if (!convert) {
    const adaptor = liteAdaptor()
    RegisterHTMLHandler(adaptor)
    // fontCache: 'none' 让每个公式自包含，不依赖页面中其他 SVG 的 <defs>
    const doc = mathjax.document('', { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: 'none' }) })
    convert = (t, d) => adaptor.innerHTML(doc.convert(t, { display: d }))
  }
  return convert(tex, display)
}
