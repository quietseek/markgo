package main

import "testing"

func TestInitialWindowSize(t *testing.T) {
	for _, tc := range []struct {
		name                  string
		workWidth, workHeight int
		width, height         int
		minWidth, minHeight   int
	}{
		{"desktop work area", 1920, 1040, 1632, 884, 760, 520},
		{"scaled laptop", 1280, 680, 1088, 578, 760, 520},
		{"small display", 800, 600, 760, 520, 760, 520},
		{"below minimum", 640, 480, 640, 480, 640, 480},
		{"portrait", 900, 1560, 765, 1326, 760, 520},
		{"unavailable", 0, 0, 1320, 860, 760, 520},
		{"invalid", 1920, -1, 1320, 860, 760, 520},
	} {
		t.Run(tc.name, func(t *testing.T) {
			width, height, minWidth, minHeight := initialWindowSize(tc.workWidth, tc.workHeight)
			if width != tc.width || height != tc.height || minWidth != tc.minWidth || minHeight != tc.minHeight {
				t.Fatalf("got %dx%d (minimum %dx%d), want %dx%d (minimum %dx%d)", width, height, minWidth, minHeight, tc.width, tc.height, tc.minWidth, tc.minHeight)
			}
		})
	}
}
