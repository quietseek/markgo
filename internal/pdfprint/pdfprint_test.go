package pdfprint

import (
	"testing"
	"unsafe"
)

type inner struct{ webview unsafe.Pointer }
type outer struct{ impl any }

func TestNativeField(t *testing.T) {
	x := 1
	v := &outer{impl: &inner{webview: unsafe.Pointer(&x)}}
	if p := nativeField(v, "impl", "webview"); p != unsafe.Pointer(&x) {
		t.Fatalf("got %v", p)
	}
	if p := nativeField(v, "impl", "missing"); p != nil {
		t.Fatal("missing field should be nil")
	}
	if p := nativeField(&outer{}, "impl", "webview"); p != nil {
		t.Fatal("nil interface should be nil")
	}
}

func TestValidate(t *testing.T) {
	a4 := PaperSizes["a4"]
	ok := Options{Width: a4[0], Height: a4[1], Top: 25.4, Bottom: 25.4, Left: 31.8, Right: 31.8}
	if err := ok.Validate(); err != nil {
		t.Fatal(err)
	}
	if w, h := (Options{Width: 210, Height: 297, Landscape: true}).pageSize(); w != 297 || h != 210 {
		t.Fatal("landscape not swapped")
	}
	for _, bad := range []Options{
		{Width: 210, Height: 297, Top: -1},
		{Width: 210, Height: 297, Left: 100, Right: 100},
		{Width: 0, Height: 297},
	} {
		if bad.Validate() == nil {
			t.Fatalf("%+v accepted", bad)
		}
	}
}
