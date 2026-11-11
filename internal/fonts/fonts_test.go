package fonts

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/image/font/gofont/gomono"
	"golang.org/x/image/font/gofont/goregular"
)

func TestReadFontFamilies(t *testing.T) {
	for _, tc := range []struct {
		name   string
		data   []byte
		family string
		mono   bool
	}{
		{"regular.ttf", goregular.TTF, "Go", false},
		{"mono.ttf", gomono.TTF, "Go Mono", true},
		{"broken.ttf", []byte("not a font"), "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), tc.name)
			if err := os.WriteFile(path, tc.data, 0600); err != nil {
				t.Fatal(err)
			}
			fonts := readFile(path)
			if tc.family == "" {
				if len(fonts) != 0 {
					t.Fatalf("malformed font accepted: %+v", fonts)
				}
				return
			}
			if len(fonts) != 1 || fonts[0].Family != tc.family || fonts[0].Monospace != tc.mono {
				t.Fatalf("fonts = %+v", fonts)
			}
		})
	}
}

func TestReadCollection(t *testing.T) {
	// Windows Chinese system fonts commonly use TTC; include both families in one file.
	data := make([]byte, 20)
	copy(data, "ttcf")
	binary.BigEndian.PutUint32(data[4:], 0x00010000)
	binary.BigEndian.PutUint32(data[8:], 2)
	for i, source := range [][]byte{goregular.TTF, gomono.TTF} {
		for len(data)%4 != 0 {
			data = append(data, 0)
		}
		offset := len(data)
		binary.BigEndian.PutUint32(data[12+i*4:], uint32(offset))
		font := append([]byte(nil), source...)
		for j := 0; j < int(binary.BigEndian.Uint16(font[4:])); j++ {
			entry := font[12+j*16+8:]
			binary.BigEndian.PutUint32(entry, binary.BigEndian.Uint32(entry)+uint32(offset))
		}
		data = append(data, font...)
	}
	path := filepath.Join(t.TempDir(), "families.ttc")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	fonts := readFile(path)
	if len(fonts) != 2 || fonts[0].Family != "Go" || fonts[1].Family != "Go Mono" {
		t.Fatalf("fonts = %+v", fonts)
	}
}
