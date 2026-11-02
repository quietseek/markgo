// 截图用的示例笔记库：路径相对笔记库根目录。尽量覆盖编辑器支持的各类元素。
// 图片引用 assets/ 下的文件，由 shoot.mjs 从 scripts/screenshots/assets/ 提供。
const slowWriting = `---
title: 慢写作：在信息洪流里留一张安静的书桌
tags: [写作, 习惯, 效率]
summary: 每周只写一篇，但写到自己满意为止
---

# 慢写作：在信息洪流里留一张安静的书桌

> 写作不是把想法倒出来，而是把想法一点点打磨成形。

每天打开手机，我们被推送、短视频和群消息包围。真正需要**深度思考**的时刻，反而越来越少。于是我开始尝试一种「慢写作」的习惯：==每周只写一篇，但写到自己满意为止==。这个想法来自 [《深度工作》](https://calnewport.com/deep-work/) 一书，~~日更~~的执念也就此放下。

## 为什么要慢下来

- 快写容易堆砌素材，慢写才会做取舍
- 留出时间，让观点在脑子里 *发酵*
- 一篇好文章，读者能感受到作者的\`耐心\`

![留一张安静的书桌](assets/desk.svg)

## 我的四步工作流

| 步骤 | 做什么 | 用时 |
| --- | --- | --- |
| 收集 | 随手记下灵感，不评判 | 每天 5 分钟 |
| 提纲 | 找出一条主线 | 30 分钟 |
| 初稿 | 一口气写完，不回头改 | 1 小时 |
| 打磨 | 删掉三分之一 | 1 小时 |

写作的产出大致符合一个朴素的规律：$\\text{质量} \\approx \\text{投入时间} \\times \\text{专注度}^2$。专注度是平方项，这也是为什么关掉通知比多坐一小时更有用。

## 本周清单

- [x] 整理上周的灵感卡片
- [x] 写完初稿
- [ ] 删掉三分之一，再读一遍
- [ ] 发布到公众号

## 一个小工具

我用一段很短的脚本统计每周的字数：

\`\`\`python
from pathlib import Path

words = sum(len(p.read_text()) for p in Path("写作").rglob("*.md"))
print(f"本周共写 {words} 字")
\`\`\`

---

慢一点，也许会走得更远。
`

const releaseNote = `# 用 AI 写一篇产品更新说明

## 大纲

1. 这次更新解决了什么问题
2. 三个最值得一提的新功能
3. 升级方式

## 正文

本次更新聚焦在**导出体验**上。过去导出 PDF 需要安装 LaTeX，动辄几百 MB；现在 PDF 直接按编辑区的样式生成，所见即所得。
`

const formulas = `---
title: 常用公式速查
tags: [数学, 图表]
---

# 常用公式速查

勾股定理 $a^2 + b^2 = c^2$，欧拉恒等式 $e^{i\\pi} + 1 = 0$；上标 E = mc^2^ 与下标 H~2~O 也能直接输入。

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi} \\qquad P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}
$$

\`\`\`mermaid
flowchart LR
  灵感 --> 提纲 --> 初稿 --> 打磨 --> 发布
\`\`\`

发布前用一小段脚本检查文章长度：

\`\`\`javascript
const minutes = (text) => Math.ceil(text.length / 400)
console.log(\`预计阅读 \${minutes(article)} 分钟\`)
\`\`\`
`

export const NOTES: Record<string, string> = {
  '公众号/慢写作.md': slowWriting,
  '公众号/产品更新说明.md': releaseNote,
  '公众号/读书笔记·小而美.md': '# 读书笔记\n\n小即是美。\n',
  '笔记/常用公式.md': formulas,
  '笔记/待办.md': '# 待办\n\n- [x] 写完 README\n- [ ] 上线主页\n',
  '笔记/会议纪要.md': '# 会议纪要\n\n讨论下季度选题。\n',
  '周报.md': '# 周报\n\n本周完成了主页设计。\n'
}
