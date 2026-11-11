package fonts

import (
	"encoding/binary"
	"io"
	"sort"
	"strings"
	"unicode/utf16"

	"golang.org/x/text/encoding/charmap"
)

var be = binary.BigEndian

// Only read metadata. A broken kerning table or an unsupported outline format must
// not hide an otherwise installed font from the picker; the OS renders the glyphs.
func readMetadata(r io.ReaderAt) []Font {
	header := readBytes(r, 0, 12)
	if header == nil {
		return nil
	}
	offsets := []uint32{0}
	if string(header[:4]) == "ttcf" {
		count := be.Uint32(header[8:])
		if count == 0 || count > 4096 {
			return nil
		}
		data := readBytes(r, 12, int(count)*4)
		if data == nil {
			return nil
		}
		offsets = make([]uint32, count)
		for i := range offsets {
			offsets[i] = be.Uint32(data[i*4:])
		}
	}
	var result []Font
	for _, offset := range offsets {
		header := readBytes(r, int64(offset), 12)
		if header == nil {
			continue
		}
		switch string(header[:4]) {
		case "\x00\x01\x00\x00", "OTTO", "true", "typ1":
		default:
			continue
		}
		count := int(be.Uint16(header[4:]))
		if count == 0 || count > 4096 {
			continue
		}
		tables := readBytes(r, int64(offset)+12, count*16)
		if tables == nil {
			continue
		}
		var names []byte
		mono := false
		for i := 0; i < count; i++ {
			table := tables[i*16:]
			start, length := int64(be.Uint32(table[8:])), int(be.Uint32(table[12:]))
			switch string(table[:4]) {
			case "name":
				names = readBytes(r, start, length)
			case "post":
				if length >= 16 {
					if post := readBytes(r, start, 16); post != nil {
						mono = be.Uint32(post[12:]) != 0
					}
				}
			}
		}
		if font := parseNames(names); font.Family != "" && !strings.HasPrefix(font.Family, ".") {
			font.Monospace = mono
			result = append(result, font)
		}
	}
	return result
}

func readBytes(r io.ReaderAt, offset int64, length int) []byte {
	if offset < 0 || length <= 0 || length > 1<<20 {
		return nil
	}
	data := make([]byte, length)
	if _, err := r.ReadAt(data, offset); err != nil {
		return nil
	}
	return data
}

func utf16Name(data []byte) string {
	if len(data)%2 != 0 {
		return ""
	}
	units := make([]uint16, len(data)/2)
	for i := range units {
		units[i] = be.Uint16(data[i*2:])
	}
	return string(utf16.Decode(units))
}

func parseNames(data []byte) Font {
	var font Font
	if len(data) < 6 {
		return font
	}
	count, storage := int(be.Uint16(data[2:])), int(be.Uint16(data[4:]))
	if 6+count*12 > len(data) || storage < 6+count*12 || storage > len(data) {
		return font
	}
	stringAt := func(offset, length int) []byte {
		start := storage + offset
		if start > len(data) || length > len(data)-start {
			return nil
		}
		return data[start : start+length]
	}
	// Format 1 uses BCP 47 language tags instead of platform-specific language IDs.
	var tags []string
	if be.Uint16(data) == 1 {
		start := 6 + count*12
		if start+2 <= storage {
			n := int(be.Uint16(data[start:]))
			if start+2+n*4 <= storage {
				for i := 0; i < n; i++ {
					rec := data[start+2+i*4:]
					tags = append(tags, strings.ToLower(utf16Name(stringAt(int(be.Uint16(rec[2:])), int(be.Uint16(rec))))))
				}
			}
		}
	}
	bestFamily, bestChinese := -1, -1
	for i := 0; i < count; i++ {
		rec := data[6+i*12:]
		platform, encoding, language, id := be.Uint16(rec), be.Uint16(rec[2:]), be.Uint16(rec[4:]), be.Uint16(rec[6:])
		if id != 1 && id != 16 {
			continue
		}
		raw := stringAt(int(be.Uint16(rec[10:])), int(be.Uint16(rec[8:])))
		var name string
		switch {
		case platform == 0 || platform == 3 && (encoding == 0 || encoding == 1 || encoding == 10):
			name = utf16Name(raw)
		case platform == 1 && encoding == 0:
			name, _ = charmap.Macintosh.NewDecoder().String(string(raw))
		default:
			continue
		}
		name = strings.TrimSpace(strings.Trim(name, "\x00"))
		if name == "" || strings.ContainsAny(name, "\x00\r\n") {
			continue
		}
		font.Aliases = append(font.Aliases, name)
		score := 0
		if id == 16 {
			score += 10
		}
		english := platform == 3 && language&0x3ff == 9 || platform == 1 && language == 0
		chinese := platform == 3 && language&0x3ff == 4
		simplified := language == 0x0804 || language == 0x1004
		if language >= 0x8000 && int(language-0x8000) < len(tags) {
			tag := tags[language-0x8000]
			english = tag == "en" || strings.HasPrefix(tag, "en-")
			chinese = tag == "zh" || strings.HasPrefix(tag, "zh-")
			simplified = strings.Contains(tag, "hans") || tag == "zh-cn" || tag == "zh-sg"
		}
		familyScore := score
		if english {
			familyScore += 100
		} else if platform == 0 {
			familyScore += 50
		}
		if familyScore > bestFamily {
			font.Family = name
			bestFamily = familyScore
		}
		if chinese {
			if simplified {
				score += 20
			}
			if score > bestChinese {
				font.DisplayName = name
				bestChinese = score
			}
		}
	}
	if font.DisplayName == "" {
		font.DisplayName = font.Family
	}
	font.Aliases = uniqueNames(font.Aliases)
	return font
}

func uniqueNames(names []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(names))
	for _, name := range names {
		key := strings.ToLower(name)
		if !seen[key] {
			seen[key] = true
			result = append(result, name)
		}
	}
	sort.Strings(result)
	return result
}
