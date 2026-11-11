package fonts

import (
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

// Registered fonts may live outside the two standard font folders (e.g. Office fonts).
func registeredPaths() []string {
	var paths []string
	for _, root := range []registry.Key{registry.LOCAL_MACHINE, registry.CURRENT_USER} {
		for _, view := range []uint32{registry.WOW64_64KEY, registry.WOW64_32KEY} {
			key, err := registry.OpenKey(root, `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`, registry.READ|view)
			if err != nil {
				continue
			}
			paths = append(paths, registeredFontFiles(key, view, 0)...)
			key.Close()
		}
	}
	return paths
}

func registeredFontFiles(key registry.Key, view uint32, depth int) []string {
	var paths []string
	names, _ := key.ReadValueNames(-1)
	for _, name := range names {
		path, kind, err := key.GetStringValue(name)
		if err != nil || path == "" {
			continue
		}
		if kind == registry.EXPAND_SZ {
			if expanded, err := registry.ExpandString(path); err == nil {
				path = expanded
			}
		}
		if filepath.IsAbs(path) {
			paths = append(paths, path)
		} else {
			for _, dir := range []string{filepath.Join(os.Getenv("WINDIR"), "Fonts"), filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Windows", "Fonts")} {
				paths = append(paths, filepath.Join(dir, path))
			}
		}
	}
	if depth < 4 {
		subkeys, _ := key.ReadSubKeyNames(-1)
		for _, name := range subkeys {
			child, err := registry.OpenKey(key, name, registry.READ|view)
			if err != nil {
				continue
			}
			paths = append(paths, registeredFontFiles(child, view, depth+1)...)
			child.Close()
		}
	}
	return paths
}
