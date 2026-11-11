package fonts

import (
	"bytes"
	"encoding/binary"
	"slices"
	"testing"
	"unicode/utf16"
)

type nameRecord struct {
	platform, encoding, language, id uint16
	text                             string
}

func nameTable(records ...nameRecord) []byte {
	data := make([]byte, 6+12*len(records))
	binary.BigEndian.PutUint16(data[2:], uint16(len(records)))
	binary.BigEndian.PutUint16(data[4:], uint16(len(data)))
	var strings []byte
	for i, record := range records {
		rec := data[6+12*i:]
		for j, v := range []uint16{record.platform, record.encoding, record.language, record.id} {
			binary.BigEndian.PutUint16(rec[j*2:], v)
		}
		start := len(strings)
		for _, unit := range utf16.Encode([]rune(record.text)) {
			strings = binary.BigEndian.AppendUint16(strings, unit)
		}
		binary.BigEndian.PutUint16(rec[8:], uint16(len(strings)-start))
		binary.BigEndian.PutUint16(rec[10:], uint16(start))
	}
	return append(data, strings...)
}

func TestLocalizedFamilyNames(t *testing.T) {
	names := nameTable(
		nameRecord{3, 1, 0x409, 1, "KaiTi"},
		nameRecord{3, 1, 0x804, 1, "楷体"},
		nameRecord{3, 1, 0x404, 1, "楷體"},
	)
	font := parseNames(names)
	if font.Family != "KaiTi" || font.DisplayName != "楷体" || !slices.Equal(font.Aliases, []string{"KaiTi", "楷体", "楷體"}) {
		t.Fatalf("font = %+v", font)
	}
}

func TestTypographicAndUnicodeFamilyNames(t *testing.T) {
	font := parseNames(nameTable(
		nameRecord{3, 1, 0x409, 1, "Example Medium"},
		nameRecord{3, 10, 0x409, 16, "Example"},
		nameRecord{3, 10, 0x804, 16, "示例𠮷体"},
		nameRecord{0, 4, 0, 16, "Example"},
	))
	if font.Family != "Example" || font.DisplayName != "示例𠮷体" || len(font.Aliases) != 3 {
		t.Fatalf("font = %+v", font)
	}
	if font := parseNames(nameTable(nameRecord{0, 4, 0, 1, "Unicode Only"})); font.Family != "Unicode Only" {
		t.Fatalf("Unicode platform ignored: %+v", font)
	}
}

func TestMetadataWithoutSupportedGlyphTables(t *testing.T) {
	// A font picker only needs the name/post tables, not a glyph rasterizer.
	names := nameTable(nameRecord{3, 1, 0x409, 1, "Metadata Font"}, nameRecord{3, 1, 0x804, 1, "元数据字体"})
	data := make([]byte, 28)
	copy(data, "OTTO")
	binary.BigEndian.PutUint16(data[4:], 1)
	copy(data[12:], "name")
	binary.BigEndian.PutUint32(data[20:], 28)
	binary.BigEndian.PutUint32(data[24:], uint32(len(names)))
	data = append(data, names...)
	fonts := readMetadata(bytes.NewReader(data))
	if len(fonts) != 1 || fonts[0].DisplayName != "元数据字体" {
		t.Fatalf("fonts = %+v", fonts)
	}
	// Reject truncated and out-of-bounds metadata instead of panicking or allocating excessively.
	for i := 0; i < len(data); i++ {
		if fonts := readMetadata(bytes.NewReader(data[:i])); len(fonts) != 0 {
			t.Fatalf("accepted truncated metadata at %d", i)
		}
	}
	binary.BigEndian.PutUint32(data[24:], 0xffffffff)
	if fonts := readMetadata(bytes.NewReader(data)); len(fonts) != 0 {
		t.Fatal("accepted excessive table length")
	}
}

func TestMalformedNameRecords(t *testing.T) {
	valid := nameTable(nameRecord{3, 1, 0x804, 1, "楷体"})
	for i := 0; i < len(valid); i++ {
		if font := parseNames(valid[:i]); font.Family != "" {
			t.Fatalf("accepted truncated name at %d", i)
		}
	}
	for _, index := range []int{2, 4, 14, 16} {
		bad := slices.Clone(valid)
		binary.BigEndian.PutUint16(bad[index:], 0xffff)
		if font := parseNames(bad); font.Family != "" {
			t.Fatalf("accepted bad offset at %d: %+v", index, font)
		}
	}
}
