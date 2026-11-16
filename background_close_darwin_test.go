package main

import (
	"sync/atomic"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type backgroundCloseTestWindow struct {
	application.Window
	fullscreen bool
	exitCalls  int
	hideCalls  int
}

func (w *backgroundCloseTestWindow) IsFullscreen() bool { return w.fullscreen }
func (w *backgroundCloseTestWindow) UnFullscreen()      { w.exitCalls++ }
func (w *backgroundCloseTestWindow) Hide() application.Window {
	w.hideCalls++
	return w
}

func TestBackgroundCloseWaitsForFullscreenExit(t *testing.T) {
	w := &backgroundCloseTestWindow{fullscreen: true}
	var closing atomic.Bool
	hideWindowToBackground(w, &closing)
	hideWindowToBackground(w, &closing)
	if w.exitCalls != 1 || w.hideCalls != 0 {
		t.Fatalf("全屏关闭前：退出全屏 %d 次，隐藏 %d 次", w.exitCalls, w.hideCalls)
	}
	finishBackgroundClose(w, &closing)
	finishBackgroundClose(w, &closing)
	if w.hideCalls != 1 || closing.Load() {
		t.Fatalf("退出全屏后：隐藏 %d 次，关闭中状态 %v", w.hideCalls, closing.Load())
	}
}

func TestBackgroundCloseNormalWindowAndReopen(t *testing.T) {
	var closing atomic.Bool
	normal := &backgroundCloseTestWindow{}
	hideWindowToBackground(normal, &closing)
	if normal.hideCalls != 1 || normal.exitCalls != 0 {
		t.Fatalf("普通窗口：隐藏 %d 次，退出全屏 %d 次", normal.hideCalls, normal.exitCalls)
	}

	fullscreen := &backgroundCloseTestWindow{fullscreen: true}
	hideWindowToBackground(fullscreen, &closing)
	closing.Store(false) // showWindow 取消正在等待的后台关闭
	finishBackgroundClose(fullscreen, &closing)
	if fullscreen.hideCalls != 0 {
		t.Fatal("重新显示窗口后不应再次隐藏")
	}
}
