//go:build linux && cgo && !gtk3 && !android && !server

package pdfprint

// Linux：用 WebKitGTK 的打印操作直接打印到 PDF 文件（不显示打印对话框）

/*
#cgo linux pkg-config: gtk4 webkitgtk-6.0
#include <stdint.h>
#include <stdlib.h>
const char *markgo_print_pdf(void *webview, const char *path, double width, double height,
	double top, double bottom, double left, double right, uintptr_t id);
*/
import "C"

import (
	"errors"
	"unsafe"
)

//export markgoPrintPDFDone
func markgoPrintPDFDone(id C.uintptr_t, msg *C.char) {
	if msg == nil {
		finish(uintptr(id), nil)
	} else {
		finish(uintptr(id), errors.New("导出 PDF 失败："+C.GoString(msg)))
	}
}

func start(win Window, out string, o Options, done chan<- error) error {
	webview := nativeField(win, "impl", "webview")
	if webview == nil {
		return ErrUnsupported
	}
	path := C.CString(out)
	defer C.free(unsafe.Pointer(path))
	w, h := o.pageSize()
	id := register(done)
	msg := C.markgo_print_pdf(webview, path, C.double(w), C.double(h),
		C.double(o.Top), C.double(o.Bottom), C.double(o.Left), C.double(o.Right), C.uintptr_t(id))
	if msg != nil {
		unregister(id)
		return errors.New(C.GoString(msg))
	}
	return nil
}
