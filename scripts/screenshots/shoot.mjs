// 生成介绍页（site/）用的界面截图：用 Vite 启动前端并以 mock-bridge.tsx 模拟 Go 端，再用本机 Chrome 截图为 WebP。
// usage: cd frontend && npm run screenshots [-- <名称过滤>]
//   例：npm run screenshots -- themes/   只重拍主题画廊
// 需要本机安装 Chrome / Chromium；路径可用 CHROME_PATH 指定。截图中的中文字体取决于本机字体。
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const frontend = join(repo, 'frontend')
const outDir = join(repo, 'site/assets')
const filter = process.argv[2] ?? ''

// 依赖装在 frontend/node_modules 中，从那里解析
const req = createRequire(join(frontend, 'package.json'))
const load = async (name) => import(pathToFileURL(req.resolve(name)).href)
const { createServer } = await load('vite')
const puppeteer = (await load('puppeteer-core')).default

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ]
  const found = candidates.find((p) => p && existsSync(p))
  if (!found) {
    console.error('找不到 Chrome，请用 CHROME_PATH 指定可执行文件路径')
    process.exit(1)
  }
  return found
}

const PAGE = '/__screenshots.html'
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>MarkGo</title></head>
<body><div id="root"></div><script type="module" src="/@fs/${join(here, 'mock-bridge.tsx').replace(/\\/g, '/').replace(/^\//, '')}"></script></body></html>`

const server = await createServer({
  root: frontend,
  configFile: join(frontend, 'vite.config.ts'),
  logLevel: 'warn',
  // 让 scripts/ 下文件里的 react 也解析到 frontend 的同一份
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5199, strictPort: false, fs: { allow: [repo] } },
  plugins: [
    {
      name: 'markgo-screenshots',
      configureServer(s) {
        // 示例笔记中的本地图片（/mg-asset/<绝对路径>）按文件名从 assets/ 提供
        s.middlewares.use((rq, res, next) => {
          if (!rq.url?.startsWith('/mg-asset/')) return next()
          const file = join(here, 'assets', basename(decodeURIComponent(rq.url.slice('/mg-asset/'.length).split('?')[0])))
          if (!existsSync(file)) return next()
          res.setHeader('Content-Type', file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream')
          res.end(readFileSync(file))
        })
        s.middlewares.use(async (rq, res, next) => {
          if (!rq.url?.startsWith(PAGE)) return next()
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(await s.transformIndexHtml(rq.url, html))
        })
      }
    }
  ]
})
await server.listen()
const base = server.resolvedUrls.local[0].replace(/\/$/, '') + PAGE

// 排版主题列表与应用保持一致
const { themeList } = await server.ssrLoadModule('/src/lib/themes.ts')

// name：输出文件（相对 site/assets，不含扩展名）；query：mock-bridge.tsx 识别的参数
const APP = { width: 1280, height: 800, scale: 2, quality: 82 }
const SHOTS = [
  { name: 'hero', query: 'theme=claude', ...APP },
  { name: 'light', query: 'editorTheme=default', ...APP },
  { name: 'dark', query: 'appearance=dark&editorTheme=default', ...APP },
  { name: 'agent', query: 'agent&theme=claude', ...APP },
  { name: 'math', query: `doc=${encodeURIComponent('笔记/常用公式.md')}&editorTheme=default`, ...APP, wait: 4000 },
  ...themeList.map((t) => ({
    name: `themes/${t.key}`,
    query: `theme=${t.key}&nosidebar&width=default`,
    width: 1000,
    height: 680,
    scale: 1.6,
    quality: 80
  }))
].filter((s) => s.name.includes(filter))

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--lang=zh-CN', '--font-render-hinting=none']
})
let failed = false
try {
  // 首次打开会触发 Vite 预构建依赖，先预热一次
  const warm = await browser.newPage()
  await warm.goto(base, { waitUntil: 'networkidle0', timeout: 120000 })
  await warm.close()

  for (const shot of SHOTS) {
    const page = await browser.newPage()
    page.on('pageerror', (e) => {
      failed = true
      console.error(`  ${shot.name}: ${e.message}`)
    })
    await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: shot.scale })
    await page.goto(`${base}?${shot.query}`, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    await new Promise((r) => setTimeout(r, shot.wait ?? 2500))
    const out = join(outDir, `${shot.name}.webp`)
    mkdirSync(dirname(out), { recursive: true })
    await page.screenshot({ path: out, type: 'webp', quality: shot.quality })
    await page.close()
    console.log(`✓ site/assets/${shot.name}.webp`)
  }
} finally {
  await browser.close()
  await server.close()
}
if (failed) process.exit(1)
