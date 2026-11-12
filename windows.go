package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"

	"github.com/quietseek/markgo/internal/settings"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func windowToken() string {
	var token [12]byte
	if _, err := rand.Read(token[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(token[:])
}

// Wails supplies the calling window through context; UI operations must never
// resolve against whichever window happened to have focus most recently.
func (b *Bridge) session(ctx context.Context) *Bridge {
	w, ok := ctx.Value(application.WindowKey).(*application.WebviewWindow)
	if !ok {
		return b
	}
	r := b.owner
	r.windowsMu.Lock()
	s := r.windows[w.ID()]
	r.windowsMu.Unlock()
	if s == nil {
		panic("window session is closed")
	}
	return s
}

func (b *Bridge) sessions() []*Bridge {
	r := b.owner
	r.windowsMu.Lock()
	defer r.windowsMu.Unlock()
	result := make([]*Bridge, 0, len(r.windows))
	for _, s := range r.windows {
		result = append(result, s)
	}
	return result
}

func (b *Bridge) activeSession() *Bridge {
	r := b.owner
	for _, s := range r.sessions() {
		if s.window.IsFocused() {
			r.windowsMu.Lock()
			r.focused = s
			r.windowsMu.Unlock()
			return s
		}
	}
	r.windowsMu.Lock()
	defer r.windowsMu.Unlock()
	if r.focused != nil {
		return r.focused
	}
	return r
}

func (b *Bridge) sessionSettings() settings.AppSettings {
	cfg := b.store.Get()
	b.openMu.Lock()
	defer b.openMu.Unlock()
	cfg.LastWorkspace, cfg.LastFile = b.workspace, b.lastFile
	if b.fresh {
		cfg.StartupOpen = "scratch"
	}
	return cfg
}

func (b *Bridge) newWindow(file, workspace string) *Bridge {
	r := b.owner
	s := newBridge(r.store)
	s.owner, s.app = r, r.app
	s.workspace, s.lastFile, s.pending = workspace, "", file
	s.fresh = true
	s.scratch = filepath.Join(r.store.Dir(), "scratch-"+windowToken()+".md")
	s.createWindow()
	return s
}

func (b *Bridge) NewWindow(ctx context.Context) {
	b = b.session(ctx)
	b.newWindow("", b.sessionSettings().LastWorkspace)
}

func (b *Bridge) FocusWindow(ctx context.Context) {
	s := b.session(ctx)
	b.owner.windowsMu.Lock()
	b.owner.focused = s
	b.owner.windowsMu.Unlock()
}

// Claim before reading a document, including startup and Save As. This closes
// the race where two windows simultaneously request the same unopened file.
func (b *Bridge) ClaimDocument(ctx context.Context, path string) bool {
	s := b.session(ctx)
	r := b.owner
	r.routeMu.Lock()
	defer r.routeMu.Unlock()
	key := pathKey(path)
	for _, other := range r.sessions() {
		if other == s {
			continue
		}
		other.openMu.Lock()
		owned := key != "" && (key == pathKey(other.document) || key == pathKey(other.lastFile) || key == pathKey(other.pending) || slices.ContainsFunc(other.openDocuments, func(p string) bool { return pathKey(p) == key }))
		other.openMu.Unlock()
		if owned {
			other.showWindow()
			return false
		}
	}
	s.openMu.Lock()
	s.document = path
	if !s.store.Get().ShowDocumentTabs {
		s.openDocuments = nil
	}
	if key != "" && !slices.ContainsFunc(s.openDocuments, func(p string) bool { return pathKey(p) == key }) {
		s.openDocuments = append(s.openDocuments, path)
	}
	s.openMu.Unlock()
	return true
}

// Release closed/hidden tabs while retaining the active document claim. Only
// previously claimed paths may be retained; this cannot claim another window's file.
func (b *Bridge) SetOpenDocuments(ctx context.Context, paths []string) {
	s := b.session(ctx)
	r := b.owner
	r.routeMu.Lock()
	defer r.routeMu.Unlock()
	s.openMu.Lock()
	defer s.openMu.Unlock()
	kept := []string{}
	for _, p := range s.openDocuments {
		if pathKey(p) == pathKey(s.document) || slices.ContainsFunc(paths, func(want string) bool { return pathKey(want) == pathKey(p) }) {
			kept = append(kept, p)
		}
	}
	s.openDocuments = kept
}

func pathKey(path string) string {
	if path == "" {
		return ""
	}
	if abs, err := filepath.Abs(path); err == nil {
		path = abs
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	path = filepath.Clean(path)
	if runtime.GOOS == "windows" {
		path = strings.ToLower(path)
	}
	return path
}

func (b *Bridge) moveDocumentClaims(from, to string) {
	r := b.owner
	r.routeMu.Lock()
	defer r.routeMu.Unlock()
	remap := func(p string) string {
		if p == "" {
			return p
		}
		old, key := pathKey(from), pathKey(p)
		if key == old {
			return to
		}
		if strings.HasPrefix(key, old+string(filepath.Separator)) {
			return filepath.Join(to, strings.TrimPrefix(key, old+string(filepath.Separator)))
		}
		return p
	}
	for _, s := range r.sessions() {
		s.openMu.Lock()
		s.document, s.lastFile, s.pending = remap(s.document), remap(s.lastFile), remap(s.pending)
		for i, p := range s.openDocuments {
			s.openDocuments[i] = remap(p)
		}
		s.openMu.Unlock()
		emitTo(s.window, "documents:moved", map[string]string{"from": from, "to": to})
	}
}

func withinWorkspace(file, workspace string) bool {
	if workspace == "" {
		return false
	}
	rel, err := filepath.Rel(pathKey(workspace), pathKey(file))
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// A cross-workspace file is governed by the workspace preference; files in the
// same workspace follow the file preference. An empty window is reused.
func openInNewWindow(cfg settings.AppSettings, file, workspace, kind, path string) bool {
	if kind == "workspace" {
		return workspace != "" && pathKey(workspace) != pathKey(path) && cfg.OpenWorkspaceMode == "new"
	}
	if file == "" && workspace == "" {
		return false
	}
	if workspace != "" && !withinWorkspace(path, workspace) {
		return cfg.OpenWorkspaceMode == "new"
	}
	return !cfg.ShowDocumentTabs && cfg.OpenFileMode == "new"
}

// RouteOpen returns true when a window already handles the request. Otherwise the
// caller loads it locally, after awaiting its pending save.
func (b *Bridge) RouteOpen(ctx context.Context, path, kind string, forceNew bool) (bool, error) {
	return b.session(ctx).routeOpen(path, kind, forceNew)
}

func (b *Bridge) routeOpen(path, kind string, forceNew bool) (bool, error) {
	if kind != "file" && kind != "workspace" {
		return false, errors.New("未知的打开类型")
	}
	st, err := os.Stat(path)
	if err != nil {
		return false, err
	}
	if st.IsDir() != (kind == "workspace") {
		return false, errors.New("文件或工作区类型不匹配")
	}
	path, err = filepath.Abs(path)
	if err != nil {
		return false, err
	}
	r := b.owner
	r.routeMu.Lock()
	defer r.routeMu.Unlock()
	key := pathKey(path)
	for _, s := range r.sessions() {
		cfg := s.sessionSettings()
		s.openMu.Lock()
		pending, document := s.pending, s.document
		inTab := slices.ContainsFunc(s.openDocuments, func(p string) bool { return pathKey(p) == key })
		s.openMu.Unlock()
		matches := kind == "file" && (key == pathKey(cfg.LastFile) || key == pathKey(pending) || key == pathKey(document) || inTab)
		matches = matches || kind == "workspace" && key == pathKey(cfg.LastWorkspace)
		if matches && s != b {
			if kind == "file" && key != pathKey(document) {
				s.openPath(path)
			}
			s.showWindow()
			return true, nil
		}
		if matches && s == b {
			s.showWindow()
			if kind == "file" && key != pathKey(document) {
				return false, nil
			}
			return true, nil
		}
	}
	cfg := b.sessionSettings()
	if forceNew || openInNewWindow(cfg, cfg.LastFile, cfg.LastWorkspace, kind, path) {
		if kind == "workspace" {
			b.newWindow("", path)
		} else {
			workspace := cfg.LastWorkspace
			if !withinWorkspace(path, workspace) {
				workspace = filepath.Dir(path)
			}
			b.newWindow(path, workspace)
		}
		return true, nil
	}
	return false, nil
}

func (b *Bridge) openExternal(path string) {
	s := b.activeSession()
	s.openMu.Lock()
	starting := !s.ready && s.pending == ""
	s.openMu.Unlock()
	if starting && len(b.sessions()) == 1 {
		s.openPath(path)
		return
	}
	routed, err := s.routeOpen(path, "file", false)
	if err == nil && !routed {
		s.openPath(path)
	}
}

// Acknowledge saving before closing. Failure leaves the window and its document
// intact. The final window alone uses the close-to-background preference.
func (b *Bridge) CompleteClose(ctx context.Context, saved bool) {
	s := b.session(ctx)
	r := b.owner
	r.windowsMu.Lock()
	if r.quitPending != nil {
		if !r.quitPending[s.window.ID()] {
			r.windowsMu.Unlock()
			return
		}
		if !saved {
			r.quitCancelled = true
		}
		delete(r.quitPending, s.window.ID())
		done := len(r.quitPending) == 0
		quit := done && !r.quitCancelled
		if done {
			r.quitPending = nil
			r.quitCancelled = false
			if quit {
				r.quitting.Store(true)
			}
		}
		r.windowsMu.Unlock()
		if quit {
			r.app.Quit()
		}
		return
	}
	if !saved {
		r.windowsMu.Unlock()
		return
	}
	last := len(r.windows) == 1
	if last && r.store.Get().CloseAction == "background" {
		r.windowsMu.Unlock()
		s.window.Hide()
		return
	}
	if last {
		r.quitting.Store(true)
		r.windowsMu.Unlock()
		r.app.Quit()
		return
	}
	delete(r.windows, s.window.ID())
	if r.focused == s {
		for _, other := range r.windows {
			r.focused = other
			break
		}
	}
	r.windowsMu.Unlock()
	s.allowClose.Store(true)
	s.window.Close()
	go s.acp.Dispose()
}

func (b *Bridge) shouldQuit() bool {
	r := b.owner
	if r.quitting.Load() {
		return true
	}
	sessions := r.sessions()
	if len(sessions) == 0 {
		return true
	}
	r.windowsMu.Lock()
	if r.quitPending != nil {
		r.windowsMu.Unlock()
		return false
	}
	r.quitPending = make(map[uint]bool)
	for _, s := range sessions {
		r.quitPending[s.window.ID()] = true
	}
	r.windowsMu.Unlock()
	for _, s := range sessions {
		emitTo(s.window, "window:close-request", nil)
	}
	return false
}
