import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

/** 统一样式的下拉选择框，替代原生 <select> / <datalist> */

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  /** 右侧的灰色说明，如「未安装」 */
  hint?: string
  /** 搜索用的别名，不额外显示 */
  searchText?: string
  disabled?: boolean
}

const ITEM_HEIGHT = 32
const MENU_MAX_HEIGHT = 280
const GAP = 4

/** 菜单挂在 body 上并固定定位，避免被对话框的滚动区域裁剪；下方空间不够时向上展开 */
function useMenuPosition(open: boolean, anchor: React.RefObject<HTMLElement | null>, count: number) {
  const [style, setStyle] = useState<React.CSSProperties>({})
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const el = anchor.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const height = Math.min(MENU_MAX_HEIGHT, count * ITEM_HEIGHT + 10)
      const below = window.innerHeight - r.bottom - GAP - 8
      const above = r.top - GAP - 8
      const up = below < height && above > below
      const width = Math.max(r.width, 160)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      setStyle({
        left,
        minWidth: width,
        maxWidth: Math.max(width, 420),
        maxHeight: Math.min(MENU_MAX_HEIGHT, up ? above : below),
        ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP })
      })
    }
    place()
    window.addEventListener('resize', place)
    // 对话框内滚动时跟随
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, count])
  return style
}

/** 打开时点击外部关闭 */
function useOutsideClose(open: boolean, refs: React.RefObject<HTMLElement | null>[], close: () => void) {
  const latest = useRef(close)
  latest.current = close
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) latest.current()
    }
    const onBlur = () => latest.current()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

/** 下一个可选项的序号（跳过禁用项） */
function step(options: SelectOption[], from: number, dir: 1 | -1): number {
  if (!options.length) return -1
  for (let i = 1; i <= options.length; i++) {
    const n = (from + dir * i + options.length * 2) % options.length
    if (!options[n].disabled) return n
  }
  return from
}

function Menu<T extends string>({
  menuRef,
  style,
  options,
  value,
  active,
  onActive,
  onPick
}: {
  menuRef: React.RefObject<HTMLDivElement | null>
  style: React.CSSProperties
  options: SelectOption<T>[]
  value: string
  active: number
  onActive(i: number): void
  onPick(v: T): void
}) {
  // 键盘移动时让当前项保持可见
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, menuRef])
  return createPortal(
    <div className="select-menu" role="listbox" ref={menuRef} style={style}>
      {options.map((o, i) => (
        <div
          key={o.value}
          data-index={i}
          role="option"
          aria-selected={o.value === value}
          aria-disabled={o.disabled || undefined}
          className={`select-item${i === active ? ' active' : ''}${o.value === value ? ' selected' : ''}${o.disabled ? ' disabled' : ''}`}
          onMouseEnter={() => !o.disabled && onActive(i)}
          // 不抢走触发按钮 / 输入框的焦点
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => !o.disabled && onPick(o.value)}
        >
          <span className="select-item-label">{o.label}</span>
          {o.hint && <span className="select-item-hint">{o.hint}</span>}
          <Check size={14} className="select-item-check" />
        </div>
      ))}
    </div>,
    document.body
  )
}

/**
 * 键盘：打开时在捕获阶段处理方向键、回车与 Esc，Esc 只关闭下拉框而不关闭所在的对话框
 */
function useMenuKeys(open: boolean, handler: (e: KeyboardEvent) => boolean) {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (latest.current(e)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = '请选择',
  title,
  className = ''
}: {
  value: T
  options: SelectOption<T>[]
  onChange(value: T): void
  placeholder?: string
  title?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const style = useMenuPosition(open, trigger, options.length)
  const current = options.find((o) => o.value === value)

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const pick = (v: T) => {
    setOpen(false)
    trigger.current?.focus()
    if (v !== value) onChange(v)
  }
  useOutsideClose(open, [trigger, menu], () => setOpen(false))
  useMenuKeys(open, (e) => {
    switch (e.key) {
      case 'ArrowDown':
        setActive((i) => step(options, i, 1))
        return true
      case 'ArrowUp':
        setActive((i) => step(options, i, -1))
        return true
      case 'Home':
        setActive(step(options, -1, 1))
        return true
      case 'End':
        setActive(step(options, 0, -1))
        return true
      case 'Enter':
      case ' ':
        if (options[active] && !options[active].disabled) pick(options[active].value)
        else setOpen(false)
        return true
      case 'Escape':
      case 'Tab':
        setOpen(false)
        return e.key === 'Escape'
    }
    return false
  })

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`select-trigger${open ? ' open' : ''} ${className}`}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            show()
          }
        }}
      >
        <span className={`select-value${current ? '' : ' placeholder'}`}>
          {current?.label ?? placeholder}
          {current?.hint && <span className="select-item-hint">{current.hint}</span>}
        </span>
        <ChevronDown size={14} className="select-chevron" />
      </button>
      {open && <Menu menuRef={menu} style={style} options={options} value={value} active={active} onActive={setActive} onPick={pick} />}
    </>
  )
}

/** 可输入的下拉框：从列表中选择，也可直接填写（替代 <input list> + <datalist>） */
export function ComboBox({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  className = ''
}: {
  value: string
  options: (string | SelectOption)[]
  onChange(value: string): void
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // 输入时按内容筛选，点击箭头时显示全部
  const [filter, setFilter] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const entries: SelectOption[] = options.map((o) => typeof o === 'string' ? { value: o, label: o } : o)
  const items = entries.filter((o) => !filter || `${o.label} ${o.value} ${o.searchText ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
  const visible = open && items.length > 0
  const style = useMenuPosition(visible, box, items.length)

  const show = (f: string) => {
    setFilter(f)
    setActive(-1)
    setOpen(true)
  }
  const pick = (v: string) => {
    setOpen(false)
    onChange(v)
    input.current?.focus()
  }
  useOutsideClose(open, [box, menu], () => setOpen(false))
  useMenuKeys(visible, (e) => {
    switch (e.key) {
      case 'ArrowDown':
        setActive((i) => step(items, i, 1))
        return true
      case 'ArrowUp':
        setActive((i) => step(items, i < 0 ? 0 : i, -1))
        return true
      case 'Enter':
        if (items[active]) pick(items[active].value)
        else setOpen(false)
        return true
      case 'Escape':
        setOpen(false)
        return true
      case 'Tab':
        setOpen(false)
        return false
    }
    return false
  })

  return (
    <div ref={box} className={`combo${visible ? ' open' : ''} ${className}`}>
      <input
        ref={input}
        aria-label={ariaLabel}
        value={value ? entries.find((o) => o.value === value)?.label ?? value : ''}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value)
          show(e.target.value)
        }}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') {
            e.preventDefault()
            show('')
          }
        }}
      />
      {options.length > 0 && (
        <button
          type="button"
          className="combo-toggle"
          tabIndex={-1}
          aria-label="展开列表"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) setOpen(false)
            else {
              show('')
              input.current?.focus()
            }
          }}
        >
          <ChevronDown size={14} className="select-chevron" />
        </button>
      )}
      {visible && <Menu menuRef={menu} style={style} options={items} value={value} active={active} onActive={setActive} onPick={pick} />}
    </div>
  )
}
