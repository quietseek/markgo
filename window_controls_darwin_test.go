package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type windowControlTestWindow struct {
	application.Window
	fullscreen   bool
	unfullscreen int
	maximise     int
}

func (w *windowControlTestWindow) IsFullscreen() bool { return w.fullscreen }
func (w *windowControlTestWindow) UnFullscreen()      { w.unfullscreen++ }
func (w *windowControlTestWindow) ToggleMaximise()    { w.maximise++ }

func TestMacWindowMaximizeButton(t *testing.T) {
	for _, tc := range []struct {
		name                      string
		fullscreen                bool
		wantUnfullscreen, wantMax int
	}{
		{"全屏时退出全屏", true, 1, 0},
		{"窗口模式时切换最大化", false, 0, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := &windowControlTestWindow{fullscreen: tc.fullscreen}
			toggleWindowMaximize(w)
			if w.unfullscreen != tc.wantUnfullscreen || w.maximise != tc.wantMax {
				t.Errorf("退出全屏 %d 次，切换最大化 %d 次；期望 %d 次、%d 次", w.unfullscreen, w.maximise, tc.wantUnfullscreen, tc.wantMax)
			}
		})
	}
}
