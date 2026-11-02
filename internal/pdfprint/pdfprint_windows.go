package pdfprint

// Windows：调用 WebView2 的 ICoreWebView2_7::PrintToPdf（WebView2 运行时 98 起支持）。
// Wails 未公开 WebView2 对象，这里从窗口内部取出 ICoreWebView2，按 WebView2.h 的虚表下标调用。

import (
	"errors"
	"fmt"
	"math"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	iidICoreWebView2_7           = windows.GUID{Data1: 0x79c24d83, Data2: 0x09a3, Data3: 0x45ae, Data4: [8]byte{0x94, 0x18, 0x48, 0x7f, 0x32, 0xa5, 0x87, 0x40}}
	iidICoreWebView2Environment6 = windows.GUID{Data1: 0xe59ee362, Data2: 0xacbd, Data3: 0x4857, Data4: [8]byte{0x9a, 0x8e, 0xd3, 0x64, 0x4d, 0x94, 0x59, 0xa9}}
)

// 虚表下标（摘自 WebView2.h）
const (
	vtQueryInterface = 0
	vtRelease        = 2

	vtWebViewGetEnvironment = 67 // ICoreWebView2_2::get_Environment
	vtWebViewPrintToPdf     = 80 // ICoreWebView2_7::PrintToPdf

	vtEnvCreatePrintSettings = 14 // ICoreWebView2Environment6::CreatePrintSettings

	vtSettingsPutOrientation     = 4
	vtSettingsPutPageWidth       = 8
	vtSettingsPutPageHeight      = 10
	vtSettingsPutMarginTop       = 12
	vtSettingsPutMarginBottom    = 14
	vtSettingsPutMarginLeft      = 16
	vtSettingsPutMarginRight     = 18
	vtSettingsPutBackgrounds     = 20
	vtSettingsPutHeaderAndFooter = 24
	orientationPortrait          = 0
)

// comCall 调用 COM 对象虚表中的第 idx 个方法，返回 HRESULT
func comCall(obj unsafe.Pointer, idx int, args ...uintptr) uintptr {
	vtbl := *(*unsafe.Pointer)(obj)
	fn := *(*uintptr)(unsafe.Add(vtbl, uintptr(idx)*unsafe.Sizeof(uintptr(0))))
	r, _, _ := syscall.SyscallN(fn, append([]uintptr{uintptr(obj)}, args...)...)
	return r
}

func failed(hr uintptr) bool { return int32(hr) < 0 }

func release(obj unsafe.Pointer) {
	if obj != nil {
		comCall(obj, vtRelease)
	}
}

// double 参数：Windows x64 调用约定下浮点参数经 XMM 寄存器传递，syscall 会同时填入
func double(v float64) uintptr { return uintptr(math.Float64bits(v)) }

// ---------- 完成回调（ICoreWebView2PrintToPdfCompletedHandler） ----------

// handler 实现 COM 接口的对象：首字段为虚表指针
type handler struct {
	vtbl *handlerVtbl
	id   uintptr
}

type handlerVtbl struct {
	queryInterface, addRef, release, invoke uintptr
}

var (
	handlers  = map[uintptr]*handler{} // 防止回调前被回收；只在主线程访问
	theVtable = &handlerVtbl{
		queryInterface: syscall.NewCallback(func(this uintptr, _ unsafe.Pointer, out *uintptr) uintptr {
			*out = this
			return 0
		}),
		addRef:  syscall.NewCallback(func(uintptr) uintptr { return 1 }),
		release: syscall.NewCallback(func(uintptr) uintptr { return 1 }),
		invoke: syscall.NewCallback(func(this, errorCode, isSuccessful uintptr) uintptr {
			h, ok := handlers[this]
			if !ok {
				return 0
			}
			delete(handlers, this)
			switch {
			case failed(errorCode):
				finish(h.id, fmt.Errorf("导出 PDF 失败：%w", windows.Errno(errorCode)))
			case int32(isSuccessful) == 0:
				finish(h.id, errors.New("导出 PDF 失败，请检查保存位置是否可写"))
			default:
				finish(h.id, nil)
			}
			return 0
		}),
	}
)

// start 在主线程调用：发起打印，结果通过 done 返回
func start(win Window, out string, o Options, done chan<- error) error {
	webview := nativeField(win, "impl", "chromium", "webview")
	if webview == nil {
		return ErrUnsupported
	}
	var wv7 unsafe.Pointer
	if hr := comCall(webview, vtQueryInterface, uintptr(unsafe.Pointer(&iidICoreWebView2_7)), uintptr(unsafe.Pointer(&wv7))); failed(hr) || wv7 == nil {
		return errors.New("WebView2 运行时版本过低，请更新 Microsoft Edge WebView2 运行时后再导出 PDF")
	}
	defer release(wv7)

	settings, err := printSettings(wv7, o)
	if err != nil {
		return err
	}
	defer release(settings)

	path, err := windows.UTF16PtrFromString(out)
	if err != nil {
		return err
	}
	id := register(done)
	h := &handler{vtbl: theVtable, id: id}
	key := uintptr(unsafe.Pointer(h))
	handlers[key] = h
	if hr := comCall(wv7, vtWebViewPrintToPdf, uintptr(unsafe.Pointer(path)), uintptr(settings), key); failed(hr) {
		delete(handlers, key)
		unregister(id)
		return fmt.Errorf("导出 PDF 失败：%w", windows.Errno(hr))
	}
	return nil
}

// printSettings 创建 ICoreWebView2PrintSettings：纸张、边距（英寸）、打印背景、不加页眉页脚
func printSettings(wv7 unsafe.Pointer, o Options) (unsafe.Pointer, error) {
	var env, env6, settings unsafe.Pointer
	if hr := comCall(wv7, vtWebViewGetEnvironment, uintptr(unsafe.Pointer(&env))); failed(hr) || env == nil {
		return nil, fmt.Errorf("无法读取 WebView2 环境：%w", windows.Errno(hr))
	}
	defer release(env)
	if hr := comCall(env, vtQueryInterface, uintptr(unsafe.Pointer(&iidICoreWebView2Environment6)), uintptr(unsafe.Pointer(&env6))); failed(hr) || env6 == nil {
		return nil, errors.New("WebView2 运行时版本过低，请更新 Microsoft Edge WebView2 运行时后再导出 PDF")
	}
	defer release(env6)
	if hr := comCall(env6, vtEnvCreatePrintSettings, uintptr(unsafe.Pointer(&settings))); failed(hr) || settings == nil {
		return nil, fmt.Errorf("无法创建打印设置：%w", windows.Errno(hr))
	}
	w, h := o.pageSize()
	calls := []struct {
		idx int
		arg uintptr
	}{
		{vtSettingsPutOrientation, orientationPortrait}, // 宽高已按方向交换
		{vtSettingsPutPageWidth, double(mmToInch(w))},
		{vtSettingsPutPageHeight, double(mmToInch(h))},
		{vtSettingsPutMarginTop, double(mmToInch(o.Top))},
		{vtSettingsPutMarginBottom, double(mmToInch(o.Bottom))},
		{vtSettingsPutMarginLeft, double(mmToInch(o.Left))},
		{vtSettingsPutMarginRight, double(mmToInch(o.Right))},
		{vtSettingsPutBackgrounds, 1},
		{vtSettingsPutHeaderAndFooter, 0},
	}
	for _, c := range calls {
		if hr := comCall(settings, c.idx, c.arg); failed(hr) {
			release(settings)
			return nil, fmt.Errorf("打印设置无效：%w", windows.Errno(hr))
		}
	}
	return settings, nil
}
