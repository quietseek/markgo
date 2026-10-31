import { Modal } from './Modal'

const isMac = window.markgo.platform === 'darwin'

/** 将 Mod / Shift / Alt 写法转换为当前平台的按键显示 */
const keys = (combo: string) =>
  combo.split('+').map((k) =>
    isMac ? ({ Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' }[k] ?? k) : ({ Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }[k] ?? k)
  )

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: '文件',
    items: [
      ['新建笔记', 'Mod+N'],
      ['打开文件', 'Mod+O'],
      ['打开文件夹', 'Mod+Shift+O'],
      ['保存', 'Mod+S'],
      ['另存为', 'Mod+Shift+S'],
      ['导出', 'Mod+Shift+P'],
      ['设置', 'Mod+,']
    ]
  },
  {
    title: '视图',
    items: [
      ['切换侧边栏', 'Mod+\\'],
      ['切换源码模式', 'Mod+/'],
      ['专注模式', 'Mod+Shift+F'],
      ['AI 助手', 'Mod+J']
    ]
  },
  {
    title: '发布',
    items: [
      ['复制排版内容', 'Mod+Shift+C'],
      ['发布', 'Mod+Shift+E']
    ]
  },
  {
    title: '编辑',
    items: [
      ['命令菜单', '/'],
      ['查找', 'Mod+F'],
      ['替换', isMac ? 'Mod+Alt+F' : 'Ctrl+H'],
      ['撤销', 'Mod+Z'],
      ['重做', 'Mod+Shift+Z']
    ]
  },
  {
    title: '格式',
    items: [
      ['加粗', 'Mod+B'],
      ['斜体', 'Mod+I'],
      ['下划线', 'Mod+U'],
      ['删除线', isMac ? 'Ctrl+Shift+`' : 'Alt+Shift+5'],
      ['行内代码', isMac ? 'Ctrl+`' : 'Mod+Shift+`'],
      ['高亮', 'Mod+Shift+H'],
      ['链接', 'Mod+K'],
      ['行内公式', '$公式$']
    ]
  },
  {
    title: '段落',
    items: [
      ['标题 1–6', 'Mod+1…6'],
      ['正文', 'Mod+0'],
      ['有序列表', isMac ? 'Mod+Alt+O' : 'Mod+Shift+['],
      ['无序列表', isMac ? 'Mod+Alt+U' : 'Mod+Shift+]'],
      ['任务列表', isMac ? 'Mod+Alt+X' : 'Mod+Shift+X'],
      ['引用', isMac ? 'Mod+Alt+Q' : 'Mod+Shift+Q'],
      ['代码块', isMac ? 'Mod+Alt+C' : 'Mod+Shift+K'],
      ['公式块', isMac ? 'Mod+Alt+B' : 'Mod+Shift+M'],
      ['表格', isMac ? 'Mod+Alt+T' : 'Mod+T']
    ]
  }
]

export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="键盘快捷键" onClose={onClose} width={620}>
      <div className="modal-body shortcuts">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h4>{g.title}</h4>
            {g.items.map(([label, combo]) => (
              <div key={label} className="shortcut-row">
                <span>{label}</span>
                <span className="kbd-group">
                  {keys(combo).map((k, i) => (
                    <kbd key={i}>{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}
