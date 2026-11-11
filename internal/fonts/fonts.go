// Package fonts discovers installed font families without loading entire font files into memory.
package fonts

import (
	"context"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

type Font struct {
	Family      string   `json:"family"`
	DisplayName string   `json:"displayName"`
	Aliases     []string `json:"aliases"`
	Monospace   bool     `json:"monospace"`
}

func List() []Font {
	home, _ := os.UserHomeDir()
	var dirs []string
	switch runtime.GOOS {
	case "windows":
		if root := os.Getenv("WINDIR"); root != "" {
			dirs = append(dirs, filepath.Join(root, "Fonts"))
		}
		if local := os.Getenv("LOCALAPPDATA"); local != "" {
			dirs = append(dirs, filepath.Join(local, "Microsoft", "Windows", "Fonts"))
		}
	case "darwin":
		dirs = []string{"/System/Library/Fonts", "/Library/Fonts"}
		if home != "" {
			dirs = append(dirs, filepath.Join(home, "Library", "Fonts"))
		}
	default:
		dirs = []string{"/usr/share/fonts", "/usr/local/share/fonts"}
		if home != "" {
			dirs = append(dirs, filepath.Join(home, ".fonts"), filepath.Join(home, ".local", "share", "fonts"))
		}
		if data := os.Getenv("XDG_DATA_HOME"); data != "" {
			dirs = append(dirs, filepath.Join(data, "fonts"))
		}
	}
	paths := map[string]bool{}
	for _, path := range registeredPaths() {
		paths[path] = true
	}
	// Fontconfig also knows about custom directories and symlinked fonts on Linux.
	if runtime.GOOS == "linux" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if out, err := exec.CommandContext(ctx, "fc-list", "--format=%{file}\n").Output(); err == nil {
			for _, path := range strings.Split(string(out), "\n") {
				if path != "" {
					paths[path] = true
				}
			}
		}
	}
	for _, dir := range dirs {
		_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err == nil && !d.IsDir() {
				switch strings.ToLower(filepath.Ext(path)) {
				case ".ttf", ".otf", ".ttc", ".otc":
					paths[path] = true
				}
			}
			return nil
		})
	}
	families := map[string]Font{}
	orderedPaths := make([]string, 0, len(paths))
	for path := range paths {
		orderedPaths = append(orderedPaths, path)
	}
	sort.Strings(orderedPaths)
	for _, path := range orderedPaths {
		for _, font := range readFile(path) {
			key := strings.ToLower(font.Family)
			if prev, ok := families[key]; ok {
				font.Family = prev.Family
				font.Monospace = font.Monospace || prev.Monospace
				font.Aliases = uniqueNames(append(font.Aliases, prev.Aliases...))
				if strings.EqualFold(font.DisplayName, font.Family) && prev.DisplayName != "" {
					font.DisplayName = prev.DisplayName
				}
			}
			families[key] = font
		}
	}
	result := make([]Font, 0, len(families))
	for _, font := range families {
		result = append(result, font)
	}
	sort.Slice(result, func(i, j int) bool { return strings.ToLower(result[i].Family) < strings.ToLower(result[j].Family) })
	return result
}

func readFile(path string) []Font {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	return readMetadata(f)
}
