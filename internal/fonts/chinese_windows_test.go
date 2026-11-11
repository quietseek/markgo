package fonts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstalledKaiTiIsSearchableInChinese(t *testing.T) {
	if _, err := os.Stat(filepath.Join(os.Getenv("WINDIR"), "Fonts", "simkai.ttf")); err != nil {
		t.Skip("KaiTi is not installed on this machine")
	}
	list := List()
	var kai []string
	for _, font := range list {
		if strings.Contains(font.DisplayName, "楷") {
			return
		}
		if strings.Contains(strings.ToLower(font.Family), "kai") {
			kai = append(kai, font.Family)
		}
	}
	t.Fatalf("Chinese KaiTi missing from %d font families; English matches: %v", len(list), kai)
}

func TestRegisteredFontsAreListed(t *testing.T) {
	listed := map[string]bool{}
	for _, font := range List() {
		listed[strings.ToLower(font.Family)] = true
	}
	for _, path := range registeredPaths() {
		for _, font := range readFile(path) {
			if !listed[strings.ToLower(font.Family)] {
				t.Errorf("registered font %s omitted from list (%s)", font.Family, path)
			}
		}
	}
}
