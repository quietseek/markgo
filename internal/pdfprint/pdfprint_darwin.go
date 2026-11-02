//go:build darwin && cgo

package pdfprint

// macOS：用 WKWebView 的打印操作把页面存储为 PDF（NSPrintSaveJob，不显示打印面板）

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework WebKit
#include <stdint.h>
#include <stdlib.h>
const char *markgoPrintPDF(void *window, const char *path, double width, double height,
	double top, double bottom, double left, double right, uintptr_t id);
*/
import "C"

import (
	"errors"
	"unsafe"
)

//export markgoPrintPDFDone
func markgoPrintPDFDone(id C.uintptr_t, ok C.int) {
	if ok != 0 {
		finish(uintptr(id), nil)
	} else {
		finish(uintptr(id), errors.New("导出 PDF 失败，请检查保存位置是否可写"))
	}
}

func start(win Window, out string, o Options, done chan<- error) error {
	window := win.NativeWindow()
	if window == nil {
		return ErrUnsupported
	}
	path := C.CString(out)
	defer C.free(unsafe.Pointer(path))
	w, h := o.pageSize()
	id := register(done)
	msg := C.markgoPrintPDF(window, path, C.double(mmToPoint(w)), C.double(mmToPoint(h)),
		C.double(mmToPoint(o.Top)), C.double(mmToPoint(o.Bottom)), C.double(mmToPoint(o.Left)), C.double(mmToPoint(o.Right)), C.uintptr_t(id))
	if msg != nil {
		unregister(id)
		return errors.New(C.GoString(msg))
	}
	return nil
}
