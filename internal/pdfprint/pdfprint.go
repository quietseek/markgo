// Package pdfprint 把窗口中的网页静默打印为 PDF（不弹出打印对话框）。
//
// 各平台直接调用 WebView 的打印接口：Windows 为 WebView2 的 PrintToPdf，macOS 为 WKWebView 的打印操作，
// Linux 为 WebKitGTK 的打印操作。页面按 @media print 样式排版。
package pdfprint

import (
	"errors"
	"reflect"
	"sync"
	"time"
	"unsafe"
)

// Options 页面设置，长度单位为毫米
type Options struct {
	// 纸张宽高（纵向）
	Width, Height float64
	Landscape     bool
	Top, Bottom   float64
	Left, Right   float64
}

// PaperSizes 支持的纸张（纵向宽高，毫米）
var PaperSizes = map[string][2]float64{
	"a3":     {297, 420},
	"a4":     {210, 297},
	"a5":     {148, 210},
	"b4":     {250, 353},
	"b5":     {176, 250},
	"letter": {215.9, 279.4},
	"legal":  {215.9, 355.6},
}

// pageSize 实际的页面宽高（横向时交换）
func (o Options) pageSize() (w, h float64) {
	if o.Landscape {
		return o.Height, o.Width
	}
	return o.Width, o.Height
}

// Validate 检查页面设置：边距不能为负，也不能占满整页
func (o Options) Validate() error {
	w, h := o.pageSize()
	if w <= 0 || h <= 0 {
		return errors.New("纸张尺寸无效")
	}
	if o.Top < 0 || o.Bottom < 0 || o.Left < 0 || o.Right < 0 {
		return errors.New("页边距不能为负数")
	}
	if o.Left+o.Right > w-20 || o.Top+o.Bottom > h-20 {
		return errors.New("页边距过大，正文区域太小")
	}
	return nil
}

// ErrUnsupported 当前平台不支持静默打印
var ErrUnsupported = errors.New("当前系统不支持直接导出 PDF")

const timeout = 3 * time.Minute

// Window Wails 窗口（*application.WebviewWindow）
type Window interface {
	NativeWindow() unsafe.Pointer
}

// Print 把窗口当前的页面打印为 PDF 文件 out，打印完成后返回；invokeSync 在主线程执行函数（application.InvokeSync）
func Print(win Window, out string, o Options, invokeSync func(func())) error {
	if win == nil {
		return errors.New("窗口尚未创建")
	}
	if err := o.Validate(); err != nil {
		return err
	}
	done := make(chan error, 1)
	var err error
	invokeSync(func() { err = start(win, out, o, done) })
	if err != nil {
		return err
	}
	select {
	case err := <-done:
		return err
	case <-time.After(timeout):
		return errors.New("导出 PDF 超时")
	}
}

// ---------- 等待原生回调 ----------

var (
	pendingMu sync.Mutex
	pending   = map[uintptr]chan<- error{}
	nextID    uintptr
)

// register 登记一次打印，原生回调凭 id 通知结果
func register(done chan<- error) uintptr {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	nextID++
	pending[nextID] = done
	return nextID
}

// unregister 发起失败时取消登记
func unregister(id uintptr) {
	pendingMu.Lock()
	delete(pending, id)
	pendingMu.Unlock()
}

// finish 通知打印结果；同一 id 只生效一次
func finish(id uintptr, err error) {
	pendingMu.Lock()
	done, ok := pending[id]
	delete(pending, id)
	pendingMu.Unlock()
	if ok {
		done <- err
	}
}

// ---------- 读取 Wails 窗口的原生对象 ----------

// nativeField 沿字段路径读取 Wails 内部（未导出）的指针字段，如 impl → chromium → webview。
// 依赖 Wails 的内部结构，升级 Wails 后找不到字段时返回 nil，由调用方报错。
func nativeField(v any, path ...string) (p unsafe.Pointer) {
	defer func() {
		if recover() != nil {
			p = nil
		}
	}()
	rv := reflect.ValueOf(v)
	for _, name := range path {
		for rv.Kind() == reflect.Interface || rv.Kind() == reflect.Pointer {
			if rv.IsNil() {
				return nil
			}
			rv = rv.Elem()
		}
		if rv.Kind() != reflect.Struct {
			return nil
		}
		rv = rv.FieldByName(name)
		if !rv.IsValid() {
			return nil
		}
	}
	for rv.Kind() == reflect.Interface {
		if rv.IsNil() {
			return nil
		}
		rv = rv.Elem()
	}
	switch rv.Kind() {
	case reflect.Pointer, reflect.UnsafePointer:
		return rv.UnsafePointer()
	}
	return nil
}

func mmToInch(mm float64) float64 { return mm / 25.4 }

func mmToPoint(mm float64) float64 { return mm / 25.4 * 72 }
